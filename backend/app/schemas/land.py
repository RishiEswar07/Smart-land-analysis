"""
schemas/land.py
----------------
Pydantic v2 request/response schemas for the Land Management module.

- LandCreate   -> POST body (all fields required / normalized)
- LandUpdate   -> PUT body (all fields optional, partial update)
- LandResponse -> what the API returns (adds id/created_at/updated_at)
- LandListResponse -> paginated list wrapper for GET /lands
"""

import re
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.land import LandType, SoilType
from app.utils.area_units import (
    convert_to_sqft,
    normalize_input_unit,
    InputUnit,
    AreaSource,
)


def normalize_soil_type_value(v: Any) -> Optional[SoilType]:
    """
    Normalizes arbitrary or compound incoming soil type strings (e.g. 'Red Soil / Loamy',
    'sandy loam', 'Clay', 'Red', 'black cotton') into a valid SoilType enum value.
    """
    if v is None or v == "":
        return None
    if isinstance(v, SoilType):
        return v
    if not isinstance(v, str):
        return None

    val_str = v.strip()
    if not val_str:
        return None

    # Check for direct enum match (case-insensitive)
    for item in SoilType:
        if item.value.lower() == val_str.lower() or item.name.lower() == val_str.lower():
            return item

    # Tokenize compound strings with delimiters like '/', ',', ';', '&', '+', '()', 'and', 'or'
    tokens = [
        t.strip().lower()
        for t in re.split(r'[/\\|;,+&()]|and|or', val_str, flags=re.IGNORECASE)
        if t.strip()
    ]

    def _match_token(t: str) -> Optional[SoilType]:
        if any(k in t for k in ["black cotton", "black", "vertisol", "regur"]):
            return SoilType.BLACK_COTTON
        if any(k in t for k in ["red soil", "red", "acrisol", "ferralsol", "nitisol", "lixisol"]):
            return SoilType.RED_SOIL
        if any(k in t for k in ["clayey", "clay", "gleysol", "fluvisol", "stagnosol", "planosol"]):
            return SoilType.CLAYEY
        if any(k in t for k in ["sandy", "sand", "arenosol", "podzol"]):
            return SoilType.SANDY
        if any(k in t for k in ["rocky", "rock", "leptosol", "regosol"]):
            return SoilType.ROCKY
        if any(k in t for k in ["loamy", "loam", "silt", "cambisol", "luvisol", "phaeozem", "kastanozem"]):
            return SoilType.LOAMY
        return None

    # 1. Match first valid token in compound string
    for token in tokens:
        matched = _match_token(token)
        if matched is not None:
            return matched

    # 2. Scan entire lowercase string
    matched = _match_token(val_str.lower())
    if matched is not None:
        return matched

    # 3. Fallback to Loamy if unrecognized string
    return SoilType.LOAMY


class LandBase(BaseModel):
    """Fields shared by create/update/response — single source of truth for validation rules."""

    land_name: str = Field(..., min_length=2, max_length=150, description="Human-readable name for the plot")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in decimal degrees (polygon centroid or clicked marker)")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in decimal degrees (polygon centroid or clicked marker)")
    address: str = Field(..., min_length=5, max_length=255)
    
    # Area attributes
    area_sqft: Optional[float] = Field(None, gt=0, description="Normalized land area in square feet")
    area: Optional[float] = Field(None, gt=0, description="Raw numeric area value entered by user or calculated from polygon")
    input_unit: Optional[str] = Field("sq.ft", description="Unit of measurement: 'sq.ft', 'sq.m', 'cents', 'acres'")
    area_source: Optional[str] = Field("polygon", description="Provenance of area: 'direct_input' or 'polygon'")
    
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
            "Optional — for direct area input, this is null."
        ),
    )

    @field_validator("soil_type", mode="before")
    @classmethod
    def validate_soil_type(cls, value: Any) -> Optional[SoilType]:
        """Automatically cleans and maps compound/GIS soil strings to allowed SoilType enum."""
        return normalize_soil_type_value(value)

    @field_validator("land_name", "address")
    @classmethod
    def strip_whitespace(cls, value: str) -> str:
        """Trims accidental leading/trailing whitespace from free-text fields."""
        return value.strip() if value else value

    @model_validator(mode="before")
    @classmethod
    def validate_and_normalize_area_data(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        
        # 1. Normalize unit
        raw_unit = data.get("input_unit")
        norm_unit = normalize_input_unit(raw_unit) if raw_unit else InputUnit.SQFT
        data["input_unit"] = norm_unit.value

        # 2. Normalize area_source
        source = str(data.get("area_source", "polygon")).strip().lower()
        if source not in ["direct_input", "polygon"]:
            source = "polygon"
        data["area_source"] = source

        # 3. Handle raw area & area_sqft
        raw_area = data.get("area")
        if raw_area is not None:
            try:
                area_val = float(raw_area)
                if area_val <= 0:
                    raise ValueError("Area must be greater than 0")
                data["area"] = area_val
                # Automatically calculate standardized area_sqft if missing
                if not data.get("area_sqft"):
                    data["area_sqft"] = convert_to_sqft(area_val, norm_unit)
            except (TypeError, ValueError) as e:
                raise ValueError(f"Area must be a valid positive number: {e}") from e
        elif data.get("area_sqft") is not None:
            try:
                sqft_val = float(data["area_sqft"])
                if sqft_val <= 0:
                    raise ValueError("area_sqft must be greater than 0")
                data["area_sqft"] = sqft_val
                if data.get("area") is None:
                    data["area"] = sqft_val
            except (TypeError, ValueError) as e:
                raise ValueError(f"area_sqft must be a valid positive number: {e}") from e

        # 4. Enforce direct_input constraints
        if source == "direct_input":
            if data.get("area") is None and data.get("area_sqft") is None:
                raise ValueError("Area is required when area_source is 'direct_input'")

        return data


class LandCreate(LandBase):
    """Request body for POST /api/v1/lands."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "land_name": "Plot A - Madurai Bypass",
                "latitude": 9.9252,
                "longitude": 78.1198,
                "address": "Near Bypass Road, Madurai, Tamil Nadu",
                "area": 2400,
                "input_unit": "sq.ft",
                "area_source": "direct_input",
                "area_sqft": 2400,
                "road_width": 30,
                "soil_type": "Clayey",
                "land_type": "Residential",
                "water_availability": True,
                "electricity_availability": True,
                "boundary_geojson": None,
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
    area: Optional[float] = Field(None, gt=0)
    input_unit: Optional[str] = None
    area_source: Optional[str] = None
    area_sqft: Optional[float] = Field(None, gt=0)
    road_width: Optional[float] = Field(None, gt=0)
    soil_type: Optional[SoilType] = None
    land_type: Optional[LandType] = None
    water_availability: Optional[bool] = None
    electricity_availability: Optional[bool] = None
    boundary_geojson: Optional[Dict[str, Any]] = None

    @field_validator("soil_type", mode="before")
    @classmethod
    def validate_soil_type(cls, value: Any) -> Optional[SoilType]:
        """Automatically cleans and maps compound/GIS soil strings to allowed SoilType enum."""
        return normalize_soil_type_value(value)

    @field_validator("land_name", "address")
    @classmethod
    def strip_whitespace(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else value

    @model_validator(mode="before")
    @classmethod
    def validate_update_area(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "input_unit" in data and data["input_unit"] is not None:
            data["input_unit"] = normalize_input_unit(data["input_unit"]).value
        if "area" in data and data["area"] is not None:
            unit = data.get("input_unit", "sq.ft")
            data["area_sqft"] = convert_to_sqft(float(data["area"]), unit)
        return data

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"area": 2600, "input_unit": "sq.ft", "road_width": 40}
        }
    )


class LandResponse(LandBase):
    """Response shape returned by every Land endpoint."""

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LandListResponse(BaseModel):
    """Paginated wrapper returned by GET /api/v1/lands."""

    total: int = Field(..., description="Total number of lands matching the query")
    skip: int
    limit: int
    items: list[LandResponse]

    model_config = ConfigDict(from_attributes=True)
