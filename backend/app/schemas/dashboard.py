"""
schemas/dashboard.py
---------------------
Pydantic v2 response schemas for the Dashboard module.

Field names match src/pages/Dashboard.jsx exactly.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DashboardSummary(BaseModel):
    total_lands: int
    total_reports: int
    average_suitability_score: float
    top_building_type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BuildingDistributionItem(BaseModel):
    building_type: str
    count: int


class RecentAnalysisItem(BaseModel):
    id: uuid.UUID
    land_id: uuid.UUID
    location_label: str
    suitability_score: float
    recommended_building_type: str
    flood_risk: str
    environmental_risk: str
    risk_score: float
    risk_level: str
    analyzed_at: datetime

    model_config = ConfigDict(from_attributes=True)
