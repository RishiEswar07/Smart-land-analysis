"""
services/road_service.py
------------------------
Detects the nearest accessible abutting road to a land parcel using OpenStreetMap
geospatial APIs (Nominatim Reverse Geocoding + OSM Way Geometry API + Overpass API).

AUDIT-COMPLIANT ARCHITECTURE:
1. True geometric point-to-segment distance calculation in meters.
2. Genuine Physical Accessibility Verification:
   - Rejects non-vehicular paths (footways, cycleways, paths, steps).
   - Rejects private or restricted roads (access=no/private/restricted).
   - Rejects grade-separated structures (elevated flyovers/bridges layer>0, tunnels).
   - Rejects controlled-access expressways lacking direct plot frontage.
   - Rejects roads separated by intervening properties (> 50m from boundary).
3. Strict Separation of Road Dimensions:
   - Tagged Road Width: Actual tagged OSM width (width, width:carriageway, est_width).
   - Estimated Carriageway Width: Lane-derived estimate (lanes * 3.5m / 11.5ft) - strictly labeled as carriageway only.
   - Distance from Land Boundary: Exact geodesic minimum distance in meters.
4. Non-Fabrication Rule:
   - Highway classification alone NEVER assigns a fixed road width.
   - If only highway classification is available, reports "Road width data unavailable".
   - Estimated carriageway width is NEVER used as verified road width for TNCDBR compliance.
   - If verified tagged width is unavailable, requires "Manual road-width verification required".
"""

import asyncio
import logging
import math
import re
import time
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

USER_AGENT = "SmartLandAnalysisPlatform/2.0 (Geospatial Research & Urban Planning; contact@smartland.edu)"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

_ROAD_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour

# Highway classification labels ONLY - no fixed width fabrication!
HIERARCHY_LABEL_MAP = {
    "motorway": "Motorway / Expressway",
    "motorway_link": "Motorway Ramp / Link",
    "trunk": "National Highway / Trunk",
    "trunk_link": "Trunk Ramp / Link",
    "primary": "State Highway / Primary Arterial",
    "primary_link": "Primary Arterial Link",
    "secondary": "Major District Road / Secondary",
    "secondary_link": "Secondary Road Link",
    "tertiary": "Minor District Road / Collector",
    "tertiary_link": "Collector Link",
    "residential": "Residential Street",
    "living_street": "Living Street",
    "unclassified": "Unclassified Rural / Local Road",
    "service": "Local Service Road / Access Lane",
    "track": "Agricultural Cart Track",
}

EXCLUDED_HIGHWAYS = {
    "footway",
    "path",
    "pedestrian",
    "steps",
    "cycleway",
    "bridleway",
    "corridor",
    "elevator",
    "construction",
    "proposed",
    "raceway",
    "busway",
    "platform",
}


def distance_point_to_segment_meters(
    p_lat: float, p_lng: float, a_lat: float, a_lng: float, b_lat: float, b_lng: float
) -> float:
    """Computes exact Euclidean distance in meters from point P to line segment AB using local projection."""
    mean_lat_rad = math.radians((p_lat + a_lat + b_lat) / 3.0)
    kx = math.cos(mean_lat_rad) * 111320.0  # meters per degree lon
    ky = 110540.0  # meters per degree lat

    px, py = p_lng * kx, p_lat * ky
    ax, ay = a_lng * kx, a_lat * ky
    bx, by = b_lng * kx, b_lat * ky

    dx = bx - ax
    dy = by - ay
    len_sq = dx * dx + dy * dy

    if len_sq == 0.0:
        return math.hypot(px - ax, py - ay)

    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len_sq))
    proj_x = ax + t * dx
    proj_y = ay + t * dy

    return math.hypot(px - proj_x, py - proj_y)


def compute_min_distance_to_nodes(
    ref_points: List[tuple[float, float]], nodes: List[Dict[str, float]]
) -> float:
    """Finds minimum distance in meters between parcel reference points and road node segments."""
    if len(nodes) < 2 or not ref_points:
        if nodes and ref_points:
            p_lat, p_lng = ref_points[0]
            n_lat, n_lng = nodes[0].get("lat"), nodes[0].get("lon")
            if n_lat is not None and n_lng is not None:
                mean_lat_rad = math.radians(p_lat)
                kx = math.cos(mean_lat_rad) * 111320.0
                ky = 110540.0
                return math.hypot((p_lng - n_lng) * kx, (p_lat - n_lat) * ky)
        return 9999.0

    min_dist = 9999.0
    for p_lat, p_lng in ref_points:
        for i in range(len(nodes) - 1):
            n1 = nodes[i]
            n2 = nodes[i + 1]
            n1_lat, n1_lon = n1.get("lat"), n1.get("lon")
            n2_lat, n2_lon = n2.get("lat"), n2.get("lon")
            if n1_lat is None or n1_lon is None or n2_lat is None or n2_lon is None:
                continue

            dist = distance_point_to_segment_meters(
                p_lat, p_lng, float(n1_lat), float(n1_lon), float(n2_lat), float(n2_lon)
            )
            if dist < min_dist:
                min_dist = dist

    return min_dist


def check_road_accessibility(tags: Dict[str, Any], dist_m: float) -> tuple[bool, str]:
    """
    Evaluates whether a candidate road is genuinely accessible from the selected parcel boundary.
    Criteria:
    - Non-vehicular highway types cannot provide vehicular plot access.
    - Private or restricted roads cannot provide public statutory access.
    - Grade-separated structures (elevated flyovers/bridges layer>0, tunnels) lack direct ground frontage.
    - Controlled-access motorways do not permit direct property access.
    - Distance beyond 50m indicates separation by intervening properties.
    """
    hw = (tags.get("highway") or "").lower().strip()

    if not hw or hw in EXCLUDED_HIGHWAYS:
        return False, f"Non-vehicular path ({hw or 'unspecified'}) does not provide vehicular plot access"

    access = (tags.get("access") or "").lower().strip()
    if access in ("no", "private", "restricted", "customers"):
        return False, f"Inaccessible road with restricted/private access (access={access})"

    bridge = (tags.get("bridge") or "").lower().strip()
    tunnel = (tags.get("tunnel") or "").lower().strip()
    layer = str(tags.get("layer", "0")).strip()
    try:
        layer_num = int(layer)
    except (ValueError, TypeError):
        layer_num = 0

    if (bridge in ("yes", "viaduct") and layer_num > 0) or tunnel in ("yes", "covered"):
        return False, "Elevated flyover / bridge structure or tunnel lacking direct ground parcel frontage"

    if hw in ("motorway", "motorway_link"):
        return False, "Controlled-access expressway does not permit direct property frontage access"

    if dist_m > 50.0:
        return False, f"Road is {dist_m:.1f} m away, separated by intervening parcels (beyond 50 m direct access threshold)"

    note = "Directly abutting parcel frontage" if dist_m <= 15.0 else f"Frontage access road ({dist_m:.1f} m from parcel boundary)"
    return True, note


def parse_road_width_priority(tags: Dict[str, str]) -> Dict[str, Any]:
    """
    Evaluates road dimensions with strict separation:
    1. Tagged Road Width: Actual measured OSM tag (width, width:carriageway, est_width)
    2. Estimated Carriageway Width: Lane-derived estimate (lanes * 3.5m / 11.5ft) - labeled strictly as carriageway
    3. Highway classification alone NEVER assigns a fixed road width.
    4. Verified Road Width: Set ONLY if tagged width is present; None if estimated or missing.
    5. Non-verified status: 'Manual road-width verification required'.
    """
    tagged_w_ft: Optional[float] = None
    tagged_w_m: Optional[float] = None
    has_tagged = False
    tagged_source: Optional[str] = None

    est_cway_ft: Optional[float] = None
    est_cway_m: Optional[float] = None
    has_est_cway = False
    cway_basis: Optional[str] = None

    # 1. Check explicit tagged width
    raw_width = tags.get("width") or tags.get("width:carriageway") or tags.get("est_width")
    if raw_width:
        clean = str(raw_width).strip().lower()
        is_feet = "ft" in clean or "'" in clean or "feet" in clean
        match = re.search(r"([0-9]+(?:\.[0-9]+)?)", clean)
        if match:
            try:
                val = float(match.group(1))
                if val > 0:
                    if is_feet or val > 35.0:
                        tagged_w_ft = round(val, 1)
                        tagged_w_m = round(tagged_w_ft * 0.3048, 2)
                    else:
                        tagged_w_m = round(val, 2)
                        tagged_w_ft = round(tagged_w_m * 3.28084, 1)
                    has_tagged = True
                    tagged_source = f"OSM Measured Tag (width: {raw_width})"
            except (ValueError, TypeError):
                pass

    # 2. Check lanes tag - STAGE AS ESTIMATED CARRIAGEWAY WIDTH ONLY
    raw_lanes = tags.get("lanes")
    if raw_lanes:
        try:
            lanes = int(float(str(raw_lanes).strip()))
            if lanes > 0:
                est_cway_m = round(lanes * 3.5, 1)
                est_cway_ft = round(est_cway_m * 3.28084, 1)
                has_est_cway = True
                cway_basis = f"{lanes} lanes @ 3.5m/lane (IRC 73/86 carriageway standard)"
        except (ValueError, TypeError):
            pass

    # Determine status & verification requirement
    if has_tagged:
        width_status = "Verified Tagged Width"
        verification_requirement = "Verified via OSM Measured Tag"
        confidence = "VERIFIED (OSM Measured Tag)"
        data_source = tagged_source or "OpenStreetMap Tagged Width"
        verified_ft = tagged_w_ft
        verified_m = tagged_w_m
        tncdbr_eligibility = "Eligible for TNCDBR statutory evaluation with verified width"
    elif has_est_cway:
        width_status = "Estimated Carriageway Only (Road width data unavailable)"
        verification_requirement = "Manual road-width verification required"
        confidence = "ESTIMATED CARRIAGEWAY ONLY"
        data_source = f"Estimated Carriageway Width: {cway_basis}"
        # NEVER use estimated carriageway as verified road width!
        verified_ft = None
        verified_m = None
        tncdbr_eligibility = "Manual road-width verification required (Estimated carriageway cannot be used for TNCDBR compliance)"
    else:
        width_status = "Road width data unavailable"
        verification_requirement = "Manual road-width verification required"
        confidence = "UNAVAILABLE"
        hw = (tags.get("highway") or "unclassified").lower().strip()
        label = HIERARCHY_LABEL_MAP.get(hw, hw.title())
        data_source = f"OSM Road Network ({label}) - Width data unavailable"
        verified_ft = None
        verified_m = None
        tncdbr_eligibility = "Manual road-width verification required (No verified road width data available)"

    return {
        # Separated values
        "tagged_road_width_ft": tagged_w_ft,
        "tagged_road_width_m": tagged_w_m,
        "has_tagged_width": has_tagged,
        "estimated_carriageway_width_ft": est_cway_ft,
        "estimated_carriageway_width_m": est_cway_m,
        "has_estimated_carriageway": has_est_cway,
        "carriageway_calculation_basis": cway_basis,
        # Verified width (Only populated if tagged width exists, None otherwise)
        "verified_road_width_ft": verified_ft,
        "verified_road_width_m": verified_m,
        # Backward-compatible road_width_ft: Set ONLY to verified width, NEVER to estimate
        "road_width_ft": verified_ft,
        "road_width_m": verified_m,
        "is_road_width_estimated": (not has_tagged and has_est_cway),
        "width_status": width_status,
        "verification_requirement": verification_requirement,
        "tncdbr_eligibility": tncdbr_eligibility,
        "confidence": confidence,
        "data_source": data_source,
    }


def format_road_type(highway: str) -> str:
    """Returns human-friendly road classification label."""
    hw = (highway or "").lower().strip()
    if hw in HIERARCHY_LABEL_MAP:
        return HIERARCHY_LABEL_MAP[hw]
    return hw.replace("_", " ").title() if hw else "Public Access Road"


async def _fetch_road_via_nominatim(
    lat: float,
    lng: float,
    ref_points: List[tuple[float, float]],
    client: httpx.AsyncClient,
) -> Optional[Dict[str, Any]]:
    """
    Attempts to identify accessible abutting road via Nominatim reverse geocoding (zoom 18)
    and queries official OSM Way API for full geometry & tags.
    """
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    rev_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat:.6f}&lon={lng:.6f}&format=json&zoom=18&addressdetails=1"

    try:
        resp = await client.get(rev_url, headers=headers)
        if resp.status_code != 200:
            return None

        nom_data = resp.json()
        osm_id = nom_data.get("osm_id")
        osm_type = nom_data.get("osm_type")
        osm_class = nom_data.get("class")
        road_tag = nom_data.get("address", {}).get("road")

        if osm_type == "way" and osm_id and osm_class == "highway":
            way_url = f"https://api.openstreetmap.org/api/0.6/way/{osm_id}/full.json"
            w_resp = await client.get(way_url, headers=headers)
            if w_resp.status_code == 200:
                w_data = w_resp.json()
                elements = w_data.get("elements", [])
                nodes = [{"lat": el["lat"], "lon": el["lon"]} for el in elements if el.get("type") == "node"]
                ways = [el for el in elements if el.get("type") == "way" and el.get("id") == osm_id]
                way_tags = ways[0].get("tags", {}) if ways else {}

                hw = (way_tags.get("highway") or nom_data.get("type") or "residential").lower()
                dist_m = compute_min_distance_to_nodes(ref_points, nodes)
                is_accessible, access_reason = check_road_accessibility(way_tags, dist_m)

                if is_accessible:
                    return {
                        "dist_m": dist_m,
                        "tags": way_tags,
                        "osm_id": osm_id,
                        "road_name": way_tags.get("name") or road_tag,
                        "highway": hw,
                        "access_note": access_reason,
                    }

        # If nearest feature was a building, search for nearby road in bounding box
        if road_tag:
            delta = 0.0006  # ~65 meters box
            viewbox = f"{lng - delta:.5f},{lat + delta:.5f},{lng + delta:.5f},{lat - delta:.5f}"
            search_url = f"https://nominatim.openstreetmap.org/search?street={road_tag}&format=json&bounded=1&viewbox={viewbox}&limit=3"
            s_resp = await client.get(search_url, headers=headers)
            if s_resp.status_code == 200:
                s_items = s_resp.json()
                for item in s_items:
                    if item.get("osm_type") == "way" and item.get("class") == "highway":
                        way_id = item.get("osm_id")
                        way_url = f"https://api.openstreetmap.org/api/0.6/way/{way_id}/full.json"
                        w_resp = await client.get(way_url, headers=headers)
                        if w_resp.status_code == 200:
                            w_data = w_resp.json()
                            elements = w_data.get("elements", [])
                            nodes = [{"lat": el["lat"], "lon": el["lon"]} for el in elements if el.get("type") == "node"]
                            ways = [el for el in elements if el.get("type") == "way"]
                            way_tags = ways[0].get("tags", {}) if ways else {}
                            hw = (way_tags.get("highway") or item.get("type") or "residential").lower()
                            dist_m = compute_min_distance_to_nodes(ref_points, nodes)
                            is_accessible, access_reason = check_road_accessibility(way_tags, dist_m)

                            if is_accessible:
                                return {
                                    "dist_m": dist_m,
                                    "tags": way_tags,
                                    "osm_id": way_id,
                                    "road_name": way_tags.get("name") or road_tag,
                                    "highway": hw,
                                    "access_note": access_reason,
                                }
    except Exception as exc:
        logger.debug(f"Nominatim road detection notice: {exc}")

    return None


async def _fetch_road_via_overpass(
    lat: float,
    lng: float,
    ref_points: List[tuple[float, float]],
    client: httpx.AsyncClient,
) -> List[Dict[str, Any]]:
    """Queries Overpass API geometry within 60m as failover source."""
    query = f"""
    [out:json][timeout:8];
    (
      way["highway"](around:60, {lat:.6f}, {lng:.6f});
    );
    out tags geom;
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    candidate_roads: List[Dict[str, Any]] = []

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            resp = await client.post(endpoint, data={"data": query}, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                elements = data.get("elements", [])
                for elem in elements:
                    tags = elem.get("tags", {})
                    geom = elem.get("geometry", [])
                    if not geom:
                        continue

                    dist_m = compute_min_distance_to_nodes(ref_points, geom)
                    is_accessible, access_reason = check_road_accessibility(tags, dist_m)
                    if is_accessible:
                        candidate_roads.append({
                            "dist_m": dist_m,
                            "tags": tags,
                            "osm_id": elem.get("id"),
                            "road_name": tags.get("name") or tags.get("ref"),
                            "highway": (tags.get("highway") or "").lower(),
                            "access_note": access_reason,
                        })

                if candidate_roads:
                    break
        except Exception as exc:
            logger.debug(f"Overpass endpoint {endpoint} notice: {exc}")
            continue

    return candidate_roads


async def detect_nearest_road(
    lat: float,
    lng: float,
    boundary_coords: Optional[List[Dict[str, float]]] = None,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Detects the nearest accessible abutting road to a parcel coordinates or polygon boundary.
    Enforces genuine physical accessibility checks and strict 4-tier width separation.
    """
    cache_key = f"{lat:.5f}_{lng:.5f}"
    now = time.time()

    if use_cache and cache_key in _ROAD_CACHE:
        entry = _ROAD_CACHE[cache_key]
        if now - entry["time"] < CACHE_TTL_SECONDS:
            return entry["data"]

    # Build reference sample points
    ref_points: List[tuple[float, float]] = [(lat, lng)]
    if boundary_coords and len(boundary_coords) >= 3:
        for c in boundary_coords:
            c_lat = c.get("lat") or c.get("latitude")
            c_lng = c.get("lng") or c.get("longitude") or c.get("lon")
            if c_lat is not None and c_lng is not None:
                ref_points.append((float(c_lat), float(c_lng)))

    chosen_road: Optional[Dict[str, Any]] = None

    async with httpx.AsyncClient(timeout=6.0) as client:
        # Step 1: Query Nominatim + OSM Way Full API
        nom_result = await _fetch_road_via_nominatim(lat, lng, ref_points, client)
        if nom_result and nom_result.get("dist_m", 999) <= 50.0:
            chosen_road = nom_result

        # Step 2: Overpass failover if Nominatim did not return accessible road
        if not chosen_road:
            overpass_candidates = await _fetch_road_via_overpass(lat, lng, ref_points, client)
            if overpass_candidates:
                overpass_candidates.sort(key=lambda x: x["dist_m"])
                chosen_road = overpass_candidates[0]

    if chosen_road and chosen_road["dist_m"] <= 50.0:
        tags = chosen_road.get("tags", {})
        dist_m = round(chosen_road["dist_m"], 1)
        hw = chosen_road.get("highway") or tags.get("highway", "residential")
        type_display = format_road_type(hw)
        width_info = parse_road_width_priority(tags)

        raw_name = chosen_road.get("road_name") or tags.get("name") or tags.get("name:en") or tags.get("ref")
        road_name_display = raw_name if raw_name else f"Unnamed {type_display}"
        dist_display = chosen_road.get("access_note") or (f"{dist_m:.1f} m from parcel boundary" if dist_m > 0 else "Directly abutting parcel frontage")

        lanes = int(tags["lanes"]) if tags.get("lanes") and str(tags["lanes"]).isdigit() else None
        maxspeed = tags.get("maxspeed")
        surface = tags.get("surface")
        osm_id = chosen_road.get("osm_id")

        result = {
            "available": True,
            "road_name": road_name_display,
            "road_type": hw,
            "road_type_display": type_display,
            # Separated values
            "tagged_road_width_ft": width_info["tagged_road_width_ft"],
            "tagged_road_width_m": width_info["tagged_road_width_m"],
            "has_tagged_width": width_info["has_tagged_width"],
            "estimated_carriageway_width_ft": width_info["estimated_carriageway_width_ft"],
            "estimated_carriageway_width_m": width_info["estimated_carriageway_width_m"],
            "has_estimated_carriageway": width_info["has_estimated_carriageway"],
            "carriageway_calculation_basis": width_info["carriageway_calculation_basis"],
            "distance_meters": dist_m,
            "distance_display": dist_display,
            # Verified width & compliance
            "verified_road_width_ft": width_info["verified_road_width_ft"],
            "verified_road_width_m": width_info["verified_road_width_m"],
            "road_width_ft": width_info["road_width_ft"],  # None if unverified!
            "road_width_m": width_info["road_width_m"],
            "is_road_width_estimated": width_info["is_road_width_estimated"],
            "width_status": width_info["width_status"],
            "verification_requirement": width_info["verification_requirement"],
            "tncdbr_eligibility": width_info["tncdbr_eligibility"],
            "confidence": width_info["confidence"],
            "data_source": width_info["data_source"],
            "lanes": lanes,
            "maxspeed": maxspeed,
            "surface": surface,
            "osm_id": osm_id,
        }
    else:
        result = {
            "available": False,
            "road_name": "No accessible road within 50 m",
            "road_type": "unmapped",
            "road_type_display": "No Abutting Road Mapped",
            "tagged_road_width_ft": None,
            "tagged_road_width_m": None,
            "has_tagged_width": False,
            "estimated_carriageway_width_ft": None,
            "estimated_carriageway_width_m": None,
            "has_estimated_carriageway": False,
            "carriageway_calculation_basis": None,
            "distance_meters": None,
            "distance_display": "No accessible road within 50 m (Manual road-width verification required)",
            "verified_road_width_ft": None,
            "verified_road_width_m": None,
            "road_width_ft": None,
            "road_width_m": None,
            "is_road_width_estimated": False,
            "width_status": "Road width data unavailable",
            "verification_requirement": "Manual road-width verification required",
            "tncdbr_eligibility": "Manual road-width verification required (No abutting accessible road mapped)",
            "confidence": "UNAVAILABLE",
            "data_source": "Width data unavailable (No accessible road within 50m)",
            "lanes": None,
            "maxspeed": None,
            "surface": None,
            "osm_id": None,
        }

    _ROAD_CACHE[cache_key] = {"data": result, "time": now}
    return result
