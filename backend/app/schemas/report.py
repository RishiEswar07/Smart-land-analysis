"""
schemas/report.py
------------------
Pydantic v2 schemas for the PDF Reports module.

Field names match src/services/reportService.js and
src/pages/Reports.jsx exactly.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ReportGenerateRequest(BaseModel):
    """POST /reports/{analysis_id}/generate has no body — analysis_id comes from the URL path."""
    pass


class ReportResponse(BaseModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    land_id: uuid.UUID
    location_label: str
    recommended_building_type: Optional[str] = None
    suitability_score: Optional[float] = None
    generated_at: datetime

    model_config = ConfigDict(from_attributes=True)
