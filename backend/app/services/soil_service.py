"""
services/soil_service.py
-------------------------
ISRIC SoilGrids REST API (v2.0) Integration Module.

Queries live soil property layers (clay, sand, silt) for given lat/lon coordinates.
Includes robust error handling, status checks, timeout protection, and graceful
fallback defaults to ensure the main ML suitability pipeline never crashes.
"""

import logging
import httpx
from typing import Dict, Any

logger = logging.getLogger(__name__)

SOILGRIDS_PROPERTIES_API = "https://rest.isric.org/soilgrids/v2.0/properties/query"
DEFAULT_SOIL_TEXTURE = {"clay": 33.3, "sand": 33.3, "silt": 33.4, "soil_type": "Loamy", "source": "Fallback (Default)"}


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


async def fetch_soilgrids_data(lat: float, lng: float, timeout_seconds: float = 6.0) -> Dict[str, Any]:
    """
    Fetches mean clay, sand, and silt concentrations (0-5cm depth) from ISRIC SoilGrids API v2.0.

    Args:
        lat (float): Latitude coordinate (-90 to 90)
        lng (float): Longitude coordinate (-180 to 180)
        timeout_seconds (float): HTTP timeout ceiling

    Returns:
        Dict[str, Any]: Dictionary containing clay, sand, silt percentages and classified soil_type.
    """
    params = {
        "lon": lng,
        "lat": lat,
        "property": ["clay", "sand", "silt"],
        "depth": "0-5cm",
        "value": "mean"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(SOILGRIDS_PROPERTIES_API, params=params, timeout=timeout_seconds)

            if response.status_code != 200:
                logger.warning(f"SoilGrids API returned non-200 status code: {response.status_code}")
                return DEFAULT_SOIL_TEXTURE.copy()

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
                            # Convert g/kg to percentage by dividing by d_factor (usually 10)
                            texture_means[name] = round(float(raw_mean) / float(d_factor), 1)

            # Ensure all 3 properties were parsed
            if "clay" in texture_means and "sand" in texture_means and "silt" in texture_means:
                c = texture_means["clay"]
                s = texture_means["sand"]
                si = texture_means["silt"]
                soil_cat = classify_soil_type(c, s, si)
                
                return {
                    "clay": c,
                    "sand": s,
                    "silt": si,
                    "soil_type": soil_cat,
                    "source": "ISRIC SoilGrids v2.0 REST API"
                }

            logger.warning(f"SoilGrids API response missing layer details for ({lat}, {lng}). Using fallback.")
            return DEFAULT_SOIL_TEXTURE.copy()

    except httpx.TimeoutException:
        logger.warning(f"SoilGrids API request timed out for ({lat}, {lng}). Utilizing default fallback.")
        return DEFAULT_SOIL_TEXTURE.copy()
    except Exception as exc:
        logger.error(f"Error executing SoilGrids API query for ({lat}, {lng}): {exc}")
        return DEFAULT_SOIL_TEXTURE.copy()
