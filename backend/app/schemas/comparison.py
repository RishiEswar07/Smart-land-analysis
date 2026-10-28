"""
schemas/comparison.py
---------------------
Pydantic v2 schemas for the Multi-Parcel Comparison feature.
"""

import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ParcelComparisonRequest(BaseModel):
    """Request payload for comparing 2 or 3 land parcels."""

    parcel_ids: List[uuid.UUID] = Field(
        ...,
        min_length=2,
        max_length=3,
        description="List of 2 or 3 unique land parcel UUIDs to compare",
    )
    building_type: Optional[str] = Field(
        "Individual House",
        description="Target building occupancy type for suitability and planning evaluation",
    )

    @field_validator("parcel_ids")
    @classmethod
    def validate_unique_parcels(cls, v: List[uuid.UUID]) -> List[uuid.UUID]:
        if len(v) < 2:
            raise ValueError("At least 2 parcels are required for comparison.")
        if len(v) > 3:
            raise ValueError("A maximum of 3 parcels can be compared simultaneously.")
        if len(set(v)) != len(v):
            raise ValueError("Duplicate parcel IDs are not allowed in comparison.")
        return v

    @field_validator("building_type")
    @classmethod
    def normalize_building_type(cls, v: Optional[str]) -> str:
        if not v or not v.strip():
            return "Individual House"
        cleaned = v.strip()
        mapping = {
            "individual house": "Individual House",
            "residential house": "Individual House",
            "apartment": "Apartment",
            "commercial building": "Commercial Building",
            "commercial": "Commercial Building",
            "hospital": "Hospital",
            "hospital/clinic": "Hospital",
            "school": "School",
        }
        return mapping.get(cleaned.lower(), cleaned)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "parcel_ids": [
                    "3fa85f64-5717-4562-b3fc-2c963f66afa6",
                    "7ca85f64-5717-4562-b3fc-2c963f66afa7",
                ],
                "building_type": "Hospital",
            }
        }
    )


class AreaBreakdown(BaseModel):
    """Multi-unit area conversions for side-by-side comparison."""

    sqft: float
    sqm: float
    cents: float
    acres: float
    source: str
    formatted_display: str


class FacilitiesDistance(BaseModel):
    """Geodesic distance to nearest public amenities in kilometers."""

    nearest_school_km: Optional[float] = None
    nearest_hospital_km: Optional[float] = None
    nearest_commercial_km: Optional[float] = None


class BuildingPlanningComparison(BaseModel):
    """TNCDBR 2019 statutory building planning evaluation for the target building type."""

    status: str
    rule_reference: Optional[str] = None
    rule_category: Optional[str] = None
    base_fsi: Optional[float] = None
    max_permissible_fsi: Optional[float] = None
    theoretical_max_floor_area_sqft: Optional[float] = None
    practical_achievable_floor_area_sqft: Optional[float] = None
    is_geometry_verified: bool = False
    front_setback_ft: Optional[float] = None
    rear_setback_ft: Optional[float] = None
    side_setback1_ft: Optional[float] = None
    side_setback2_ft: Optional[float] = None
    max_height_ft: Optional[float] = None
    permissible_floors: Optional[str] = None
    road_adequacy_status: Optional[str] = None
    road_adequacy_message: Optional[str] = None
    min_required_road_ft: Optional[float] = None
    feasibility_status: Optional[str] = None
    spatial_feasibility_note: Optional[str] = None


class ParcelComparisonItem(BaseModel):
    """All comparative metrics for a single land parcel."""

    land_id: uuid.UUID
    land_name: str
    address: str
    latitude: float
    longitude: float
    land_type: str
    soil_type: Optional[str] = None
    area_sqft: float
    area_breakdown: AreaBreakdown
    road_width_ft: Optional[float] = None
    water_availability: Optional[bool] = None
    electricity_availability: Optional[bool] = None

    # Analysis metrics (None if parcel is not yet analyzed)
    has_analysis: bool = False
    analysis_id: Optional[uuid.UUID] = None
    analyzed_at: Optional[str] = None
    suitability_score: Optional[float] = None
    suitability_rating: Optional[str] = None
    target_building_suitability_score: Optional[float] = None
    recommended_building_type: Optional[str] = None
    overall_risk_score: Optional[float] = None
    overall_risk_level: Optional[str] = None
    flood_risk_level: Optional[str] = None
    flood_risk_score: Optional[float] = None
    environmental_risk_level: Optional[str] = None
    environmental_risk_score: Optional[float] = None
    infrastructure_score: Optional[float] = None
    traffic_accessibility_score: Optional[float] = None

    # Amenities
    facilities: FacilitiesDistance

    # TNCDBR Planning Engine
    planning_rules: BuildingPlanningComparison

    # Data Completeness
    data_completeness_pct: float
    data_completeness_status: str
    missing_data_items: List[str]


class ParcelRankingItem(BaseModel):
    """Rank and qualitative assessment of a parcel for the target building type."""

    parcel_id: uuid.UUID
    land_name: str
    rank: int
    composite_score: float
    is_recommended: bool
    status: str
    key_strengths: List[str]
    key_weaknesses: List[str]
    regulatory_summary: str


class ComparisonSummary(BaseModel):
    """Executive comparison insights, top recommendation, and legal disclaimers."""

    target_building_type: str
    winner_parcel_id: Optional[uuid.UUID] = None
    winner_parcel_name: Optional[str] = None
    verdict: str
    recommendation_confidence: str  # "High", "Moderate", "Insufficient Data"
    comparison_insights: List[str]
    disclaimer: str


class ParcelComparisonResponse(BaseModel):
    """Complete response payload for multi-parcel comparison."""

    target_building_type: str
    total_parcels: int
    parcels: List[ParcelComparisonItem]
    rankings: List[ParcelRankingItem]
    summary: ComparisonSummary

    model_config = ConfigDict(from_attributes=True)
