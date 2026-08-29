"""
schemas/land.py
----------------
Pydantic v2 request/response schemas for the Land Management module.

- LandCreate   -> POST body (all fields required)
- LandUpdate   -> PUT body (all fields optional, partial update)
- LandResponse -> what the API returns (adds id/created_at/updated_at)
- LandListResponse -> paginated list wrapper for GET /lands
"""

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.land import LandType, SoilType


class LandBase(BaseModel):
    """Fields shared by create/update/response — single source of truth for validation rules."""

    land_name: str = Field(..., min_length=2, max_length=150, description="Human-readable name for the plot")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in decimal degrees (polygon centroid)")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in decimal degrees (polygon centroid)")
    address: str = Field(..., min_length=5, max_length=255)
    area_sqft: Optional[float] = Field(None, gt=0, description="Land area in square feet")
    road_width: Optional[float] = Field(None, gt=0, description="Adjacent road width in feet")
    soil_type: Optional[SoilType] = None
    land_type: LandType
    water_availability: Optional[bool] = Field(None, description="Whether piped/borewell water is available on site")
    electricity_availability: Optional[bool] = Field(None, description="Whether an electricity connection is available on site")
    boundary_geojson: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Full drawn polygon boundary as a GeoJSON Polygon geometry: "
            '{"type": "Polygon", "coordinates": [[[lng, lat], ...]]}. '
            "Optional — latitude/longitude above (the centroid) remain the "
            "quick-access representative point either way."
        ),
    )

    @field_validator("land_name", "address")
    @classmethod
    def strip_whitespace(cls, value: str) -> str:
        """Trims accidental leading/trailing whitespace from free-text fields."""
        return value.strip()


class LandCreate(LandBase):
    """Request body for POST /api/v1/lands — every field required."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "land_name": "Plot A - Madurai Bypass",
                "latitude": 9.9252,
                "longitude": 78.1198,
                "address": "Near Bypass Road, Madurai, Tamil Nadu",
                "area_sqft": 2400,
                "road_width": 30,
                "soil_type": "Clayey",
                "land_type": "Residential",
                "water_availability": True,
                "electricity_availability": True,
                "boundary_geojson": {
                    "type": "Polygon",
                    "coordinates": [[[78.1195, 9.9250], [78.1201, 9.9250], [78.1201, 9.9254], [78.1195, 9.9254], [78.1195, 9.9250]]],
                },
            }
        }
    )


class LandUpdate(BaseModel):
    """
    Request body for PUT /api/v1/lands/{id}.
    All fields optional — only the ones provided are updated (partial update).
    """

    land_name: Optional[str] = Field(None, min_length=2, max_length=150)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    address: Optional[str] = Field(None, min_length=5, max_length=255)
    area_sqft: Optional[float] = Field(None, gt=0)
    road_width: Optional[float] = Field(None, gt=0)
    soil_type: Optional[SoilType] = None
    land_type: Optional[LandType] = None
    water_availability: Optional[bool] = None
    electricity_availability: Optional[bool] = None
    boundary_geojson: Optional[Dict[str, Any]] = None

    @field_validator("land_name", "address")
    @classmethod
    def strip_whitespace(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else value

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"area_sqft": 2600, "road_width": 40}
        }
    )


class LandResponse(LandBase):
    """Response shape returned by every Land endpoint."""

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    # Allows Pydantic to build this schema directly from the SQLAlchemy
    # ORM object (land.id, land.land_name, ...) instead of a dict.
    model_config = ConfigDict(from_attributes=True)


class LandListResponse(BaseModel):
    """Paginated wrapper returned by GET /api/v1/lands."""

    total: int = Field(..., description="Total number of lands matching the query")
    skip: int
    limit: int
    items: list[LandResponse]

    model_config = ConfigDict(from_attributes=True)
