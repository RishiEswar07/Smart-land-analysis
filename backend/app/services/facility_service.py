"""
services/facility_service.py
----------------------------
Queries real geospatial infrastructure data via Overpass API
with automated multi-mirror failover and high-reliability OpenStreetMap
Nominatim viewbox fallback.

Computes accurate geodesic (Haversine) straight-line distances in kilometres
(km) from the parcel centroid or selected GPS coordinates.

Mandatory categories covered:
1. Bus Stand / Bus Station
2. Airport / Aviation
3. Railway Station
4. Hospital & Healthcare
5. School & College
6. Shopping & Commercial
7. Main Roads & Highways
8. Water Bodies & Hydrology
"""

import asyncio
import logging
import math
import time
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

# Primary and fallback Overpass API endpoints (Global high-availability mirrors)
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# In-memory cache keyed by (lat_4dec, lng_4dec, radius_km)
_FACILITY_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour

# Concurrency lock & in-flight deduplication table
_IN_FLIGHT_REQUESTS: Dict[str, asyncio.Task] = {}
_IN_FLIGHT_LOCK = asyncio.Lock()


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes accurate geodesic straight-line distance between two points
    on the Earth ellipsoid approximation (WGS84 sphere, R = 6,371 km).
    Returns distance in kilometres rounded to 2 decimal places.
    """
    R = 6371.0  # Earth's radius in kilometers
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


def _extract_coords(elem: Dict[str, Any]) -> tuple[Optional[float], Optional[float]]:
    """Safely extracts latitude and longitude from node, way, or relation element."""
    # 1. Direct point coordinates (nodes)
    if elem.get("lat") is not None and elem.get("lon") is not None:
        try:
            return float(elem["lat"]), float(elem["lon"])
        except (ValueError, TypeError):
            pass

    # 2. Centroid center dict (ways / relations output with 'out center')
    center = elem.get("center")
    if isinstance(center, dict) and center.get("lat") is not None and center.get("lon") is not None:
        try:
            return float(center["lat"]), float(center["lon"])
        except (ValueError, TypeError):
            pass

    # 3. Bounding box fallback
    bounds = elem.get("bounds")
    if isinstance(bounds, dict) and bounds.get("minlat") is not None and bounds.get("maxlat") is not None:
        try:
            return (
                (float(bounds["minlat"]) + float(bounds["maxlat"])) / 2.0,
                (float(bounds["minlon"]) + float(bounds["maxlon"])) / 2.0,
            )
        except (ValueError, TypeError):
            pass

    return None, None


def _format_address(tags: Dict[str, str]) -> Optional[str]:
    """Extracts human-readable address from tags if available."""
    parts = []
    if "addr:housenumber" in tags and "addr:street" in tags:
        parts.append(f"{tags['addr:housenumber']} {tags['addr:street']}")
    elif "addr:street" in tags:
        parts.append(tags["addr:street"])
    elif "addr:suburb" in tags:
        parts.append(tags["addr:suburb"])

    if "addr:city" in tags:
        parts.append(tags["addr:city"])
    elif "addr:town" in tags:
        parts.append(tags["addr:town"])

    return ", ".join(parts) if parts else None


async def _query_single_nominatim_term(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    term: str,
    cat_label: str,
    cat_key: str,
    viewbox: str,
    lat: float,
    lng: float,
    radius_km: float,
    headers: Dict[str, str],
) -> List[Dict[str, Any]]:
    """Helper to query a single term in OpenStreetMap Nominatim within viewbox with retries."""
    found: List[Dict[str, Any]] = []
    url = f"https://nominatim.openstreetmap.org/search?q={term}&format=json&bounded=1&viewbox={viewbox}&limit=5"
    max_allowed_dist = 50.0 if cat_key == "airports" else (radius_km * 1.5)

    async with sem:
        for attempt in range(2):
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    for it in resp.json():
                        try:
                            it_lat = float(it.get("lat", 0))
                            it_lon = float(it.get("lon", 0))
                        except (TypeError, ValueError):
                            continue

                        d_km = haversine_distance_km(lat, lng, it_lat, it_lon)
                        if d_km <= max_allowed_dist:
                            raw_name = it.get("display_name", "").split(",")[0].strip()
                            name = raw_name or term.title()
                            found.append({
                                "name": name,
                                "category": cat_label,
                                "cat_key": cat_key,
                                "distance_km": d_km,
                                "distanceKm": d_km,
                                "address": it.get("display_name"),
                                "lat": it_lat,
                                "lng": it_lon,
                                "status": "Verified Proximity",
                            })
                    break
                elif resp.status_code == 429 and attempt == 0:
                    # Rate limited: back off and retry once
                    await asyncio.sleep(0.5)
                else:
                    break
            except Exception as exc:
                logger.debug(f"Nominatim lookup error for '{term}': {exc}")
                if attempt == 0:
                    await asyncio.sleep(0.3)
            # Gentle inter-request pacing
            await asyncio.sleep(0.1)

    return found


async def _fetch_from_nominatim_fallback(
    lat: float, lng: float, radius_km: float
) -> Dict[str, List[Dict[str, Any]]]:
    """
    High-reliability fallback: Queries OpenStreetMap Nominatim search
    bounded by the search bounding box when Overpass mirrors encounter timeouts or rate limits.
    Runs category searches with controlled concurrency (sem=2) to respect rate limits.
    """
    delta_lat = radius_km / 111.0
    delta_lng = radius_km / (111.0 * max(0.1, math.cos(math.radians(lat))))
    min_lng = lng - delta_lng
    max_lng = lng + delta_lng
    min_lat = lat - delta_lat
    max_lat = lat + delta_lat
    viewbox_local = f"{min_lng:.5f},{max_lat:.5f},{max_lng:.5f},{min_lat:.5f}"

    # Expanded viewbox for regional transit infrastructure (Airports)
    transit_r_km = max(radius_km, 35.0)
    delta_lat_t = transit_r_km / 111.0
    delta_lng_t = transit_r_km / (111.0 * max(0.1, math.cos(math.radians(lat))))
    viewbox_transit = f"{lng - delta_lng_t:.5f},{lat + delta_lat_t:.5f},{lng + delta_lng_t:.5f},{lat - delta_lat_t:.5f}"

    queries = {
        "bus_stands": [("bus station", "Bus Stand / Station"), ("bus stop", "Local Bus Stop")],
        "railway_stations": [("railway station", "Railway Station")],
        "airports": [("airport", "Airport / Aviation")],
        "hospitals": [("hospital", "Hospital / Clinic"), ("clinic", "Healthcare Clinic")],
        "schools": [("school", "School / College"), ("college", "Higher Education / College")],
        "commercial": [("shopping mall", "Commercial / Shopping"), ("supermarket", "Commercial / Retail")],
        "roads": [("Main Road", "Road Network"), ("High Road", "Road Network"), ("Salai", "Road Network")],
        "water_bodies": [("river", "Hydrology / River"), ("lake", "Hydrology / Water Body"), ("canal", "Hydrology / Canal")],
    }

    headers = {
        "User-Agent": "SmartLandAnalysis/2.0 (Academic Geospatial Research; contact@smartland.edu)"
    }
    results: Dict[str, List[Dict[str, Any]]] = {k: [] for k in queries}
    sem = asyncio.Semaphore(2)

    tasks = []
    async with httpx.AsyncClient(timeout=8.0) as client:
        for cat_key, term_list in queries.items():
            vb = viewbox_transit if cat_key == "airports" else viewbox_local
            for term, cat_label in term_list:
                tasks.append(
                    _query_single_nominatim_term(
                        client, sem, term, cat_label, cat_key, vb, lat, lng, radius_km, headers
                    )
                )

        gathered_results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in gathered_results:
            if isinstance(res, list):
                for item in res:
                    c_key = item.get("cat_key")
                    if c_key in results:
                        results[c_key].append(item)

    return results


async def _execute_fetch(
    lat: float,
    lng: float,
    radius_km: float,
) -> Dict[str, Any]:
    """Internal implementation of geospatial facility lookup."""
    local_m = int(radius_km * 1000)
    transit_radius_m = int(max(local_m, 35000))
    bus_stop_m = int(min(local_m, 2500))

    query = f"""
    [out:json][timeout:8];
    (
      nwr["amenity"~"bus_station|hospital|clinic|school|college|university"](around:{local_m},{lat},{lng});
      node["highway"="bus_stop"](around:{bus_stop_m},{lat},{lng});
      nwr["railway"~"station|halt"](around:{local_m},{lat},{lng});
      nwr["aeroway"~"aerodrome|terminal"](around:{transit_radius_m},{lat},{lng});
      nwr["shop"~"supermarket|mall|department_store|convenience"](around:{local_m},{lat},{lng});
      way["highway"~"motorway|trunk|primary|secondary"](around:1500,{lat},{lng});
      way["waterway"~"river|canal"](around:2500,{lat},{lng});
      way["natural"="water"](around:2500,{lat},{lng});
    );
    out center 120;
    """

    headers = {
        "User-Agent": "SmartLandAnalysis/2.0 (Academic Geospatial Research; contact@smartland.edu)",
    }

    elements: List[Dict[str, Any]] = []
    source = "Geospatial Overpass Engine"
    overpass_succeeded = False

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            logger.info(f"Connecting to Overpass endpoint: {endpoint}")
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(endpoint, data={"data": query}, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    elements = data.get("elements", [])
                    if len(elements) > 0:
                        overpass_succeeded = True
                        logger.info(f"Overpass success from {endpoint}: {len(elements)} elements retrieved")
                        break
                else:
                    logger.warning(f"Overpass endpoint {endpoint} returned status {resp.status_code}")
        except Exception as exc:
            logger.warning(f"Overpass endpoint {endpoint} error: {exc}")
            continue

    categories: Dict[str, List[Dict[str, Any]]] = {
        "bus_stands": [],
        "railway_stations": [],
        "airports": [],
        "hospitals": [],
        "schools": [],
        "commercial": [],
        "roads": [],
        "water_bodies": [],
    }

    if overpass_succeeded:
        for elem in elements:
            tags = elem.get("tags", {})
            elem_lat, elem_lon = _extract_coords(elem)
            if elem_lat is None or elem_lon is None:
                continue

            dist_km = haversine_distance_km(lat, lng, elem_lat, elem_lon)
            addr = _format_address(tags)
            name = tags.get("name") or tags.get("name:en")

            # 1. Bus stands & stops
            if tags.get("amenity") == "bus_station" or tags.get("highway") == "bus_stop":
                facility_name = name or ("Bus Station" if tags.get("amenity") == "bus_station" else "Local Bus Stop")
                categories["bus_stands"].append({
                    "name": facility_name,
                    "category": "Bus Stand / Station",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

            # 2. Railway stations
            elif tags.get("railway") in ("station", "halt"):
                facility_name = name or ("Railway Station" if tags.get("railway") == "station" else "Railway Halt")
                categories["railway_stations"].append({
                    "name": facility_name,
                    "category": "Railway Station",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

            # 3. Airports
            elif "aeroway" in tags:
                facility_name = name or "Regional Airport / Airfield"
                categories["airports"].append({
                    "name": facility_name,
                    "category": "Airport / Aviation",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

            # 4. Hospitals & Clinics
            elif tags.get("amenity") in ("hospital", "clinic", "doctors"):
                facility_name = name or ("Hospital" if tags.get("amenity") == "hospital" else "Healthcare Clinic")
                categories["hospitals"].append({
                    "name": facility_name,
                    "category": "Hospital / Clinic",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

            # 5. Schools & Colleges
            elif tags.get("amenity") in ("school", "college", "university", "kindergarten"):
                amenity_type = tags.get("amenity", "school").capitalize()
                facility_name = name or f"Educational Institution ({amenity_type})"
                categories["schools"].append({
                    "name": facility_name,
                    "category": f"School / College ({amenity_type})",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

            # 6. Commercial & Shopping
            elif "shop" in tags or tags.get("amenity") == "marketplace":
                shop_type = tags.get("shop", "market").replace("_", " ").title()
                categories["commercial"].append({
                    "name": name or f"Commercial Center ({shop_type})",
                    "category": f"Commercial / Shopping ({shop_type})",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

            # 7. Main Roads & Highways
            elif "highway" in tags:
                h_type = tags.get("highway", "Road").replace("_", " ").title()
                categories["roads"].append({
                    "name": name or tags.get("ref") or f"{h_type} Corridor",
                    "category": f"Road Network ({h_type})",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

            # 8. Water Bodies
            elif "waterway" in tags or tags.get("natural") == "water":
                w_type = (tags.get("waterway") or tags.get("natural") or "Water").capitalize()
                categories["water_bodies"].append({
                    "name": name or f"Water Body ({w_type})",
                    "category": f"Hydrology / Water Body ({w_type})",
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                })

    # If Overpass failed, had 0 items, or is missing linear categories (roads, water bodies),
    # activate Nominatim fallback to supplement/fill real data
    total_parsed = sum(len(v) for v in categories.values())
    needs_fallback = (not overpass_succeeded) or (total_parsed == 0) or (len(categories["roads"]) == 0 and len(categories["water_bodies"]) == 0)

    if needs_fallback:
        logger.info("Executing secondary geospatial fallback to enrich nearby facilities...")
        try:
            nom_results = await _fetch_from_nominatim_fallback(lat, lng, radius_km)
            for cat_key, items in nom_results.items():
                if cat_key in categories:
                    if not overpass_succeeded or len(categories[cat_key]) == 0:
                        categories[cat_key].extend(items)
            if not overpass_succeeded or total_parsed == 0:
                source = "Geospatial Proximity Service"
            else:
                source = "Hybrid Geospatial Service"
        except Exception as exc:
            logger.warning(f"Secondary fallback error: {exc}")

    # Deduplicate and sort by geodesic distance in km (closest first)
    for cat_key in categories:
        seen_names = set()
        deduped = []
        for item in sorted(categories[cat_key], key=lambda x: x["distance_km"]):
            n_clean = item["name"].strip().lower()
            if n_clean not in seen_names:
                seen_names.add(n_clean)
                deduped.append(item)
        categories[cat_key] = deduped[:8]

    summary_counts = {cat_key: len(items) for cat_key, items in categories.items()}
    total_found = sum(summary_counts.values())

    if total_found > 0:
        status_str = "success"
        message_str = f"Found {total_found} nearby facilities within {radius_km} km radius."
    elif overpass_succeeded:
        status_str = "empty"
        message_str = f"No facilities identified within {radius_km} km radius."
    else:
        status_str = "unavailable"
        message_str = "Facility proximity service is temporarily busy. Please retry shortly."

    disclaimer_str = (
        "Distances represent straight-line geodesic distance in kilometres (km) "
        "measured from the parcel centroid or selected GPS coordinates. "
        "Road driving routes and navigation distances may vary based on local street topology and traffic networks."
    )

    result = {
        "status": status_str,
        "source": source,
        "message": message_str,
        "parcel_reference": {
            "latitude": lat,
            "longitude": lng,
            "reference_point": "Parcel Centroid (or Clicked GPS Coordinate)",
        },
        "search_radius_km": radius_km,
        "categories": categories,
        **categories,  # Expose bus_stands, railway_stations, etc. at root level for direct access
        "all_facilities": [
            item for cat_list in categories.values() for item in cat_list
        ],
        "summary_counts": summary_counts,
        "total_facilities_found": total_found,
        "total_found": total_found,
        "disclaimer": disclaimer_str,
    }

    return result


async def fetch_nearby_facilities(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Queries real geospatial infrastructure data around the specified coordinates,
    computes geodesic distances in km, and categorizes into the 8 required categories.

    Resilience architecture:
    1. In-flight request deduplication: simultaneous calls share a single async task.
    2. Multi-mirror Overpass query pool with automated failover and fast timeouts.
    3. High-reliability fallback to OpenStreetMap Nominatim bounded search.
    4. Category isolation: failures in one category do not wipe other categories.
    5. Distinct status tagging: 'success', 'empty', 'unavailable', or 'invalid_coordinates'.
    6. Caching only on valid completions (never caching transient network failures).
    """
    if lat is None or lng is None or not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return {
            "status": "invalid_coordinates",
            "source": "None",
            "message": "Invalid or missing geographic coordinates.",
            "search_radius_km": radius_km,
            "parcel_reference": {"latitude": lat, "longitude": lng},
            "categories": {},
            "all_facilities": [],
            "summary_counts": {},
            "total_facilities_found": 0,
            "total_found": 0,
            "disclaimer": "Invalid coordinates provided.",
        }

    radius_km = float(max(1.0, min(50.0, radius_km)))
    cache_key = f"{round(lat, 4)}:{round(lng, 4)}:{round(radius_km, 1)}"
    now = time.time()

    if use_cache and cache_key in _FACILITY_CACHE:
        entry = _FACILITY_CACHE[cache_key]["data"]
        exp = _FACILITY_CACHE[cache_key]["time"]
        if now - exp < CACHE_TTL_SECONDS:
            logger.info(f"Serving nearby facilities from cache for {cache_key}")
            cached_res = dict(entry)
            cached_res["source"] = "In-Memory Cache"
            return cached_res

    # In-flight deduplication: ensure only one task runs per cache_key
    async with _IN_FLIGHT_LOCK:
        if cache_key in _IN_FLIGHT_REQUESTS:
            logger.info(f"Deduplicating in-flight request for {cache_key}")
            task = _IN_FLIGHT_REQUESTS[cache_key]
        else:
            task = asyncio.create_task(_execute_fetch(lat, lng, radius_km))
            _IN_FLIGHT_REQUESTS[cache_key] = task

    try:
        result = await task
    finally:
        async with _IN_FLIGHT_LOCK:
            _IN_FLIGHT_REQUESTS.pop(cache_key, None)

    # Only cache successful or legitimate empty results
    if result.get("status") in ("success", "empty"):
        _FACILITY_CACHE[cache_key] = {"data": result, "time": now}

    return result


# Public alias for consistent naming
search_nearby_facilities = fetch_nearby_facilities

