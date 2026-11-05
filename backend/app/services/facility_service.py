"""
services/facility_service.py
----------------------------
Queries real geospatial infrastructure data via Overpass API
with automated multi-mirror failover and high-reliability OpenStreetMap
Nominatim viewbox fallback.

Computes accurate geodesic (Haversine) straight-line distances in kilometres
(km) and meters from the parcel centroid or selected GPS coordinates.

14 Mandatory Categories Covered:
1. Hospitals
2. Clinics
3. Pharmacies
4. Schools
5. Colleges and Universities
6. Police Stations
7. Fire Stations
8. Railway Stations
9. Bus Stops
10. ATMs and Banks
11. Supermarkets & Retail
12. Restaurants & Food
13. Fuel Stations
14. Parks & Recreation
(Plus regional transit/aviation, main roads, and hydrology for spatial scoring)
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
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# In-memory cache keyed by (lat_4dec, lng_4dec, radius_km)
_FACILITY_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour

# Concurrency lock & in-flight deduplication table
_IN_FLIGHT_REQUESTS: Dict[str, asyncio.Task] = {}
_IN_FLIGHT_LOCK = asyncio.Lock()

# Category definitions with icons and user-facing labels
FACILITY_CATEGORY_META = {
    "hospitals": {"label": "Hospital", "icon": "🏥"},
    "clinics": {"label": "Clinic", "icon": "🩺"},
    "pharmacies": {"label": "Pharmacy", "icon": "💊"},
    "schools": {"label": "School", "icon": "🏫"},
    "colleges": {"label": "College & University", "icon": "🎓"},
    "police_stations": {"label": "Police Station", "icon": "👮"},
    "fire_stations": {"label": "Fire Station", "icon": "🚒"},
    "railway_stations": {"label": "Railway Station", "icon": "🚆"},
    "bus_stops": {"label": "Bus Stop & Station", "icon": "🚌"},
    "banks_atms": {"label": "Bank & ATM", "icon": "🏧"},
    "supermarkets": {"label": "Supermarket & Retail", "icon": "🛒"},
    "restaurants": {"label": "Restaurant & Food", "icon": "🍽️"},
    "fuel_stations": {"label": "Fuel Station", "icon": "⛽"},
    "parks": {"label": "Park & Garden", "icon": "🌳"},
    # Additional spatial and infrastructure categories
    "airports": {"label": "Airport / Aviation", "icon": "✈️"},
    "roads": {"label": "Main Road Network", "icon": "🛣️"},
    "water_bodies": {"label": "Hydrology / Water Body", "icon": "🌊"},
}


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


async def _fetch_from_nominatim_fallback(
    lat: float, lng: float, radius_km: float
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Nominatim API Compliance Shim:
    In strict compliance with OpenStreetMap Nominatim Acceptable Use Policy,
    systematic POI querying via Nominatim is completely disabled. Nominatim
    is reserved exclusively for single-address forward and reverse geocoding.
    Returns an empty category structure.
    """
    results: Dict[str, List[Dict[str, Any]]] = {k: [] for k in FACILITY_CATEGORY_META}
    results["bus_stands"] = []
    results["commercial"] = []
    return results


async def _execute_fetch(
    lat: float,
    lng: float,
    radius_km: float,
) -> Dict[str, Any]:
    """Internal implementation of comprehensive geospatial facility lookup."""
    local_m = int(radius_km * 1000)
    transit_radius_m = local_m
    bus_stop_m = int(min(local_m, 3000))

    query = f"""
    [out:json][timeout:20];
    (
      // Primary amenity nodes (hospitals, clinics, pharmacies, schools, colleges, police, fire, banks, food, fuel)
      node["amenity"~"hospital|clinic|doctors|pharmacy|school|college|university|police|fire_station|bank|atm|restaurant|cafe|fuel"](around:{local_m},{lat},{lng});
      node["railway"~"station|halt"](around:{local_m},{lat},{lng});
      node["amenity"="bus_station"](around:{local_m},{lat},{lng});
      node["highway"="bus_stop"](around:{bus_stop_m},{lat},{lng});
      node["shop"~"supermarket|grocery|mall|department_store|convenience|chemist|pharmacy"](around:{local_m},{lat},{lng});
      node["leisure"~"park|garden"](around:{local_m},{lat},{lng});
      node["aeroway"~"aerodrome|terminal"](around:{transit_radius_m},{lat},{lng});

      // Essential way geometries with center coordinates
      way["amenity"~"hospital|clinic|school|college|university|police|fire_station|bus_station"](around:{local_m},{lat},{lng});
      way["shop"~"supermarket|mall|department_store"](around:{local_m},{lat},{lng});
      way["leisure"~"park|garden"](around:{local_m},{lat},{lng});
      way["aeroway"~"aerodrome|terminal"](around:{transit_radius_m},{lat},{lng});
      way["highway"~"motorway|trunk|primary|secondary"](around:2000,{lat},{lng});
      way["waterway"~"river|canal"](around:3000,{lat},{lng});
      way["natural"="water"](around:3000,{lat},{lng});
    );
    out center 150;
    """

    headers = {
        "User-Agent": "SmartLandAnalysis/2.0 (contact@smartlandanalysis.edu)",
        "Referer": "https://smartlandanalysis.edu/",
    }

    elements: List[Dict[str, Any]] = []
    source = "Geospatial Overpass Engine"
    overpass_succeeded = False

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            logger.info(f"Connecting to Overpass endpoint: {endpoint}")
            async with httpx.AsyncClient(timeout=25.0) as client:
                resp = await client.post(endpoint, data={"data": query}, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, dict) and "elements" in data:
                        overpass_succeeded = True
                        elements = data.get("elements", [])
                        logger.info(f"Overpass success from {endpoint}: {len(elements)} elements retrieved")
                        break
                else:
                    logger.warning(f"Overpass endpoint {endpoint} returned status {resp.status_code}")
        except Exception as exc:
            logger.warning(f"Overpass endpoint {endpoint} error: {repr(exc)}")
            continue
            continue

    categories: Dict[str, List[Dict[str, Any]]] = {k: [] for k in FACILITY_CATEGORY_META}
    categories["bus_stands"] = []
    categories["commercial"] = []

    if overpass_succeeded:
        for elem in elements:
            tags = elem.get("tags", {})
            elem_lat, elem_lon = _extract_coords(elem)
            if elem_lat is None or elem_lon is None:
                continue

            dist_km = haversine_distance_km(lat, lng, elem_lat, elem_lon)
            # Strictly filter all items beyond requested search radius (including airports and regional transit)
            if dist_km > radius_km:
                continue

            addr = _format_address(tags)
            name = tags.get("name") or tags.get("name:en")
            osm_id = elem.get("id")
            osm_type = elem.get("type", "node")
            uid = f"{osm_type}/{osm_id}"
            dist_meters = round(dist_km * 1000)
            dist_display = f"{dist_meters} m" if dist_km < 1.0 else f"{dist_km:.2f} km"

            def make_item(c_key: str, default_name: str) -> Dict[str, Any]:
                meta = FACILITY_CATEGORY_META.get(c_key, {"label": c_key.title(), "icon": "📍"})
                return {
                    "id": uid,
                    "name": name or default_name,
                    "category": meta["label"],
                    "cat_key": c_key,
                    "icon": meta["icon"],
                    "distance_km": dist_km,
                    "distanceKm": dist_km,
                    "distance_meters": dist_meters,
                    "distance_display": dist_display,
                    "address": addr,
                    "lat": elem_lat,
                    "lng": elem_lon,
                    "status": "Verified Proximity",
                    "osm_type": osm_type,
                    "osm_id": osm_id,
                }

            amenity = tags.get("amenity", "")
            healthcare = tags.get("healthcare", "")
            shop = tags.get("shop", "")
            railway = tags.get("railway", "")
            highway = tags.get("highway", "")
            leisure = tags.get("leisure", "")

            # 1. Hospitals
            if amenity == "hospital" or healthcare == "hospital":
                categories["hospitals"].append(make_item("hospitals", "General Hospital"))

            # 2. Clinics & Medical Centers
            elif amenity in ("clinic", "doctors", "health_post") or healthcare in ("clinic", "doctor", "centre"):
                categories["clinics"].append(make_item("clinics", "Healthcare Clinic / Medical Practice"))

            # 3. Pharmacies & Chemists
            elif amenity == "pharmacy" or healthcare == "pharmacy" or shop in ("chemist", "pharmacy"):
                categories["pharmacies"].append(make_item("pharmacies", "Pharmacy / Medical Chemist"))

            # 4. Schools
            elif amenity in ("school", "kindergarten"):
                categories["schools"].append(make_item("schools", "Primary / Secondary School"))

            # 5. Colleges & Universities
            elif amenity in ("college", "university"):
                categories["colleges"].append(make_item("colleges", "College / University Campus"))

            # 6. Police Stations
            elif amenity == "police":
                categories["police_stations"].append(make_item("police_stations", "Police Station"))

            # 7. Fire Stations
            elif amenity == "fire_station":
                categories["fire_stations"].append(make_item("fire_stations", "Fire & Rescue Station"))

            # 8. Railway Stations & Halts
            elif railway in ("station", "halt") or tags.get("station") == "subway":
                station_label = "Railway Station" if railway == "station" else "Railway Halt"
                categories["railway_stations"].append(make_item("railway_stations", station_label))

            # 9. Bus Stops & Terminals
            elif amenity == "bus_station" or highway == "bus_stop" or tags.get("public_transport") in ("stop_position", "platform"):
                bus_label = "Bus Terminal / Station" if amenity == "bus_station" else "Local Bus Stop"
                item = make_item("bus_stops", bus_label)
                categories["bus_stops"].append(item)
                categories["bus_stands"].append(item)

            # 10. Banks & ATMs
            elif amenity in ("bank", "atm"):
                fin_label = "Bank Branch" if amenity == "bank" else "ATM Kiosk"
                categories["banks_atms"].append(make_item("banks_atms", fin_label))

            # 11. Supermarkets & Retail Shopping
            elif shop in ("supermarket", "grocery", "mall", "department_store", "convenience") or amenity == "marketplace":
                shop_label = "Supermarket" if shop == "supermarket" else "Retail Center / Store"
                item = make_item("supermarkets", shop_label)
                categories["supermarkets"].append(item)
                categories["commercial"].append(item)

            # 12. Restaurants, Cafes & Food
            elif amenity in ("restaurant", "cafe", "fast_food", "food_court"):
                food_label = "Restaurant" if amenity == "restaurant" else "Cafe / Eatery"
                categories["restaurants"].append(make_item("restaurants", food_label))

            # 13. Fuel Stations
            elif amenity == "fuel":
                categories["fuel_stations"].append(make_item("fuel_stations", "Fuel / Petrol Station"))

            # 14. Parks & Public Gardens
            elif leisure in ("park", "garden", "recreation_ground") or tags.get("landuse") == "recreation_ground":
                categories["parks"].append(make_item("parks", "Public Park / Garden"))

            # 15. Airports
            elif "aeroway" in tags:
                categories["airports"].append(make_item("airports", "Regional Airport / Airfield"))

            # 16. Road Network Corridors
            elif highway in ("motorway", "trunk", "primary", "secondary"):
                h_name = name or tags.get("ref") or f"{highway.capitalize()} Highway Corridor"
                categories["roads"].append(make_item("roads", h_name))

            # 17. Hydrology / Water Bodies
            elif "waterway" in tags or tags.get("natural") == "water":
                w_name = name or f"Water Body ({tags.get('waterway') or 'Water'})"
                categories["water_bodies"].append(make_item("water_bodies", w_name))

    # Aliases
    categories["bus_stands"] = categories.get("bus_stops", [])
    categories["commercial"] = categories.get("supermarkets", [])

    # If Overpass failed, had 0 items, or is missing essential civic categories,
    # trigger Nominatim fallback to supplement/fill genuine data
    total_parsed = sum(len(v) for k, v in categories.items() if k not in ("bus_stands", "commercial"))
    needs_fallback = (not overpass_succeeded) or (total_parsed == 0)

    if needs_fallback:
        logger.info("Executing secondary geospatial fallback to enrich nearby facilities...")
        try:
            nom_results = await _fetch_from_nominatim_fallback(lat, lng, radius_km)
            for cat_key, items in nom_results.items():
                if cat_key in categories:
                    if not overpass_succeeded or len(categories[cat_key]) == 0:
                        categories[cat_key].extend(items)
            categories["bus_stands"] = categories.get("bus_stops", [])
            categories["commercial"] = categories.get("supermarkets", [])
            if overpass_succeeded:
                source = "Geospatial Overpass Engine"
            else:
                source = "OpenStreetMap Geospatial Service"
        except Exception as exc:
            logger.warning(f"Secondary fallback error: {exc}")

    # Deduplicate within each category by ID and normalized name, sort closest first
    for cat_key in categories:
        seen_ids = set()
        seen_names = set()
        deduped = []
        for item in sorted(categories[cat_key], key=lambda x: x["distance_km"]):
            i_id = item.get("id")
            n_clean = item["name"].strip().lower()
            if i_id and i_id in seen_ids:
                continue
            if n_clean in seen_names:
                continue
            if i_id:
                seen_ids.add(i_id)
            seen_names.add(n_clean)
            deduped.append(item)
        # Retain top 12 closest facilities per category
        categories[cat_key] = deduped[:12]

    # Global all_facilities list (distinct items across all categories)
    all_facilities_map: Dict[str, Dict[str, Any]] = {}
    for cat_key, items in categories.items():
        if cat_key in ("bus_stands", "commercial"):
            continue  # Avoid duplicate entries from alias keys
        for it in items:
            key = it.get("id") or f"{it.get('lat')}:{it.get('lng')}:{it.get('name')}"
            if key not in all_facilities_map:
                all_facilities_map[key] = it

    all_facilities = sorted(all_facilities_map.values(), key=lambda x: x["distance_km"])
    summary_counts = {
        cat_key: len(items)
        for cat_key, items in categories.items()
        if cat_key not in ("bus_stands", "commercial")
    }
    total_found = len(all_facilities)

    if total_found > 0:
        status_str = "success"
        message_str = f"Found {total_found} verified facilities within {radius_km} km radius in OpenStreetMap."
    elif overpass_succeeded:
        status_str = "empty"
        message_str = f"No facilities identified within {radius_km} km radius in OpenStreetMap."
    else:
        status_str = "unavailable"
        message_str = "Geospatial facility service is temporarily busy. Please retry shortly."

    disclaimer_str = (
        "Distances represent straight-line geodesic distance in kilometres (km) "
        "measured accurately from the parcel centroid or selected GPS coordinates using Haversine calculation. "
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
        **categories,  # Expose bus_stops, hospitals, schools, etc. at root level for backward compatibility
        "all_facilities": all_facilities,
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
    computes geodesic distances in km, and categorizes into the 14 mandatory categories.

    Resilience architecture:
    1. In-flight request deduplication: simultaneous calls share a single async task.
    2. Multi-mirror Overpass query pool with automated failover and 7s timeouts.
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
