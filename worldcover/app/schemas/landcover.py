"""
schemas/landcover.py
-----------------------
Pydantic v2 response schema for the Land Cover endpoint.
Add this file to your existing backend's app/schemas/ directory.
"""

from pydantic import BaseModel, ConfigDict, Field


class LandCoverResponse(BaseModel):
    latitude: float
    longitude: float
    land_cover_class: int = Field(..., description="Raw ESA WorldCover class code (10-100)")
    land_cover_name: str = Field(..., description="Official ESA WorldCover class name, e.g. 'Built-up'")
    category: str = Field(..., description="Simplified category for this app's UI")
    construction_suitability: str = Field(..., description="Suitable / Caution / Unsuitable")
    suitability_note: str
    source_tile: str = Field(..., description="ESA WorldCover tile code this pixel came from, e.g. 'N09E078'")
    data_source: str = Field(..., description="'remote-stream' or 'local:<path>'")
    dataset_year: int

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "latitude": 9.9252,
                "longitude": 78.1198,
                "land_cover_class": 50,
                "land_cover_name": "Built-up",
                "category": "Built-up",
                "construction_suitability": "Suitable",
                "suitability_note": "Already-developed/urbanized land...",
                "source_tile": "N09E078",
                "data_source": "remote-stream",
                "dataset_year": 2021,
            }
        }
    )
