"""
services/soil_service.py
-------------------------
ISRIC SoilGrids REST API (v2.0) Integration Module.

Queries live soil property layers (clay, sand, silt) for given lat/lon coordinates.
Includes robust error handling, status checks, timeout protection, and explicit
unavailable status tagging so missing data is never misrepresented as genuine measurements.
"""

import logging
from typing import Any, Dict, Optional
import httpx

logger = logging.getLogger(__name__)

SOILGRIDS_PROPERTIES_API = "https://rest.isric.org/soilgrids/v2.0/properties/query"

UNAVAILABLE_SOIL_DATA: Dict[str, Any] = {
    "clay": None,
    "sand": None,
    "silt": None,
    "soil_type": None,
    "status": "unavailable",
    "source": "ISRIC SoilGrids v2.0 (Unavailable)",
}

_SOIL_CACHE: Dict[str, Dict[str, Any]] = {}


def classify_soil_type(clay: float, sand: float, silt: float) -> str:
    """Classifies soil texture into major categories matching SoilType enum."""
    if sand >= 65.0:
        return "Sandy"
    elif clay >= 40.0:
        return "Clayey"
    elif silt >= 40.0:
        return "Loamy"
    elif clay >= 25.0:
        return "Black Cotton"  # High clay-swelling expansion profile
    else:
        return "Loamy"


async def fetch_soilgrids_data(lat: float, lng: float, timeout_seconds: float = 3.5) -> Dict[str, Any]:
    """
    Fetches mean clay, sand, and silt concentrations (0-5cm depth) from ISRIC SoilGrids API v2.0
    with fast in-memory coordinate caching and bounded timeout protection.
    Explicitly returns status='unavailable' when external API cannot be reached or data is missing.
    """
    if lat is None or lng is None or not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return UNAVAILABLE_SOIL_DATA.copy()

    cache_key = f"{round(lat, 3)}:{round(lng, 3)}"
    if cache_key in _SOIL_CACHE:
        return _SOIL_CACHE[cache_key].copy()

    params = {
        "lon": lng,
        "lat": lat,
        "property": ["clay", "sand", "silt"],
        "depth": "0-5cm",
        "value": "mean",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(SOILGRIDS_PROPERTIES_API, params=params, timeout=timeout_seconds)

            if response.status_code != 200:
                logger.warning(f"SoilGrids API returned non-200 status code: {response.status_code}")
                return UNAVAILABLE_SOIL_DATA.copy()

            data = response.json()
            layers = data.get("properties", {}).get("layers", [])

            texture_means = {}

            # Parse returned layers (clay, sand, silt)
            for layer in layers:
                name = layer.get("name")
                if name in ["clay", "sand", "silt"]:
                    d_factor = layer.get("unit_measure", {}).get("d_factor", 10)
                    depths = layer.get("depths", [])
                    if depths and len(depths) > 0:
                        raw_mean = depths[0].get("values", {}).get("mean")
                        if raw_mean is not None:
                            texture_means[name] = round(float(raw_mean) / float(d_factor), 1)

            # Ensure all 3 properties were parsed
            if "clay" in texture_means and "sand" in texture_means and "silt" in texture_means:
                c = texture_means["clay"]
                s = texture_means["sand"]
                si = texture_means["silt"]
                soil_cat = classify_soil_type(c, s, si)

                res_dict = {
                    "clay": c,
                    "sand": s,
                    "silt": si,
                    "soil_type": soil_cat,
                    "status": "success",
                    "source": "ISRIC SoilGrids v2.0 REST API",
                }
                _SOIL_CACHE[cache_key] = res_dict
                return res_dict

            logger.warning(f"SoilGrids API response missing layer details for ({lat}, {lng}).")
            return UNAVAILABLE_SOIL_DATA.copy()

    except httpx.TimeoutException:
        logger.warning(f"SoilGrids API request timed out for ({lat}, {lng}).")
        return UNAVAILABLE_SOIL_DATA.copy()
    except Exception as exc:
        logger.error(f"Error executing SoilGrids API query for ({lat}, {lng}): {exc}")
        return UNAVAILABLE_SOIL_DATA.copy()
