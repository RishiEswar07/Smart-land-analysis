"""
schemas/analysis.py
--------------------
Pydantic v2 request/response schemas for the AI Suitability module.

Field names here match src/pages/LandAnalysis.jsx and
src/services/analysisService.js on the frontend exactly — this is the
contract both sides were already built against.
"""

import uuid
from datetime import datetime
from typing import Dict

from pydantic import BaseModel, ConfigDict, Field


class AnalysisPredictRequest(BaseModel):
    """Request body for POST /api/v1/analysis/predict."""

    land_id: uuid.UUID

    model_config = ConfigDict(
        json_schema_extra={"example": {"land_id": "b3f1c9a0-1234-4a5b-9c6d-abcdef123456"}}
    )


class RiskFactorScore(BaseModel):
    """One row of the explainable risk breakdown: 0-100, higher = more risk."""

    label: str
    score: float = Field(..., ge=0, le=100)
    weight: float = Field(..., description="Contribution weight used in the overall risk_score (0-1)")


class AnalysisResponse(BaseModel):
    """Response returned by both /analysis/predict and /analysis/{id}."""

    id: uuid.UUID
    land_id: uuid.UUID

    suitability_score: float = Field(..., ge=0, le=100)
    recommended_building_type: str

    flood_risk: str
    environmental_risk: str

    infrastructure_score: float = Field(..., ge=0, le=100)
    traffic_accessibility_score: float = Field(..., ge=0, le=100)

    risk_score: float = Field(..., ge=0, le=100)
    risk_level: str
    risk_breakdown: Dict[str, RiskFactorScore]

    ai_explanation: str

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FactorScoreItem(BaseModel):
    """One factor score in the detailed suitability breakdown."""
    name: str
    score: float | None = Field(None, description="Score 0-100, or None if data unavailable")
    impact: str = Field(..., description="Positive, Moderate, Negative, or Data unavailable")
    weight: float | None = None
    description: str = ""


class DataQualityItem(BaseModel):
    """Quality and completeness metric for one data source category."""
    category: str
    completeness_pct: float = Field(..., ge=0, le=100)
    status: str
    basis: str


class ProvenanceItem(BaseModel):
    """Exact provenance and metadata for an integrated GIS data source."""
    dataset_name: str
    source: str
    data_date: str
    resolution: str
    processing_method: str
    last_updated: str


class DetailedAnalysisResponse(BaseModel):
    """Complete detailed land analysis response with factors, provenance, quality & breakdown."""
    property_info: dict
    suitability: dict
    factors: list[FactorScoreItem]
    risks: dict
    score_calculation: dict
    data_quality: dict
    data_sources: list[ProvenanceItem]
    historical_change: dict
    recommendation: dict
    disclaimer: str

    model_config = ConfigDict(from_attributes=True)
