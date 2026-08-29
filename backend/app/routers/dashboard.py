"""
routers/dashboard.py
----------------------
REST API endpoints for the Dashboard module.

    GET /api/v1/dashboard/summary
    GET /api/v1/dashboard/building-distribution
    GET /api/v1/dashboard/recent-analyses?limit=N

All scoped to the logged-in user's own lands.
Matches src/services/dashboardService.js exactly.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.dashboard import BuildingDistributionItem, DashboardSummary, RecentAnalysisItem
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary, status_code=status.HTTP_200_OK)
async def summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardSummary:
    data = await dashboard_service.get_summary(db, current_user.id)
    return DashboardSummary(**data)


@router.get("/building-distribution", response_model=list[BuildingDistributionItem], status_code=status.HTTP_200_OK)
async def building_distribution(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BuildingDistributionItem]:
    data = await dashboard_service.get_building_distribution(db, current_user.id)
    return [BuildingDistributionItem(**item) for item in data]


@router.get("/recent-analyses", response_model=list[RecentAnalysisItem], status_code=status.HTTP_200_OK)
async def recent_analyses(
    limit: int = Query(8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[RecentAnalysisItem]:
    data = await dashboard_service.get_recent_analyses(db, current_user.id, limit=limit)
    return [RecentAnalysisItem(**item) for item in data]
