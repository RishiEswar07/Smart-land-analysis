"""
routers/analysis.py
--------------------
REST API endpoints for the AI Suitability module (Module 6).

Endpoints:
    POST /api/v1/analysis/predict   body: { land_id }
    GET  /api/v1/analysis/{id}

Matches src/services/analysisService.js on the frontend exactly.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.analysis import AnalysisPredictRequest, AnalysisResponse
from app.services import analysis_service
from app.services.exceptions import NotFoundError

router = APIRouter(prefix="/analysis", tags=["AI Suitability Analysis"])


@router.post(
    "/predict",
    response_model=AnalysisResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run the suitability engine for a land and return the result",
)
async def predict(
    payload: AnalysisPredictRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalysisResponse:
    """
    Runs the suitability scoring engine against the given land and
    persists the result. Returns 404 if the land doesn't exist.
    """
    try:
        analysis = await analysis_service.predict_for_land(db, payload.land_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return AnalysisResponse.model_validate(analysis)


@router.get(
    "/{analysis_id}",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a previously computed analysis result by id",
)
async def get_analysis(
    analysis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnalysisResponse:
    """Fetches one analysis result. Returns 404 if it doesn't exist."""
    try:
        analysis = await analysis_service.get_analysis(db, analysis_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return AnalysisResponse.model_validate(analysis)
