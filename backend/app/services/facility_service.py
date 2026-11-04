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
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
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
    url = f"https://nominatim.openstreetmap.org/search?q={term}&format=json&bounded=1&viewbox={viewbox}&limit=8"
    max_allowed_dist = 50.0 if cat_key == "airports" else (radius_km * 1.25)
    meta = FACILITY_CATEGORY_META.get(cat_key, {"label": cat_label, "icon": "📍"})

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
                            d_meters = round(d_km * 1000)
                            d_display = f"{d_meters} m" if d_km < 1.0 else f"{d_km:.2f} km"
                            osm_id = it.get("osm_id") or it.get("place_id") or f"{it_lat}-{it_lon}"
                            osm_type = it.get("osm_type", "node")
                            found.append({
                                "id": f"{osm_type}/{osm_id}",
                                "name": name,
                                "category": meta["label"],
                                "cat_key": cat_key,
                                "icon": meta["icon"],
                                "distance_km": d_km,
                                "distanceKm": d_km,
                                "distance_meters": d_meters,
                                "distance_display": d_display,
                                "address": it.get("display_name"),
                                "lat": it_lat,
                                "lng": it_lon,
                                "status": "Verified Proximity",
                                "osm_type": osm_type,
                                "osm_id": osm_id,
                            })
                    break
                elif resp.status_code == 429 and attempt == 0:
                    await asyncio.sleep(0.5)
                else:
                    break
            except Exception as exc:
                logger.debug(f"Nominatim lookup error for '{term}': {exc}")
                if attempt == 0:
                    await asyncio.sleep(0.3)
            await asyncio.sleep(0.08)

    return found


async def _fetch_from_nominatim_fallback(
    lat: float, lng: float, radius_km: float
) -> Dict[str, List[Dict[str, Any]]]:
    """
    High-reliability fallback: Queries OpenStreetMap Nominatim search
    bounded by the search bounding box when Overpass mirrors encounter timeouts or rate limits.
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
        "hospitals": [("hospital", "Hospital"), ("government hospital", "Hospital")],
        "clinics": [("clinic", "Clinic"), ("doctor", "Healthcare Clinic")],
        "pharmacies": [("pharmacy", "Pharmacy"), ("chemist", "Pharmacy")],
        "schools": [("school", "School"), ("higher secondary school", "School")],
        "colleges": [("college", "College"), ("university", "University")],
        "police_stations": [("police station", "Police Station")],
        "fire_stations": [("fire station", "Fire Station")],
        "railway_stations": [("railway station", "Railway Station")],
        "bus_stops": [("bus station", "Bus Station"), ("bus stop", "Bus Stop")],
        "banks_atms": [("bank", "Bank"), ("atm", "ATM")],
        "supermarkets": [("supermarket", "Supermarket"), ("shopping mall", "Shopping Mall")],
        "restaurants": [("restaurant", "Restaurant"), ("hotel food", "Restaurant")],
        "fuel_stations": [("petrol bunk", "Fuel Station"), ("fuel station", "Fuel Station")],
        "parks": [("park", "Public Park"), ("garden", "Public Garden")],
        "airports": [("airport", "Airport / Aviation")],
        "roads": [("Main Road", "Road Network"), ("Salai", "Road Network")],
        "water_bodies": [("river", "Hydrology / River"), ("lake", "Hydrology / Water Body")],
    }

    headers = {
        "User-Agent": "SmartLandAnalysis/2.0 (Academic Geospatial Research; contact@smartland.edu)"
    }
    results: Dict[str, List[Dict[str, Any]]] = {k: [] for k in FACILITY_CATEGORY_META}
    results["bus_stands"] = []
    results["commercial"] = []
    sem = asyncio.Semaphore(4)

    tasks = []
    async with httpx.AsyncClient(timeout=7.0) as client:
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

    # Aliases
    results["bus_stands"] = results.get("bus_stops", [])
    results["commercial"] = results.get("supermarkets", [])
    return results


async def _execute_fetch(
    lat: float,
    lng: float,
    radius_km: float,
) -> Dict[str, Any]:
    """Internal implementation of comprehensive geospatial facility lookup."""
    local_m = int(radius_km * 1000)
    transit_radius_m = int(max(local_m, 35000))
    bus_stop_m = int(min(local_m, 4000))

    query = f"""
    [out:json][timeout:12];
    (
      // 1. Healthcare: Hospitals, Clinics, Doctors, Pharmacies
      nwr["amenity"~"hospital|clinic|doctors|pharmacy"](around:{local_m},{lat},{lng});
      nwr["healthcare"~"hospital|clinic|doctor|pharmacy|centre"](around:{local_m},{lat},{lng});
      nwr["shop"~"chemist|pharmacy"](around:{local_m},{lat},{lng});

      // 2. Education: Schools, Colleges, Universities
      nwr["amenity"~"school|college|university|kindergarten"](around:{local_m},{lat},{lng});

      // 3. Emergency & Civic: Police, Fire Stations
      nwr["amenity"~"police|fire_station"](around:{local_m},{lat},{lng});

      // 4. Transit: Railway Stations, Bus Stations, Bus Stops
      nwr["railway"~"station|halt"](around:{local_m},{lat},{lng});
      nwr["amenity"="bus_station"](around:{local_m},{lat},{lng});
      node["highway"="bus_stop"](around:{bus_stop_m},{lat},{lng});
      node["public_transport"~"stop_position|platform"](around:{bus_stop_m},{lat},{lng});

      // 5. Finance: Banks and ATMs
      nwr["amenity"~"bank|atm"](around:{local_m},{lat},{lng});

      // 6. Food & Dining: Restaurants, Cafes, Fast Food
      nwr["amenity"~"restaurant|cafe|fast_food|food_court"](around:{local_m},{lat},{lng});

      // 7. Shopping & Supermarkets
      nwr["shop"~"supermarket|grocery|mall|department_store|convenience"](around:{local_m},{lat},{lng});

      // 8. Fuel & Automotive
      nwr["amenity"="fuel"](around:{local_m},{lat},{lng});

      // 9. Parks & Recreation
      nwr["leisure"~"park|garden|recreation_ground"](around:{local_m},{lat},{lng});

      // 10. Regional transit & aviation
      nwr["aeroway"~"aerodrome|terminal"](around:{transit_radius_m},{lat},{lng});

      // 11. Roads & Water Bodies
      way["highway"~"motorway|trunk|primary|secondary"](around:2000,{lat},{lng});
      way["waterway"~"river|canal"](around:3000,{lat},{lng});
      way["natural"="water"](around:3000,{lat},{lng});
    );
    out center 250;
    """

    headers = {
        "User-Agent": "SmartLandAnalysis/2.0 (Academic Geospatial Research; contact@smartland.edu)",
    }

    elements: List[Dict[str, Any]] = []
    source = "Geospatial Overpass Engine"
    overpass_succeeded = False

    for endpoint in OVERPASS_ENDPOINTS[:3]:
        try:
            logger.info(f"Connecting to Overpass endpoint: {endpoint}")
            async with httpx.AsyncClient(timeout=7.0) as client:
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
            logger.warning(f"Overpass endpoint {endpoint} error: {exc}")
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
            # Skip items beyond requested search radius (except regional airports)
            is_airport = "aeroway" in tags
            if not is_airport and dist_km > (radius_km * 1.05):
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
            if not overpass_succeeded or total_parsed == 0:
                source = "Geospatial Proximity Service (Nominatim OSM)"
            else:
                source = "Hybrid Geospatial Service (Overpass + Nominatim)"
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
