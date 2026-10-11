"""
services/facility_service.py
----------------------------
Queries real OpenStreetMap geospatial infrastructure via Overpass API
and computes accurate geodesic (Haversine) straight-line distances in kilometres
from the selected land parcel centroid or location coordinates.

Mandatory categories covered:
1. Bus Stand / Bus Station
2. Airport
3. Railway Station
4. Hospital & Healthcare
5. School & College
6. Shopping & Commercial
7. Main Roads & Highways
8. Water Bodies
"""

import logging
import math
import time
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)

# Primary and fallback Overpass API endpoints
OVERPASS_ENDPOINTS = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Simple in-memory cache keyed by (lat_3dec, lng_3dec, radius_km)
_FACILITY_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


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


def _format_address(tags: Dict[str, str]) -> Optional[str]:
    """Extracts human-readable address from OSM tags if available."""
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


async def fetch_nearby_facilities(
    lat: float,
    lng: float,
    radius_km: float = 5.0,
    use_cache: bool = True,
) -> Dict[str, Any]:
    """
    Queries real OpenStreetMap Overpass data around the specified coordinates,
    computes geodesic distances in km, and categorizes into the 8 required categories.
    """
    cache_key = f"{round(lat, 3)}:{round(lng, 3)}:{round(radius_km, 1)}"
    now = time.time()

    if use_cache and cache_key in _FACILITY_CACHE:
        entry, exp = _FACILITY_CACHE[cache_key]["data"], _FACILITY_CACHE[cache_key]["time"]
        if now - exp < CACHE_TTL_SECONDS:
            return entry

    local_m = int(radius_km * 1000)
    transit_radius_m = int(max(local_m, 20000))

    query = f"""
    [out:json][timeout:12];
    (
      node["amenity"~"bus_station|hospital|clinic|school|college|university|marketplace"](around:{local_m},{lat},{lng});
      node["highway"="bus_stop"](around:{local_m},{lat},{lng});
      node["railway"~"station|halt"](around:15000,{lat},{lng});
      node["aeroway"~"aerodrome|terminal"](around:25000,{lat},{lng});
      node["shop"~"supermarket|mall|department_store|convenience"](around:{local_m},{lat},{lng});
      way["highway"~"motorway|trunk|primary|secondary|tertiary"](around:500,{lat},{lng});
      way["waterway"~"river|canal|stream"](around:1500,{lat},{lng});
    );
    out center 40;
    """

    headers = {
        "User-Agent": "SmartLandAnalysis/1.0 (Academic Geospatial Research; contact@smartland.edu)",
    }

    elements: List[Dict[str, Any]] = []

    for endpoint in OVERPASS_ENDPOINTS:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(endpoint, data={"data": query}, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    elements = data.get("elements", [])
                    logger.info(f"Overpass successfully fetched {len(elements)} elements from {endpoint}")
                    break
        except Exception as exc:
            logger.warning(f"Failed query on Overpass mirror {endpoint}: {exc}")
            continue

    # Initialize categorized lists
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

    for elem in elements:
        tags = elem.get("tags", {})
        elem_lat = elem.get("lat") or elem.get("center", {}).get("lat")
        elem_lon = elem.get("lon") or elem.get("center", {}).get("lon")

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
                "status": "Verified (OpenStreetMap)",
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
                "status": "Verified (OpenStreetMap)",
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
                "status": "Verified (OpenStreetMap)",
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
                "status": "Verified (OpenStreetMap)",
            })

        # 5. Schools & Colleges
        elif tags.get("amenity") in ("school", "college", "university", "kindergarten"):
            amenity_type = tags.get("amenity").capitalize()
            facility_name = name or f"Educational Institution ({amenity_type})"
            categories["schools"].append({
                "name": facility_name,
                "category": f"School / College ({amenity_type})",
                "distance_km": dist_km,
                "distanceKm": dist_km,
                "address": addr,
                "lat": elem_lat,
                "lng": elem_lon,
                "status": "Verified (OpenStreetMap)",
            })

        # 6. Commercial & Shopping
        elif "shop" in tags or tags.get("amenity") == "marketplace":
            shop_type = tags.get("shop", "market").replace("_", " ").title()
            facility_name = name or f"Commercial Center ({shop_type})"
            categories["commercial"].append({
                "name": facility_name,
                "category": f"Commercial / Shopping ({shop_type})",
                "distance_km": dist_km,
                "distanceKm": dist_km,
                "address": addr,
                "lat": elem_lat,
                "lng": elem_lon,
                "status": "Verified (OpenStreetMap)",
            })

        # 7. Main Roads & Highways
        elif "highway" in tags:
            h_type = tags.get("highway", "Road").replace("_", " ").title()
            road_name = name or f"{h_type} Corridor"
            categories["roads"].append({
                "name": road_name,
                "category": f"Road Network ({h_type})",
                "distance_km": dist_km,
                "distanceKm": dist_km,
                "address": addr,
                "lat": elem_lat,
                "lng": elem_lon,
                "status": "Verified (OpenStreetMap)",
            })

        # 8. Water Bodies
        elif "waterway" in tags or tags.get("natural") == "water":
            w_type = (tags.get("waterway") or tags.get("natural") or "Water").capitalize()
            water_name = name or f"Water Body ({w_type})"
            categories["water_bodies"].append({
                "name": water_name,
                "category": f"Hydrology / Water Body ({w_type})",
                "distance_km": dist_km,
                "distanceKm": dist_km,
                "address": addr,
                "lat": elem_lat,
                "lng": elem_lon,
                "status": "Verified (OpenStreetMap)",
            })

    # Sort each category list by distance in km (closest first) and deduplicate by name
    for cat_key in categories:
        seen_names = set()
        deduped = []
        for item in sorted(categories[cat_key], key=lambda x: x["distance_km"]):
            n_clean = item["name"].strip().lower()
            if n_clean not in seen_names:
                seen_names.add(n_clean)
                deduped.append(item)
        # Limit to top 8 closest
        categories[cat_key] = deduped[:8]

    summary_counts = {cat_key: len(items) for cat_key, items in categories.items()}

    result = {
        "parcel_reference": {
            "latitude": lat,
            "longitude": lng,
            "reference_point": "Parcel Centroid (or Clicked GPS Coordinate)",
        },
        "search_radius_km": radius_km,
        "categories": categories,
        # Flattened list for table displays
        "all_facilities": [
            item for cat_list in categories.values() for item in cat_list
        ],
        "summary_counts": summary_counts,
        "total_facilities_found": sum(summary_counts.values()),
        "disclaimer": (
            "Distances represent straight-line geodesic distances in kilometres (km) "
            "measured from the parcel centroid using OpenStreetMap geospatial infrastructure data. "
            "Actual road navigation routes may differ based on local traffic topology."
        ),
    }

    # Cache result
    _FACILITY_CACHE[cache_key] = {"data": result, "time": now}
    return result