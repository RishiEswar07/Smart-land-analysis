"""
services/dashboard_service.py
-------------------------------
Aggregate read-only queries powering the Dashboard, all scoped to a
single user's lands (via Land.user_id) — one user's dashboard never
shows another user's data.
"""

import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import Analysis
from app.models.land import Land
from app.models.report import Report


async def get_summary(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Total lands, total reports, average suitability score, and most-recommended building type — all for this user."""
    lands_result = await db.execute(select(Land).where(Land.user_id == user_id))
    lands = list(lands_result.scalars().all())
    land_ids = [land.id for land in lands]

    if not land_ids:
        return {
            "total_lands": 0,
            "total_reports": 0,
            "average_suitability_score": 0.0,
            "top_building_type": None,
        }

    analyses_result = await db.execute(select(Analysis).where(Analysis.land_id.in_(land_ids)))
    analyses = list(analyses_result.scalars().all())

    reports_result = await db.execute(select(Report).where(Report.land_id.in_(land_ids)))
    total_reports = len(list(reports_result.scalars().all()))

    if analyses:
        avg_score = round(sum(a.suitability_score for a in analyses) / len(analyses), 1)
        top_type = Counter(a.recommended_building_type for a in analyses).most_common(1)[0][0]
    else:
        avg_score = 0.0
        top_type = None

    return {
        "total_lands": len(lands),
        "total_reports": total_reports,
        "average_suitability_score": avg_score,
        "top_building_type": top_type,
    }


async def get_building_distribution(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """Count of analyses per recommended building type, for this user's lands."""
    land_ids_result = await db.execute(select(Land.id).where(Land.user_id == user_id))
    land_ids = [row[0] for row in land_ids_result.all()]
    if not land_ids:
        return []

    analyses_result = await db.execute(select(Analysis).where(Analysis.land_id.in_(land_ids)))
    analyses = list(analyses_result.scalars().all())

    counts = Counter(a.recommended_building_type for a in analyses)
    return [{"building_type": building_type, "count": count} for building_type, count in counts.most_common()]


async def get_recent_analyses(db: AsyncSession, user_id: uuid.UUID, limit: int = 8) -> list[dict]:
    """Most recent analyses for this user's lands, newest first, with a human-readable location_label."""
    result = await db.execute(
        select(Analysis, Land)
        .join(Land, Analysis.land_id == Land.id)
        .where(Land.user_id == user_id)
        .order_by(Analysis.created_at.desc())
        .limit(limit)
    )
    rows = result.all()

    items = []
    for analysis, land in rows:
        items.append(
            {
                "id": analysis.id,
                "land_id": land.id,
                "location_label": land.land_name or land.address,
                "suitability_score": analysis.suitability_score,
                "recommended_building_type": analysis.recommended_building_type,
                "flood_risk": analysis.flood_risk,
                "environmental_risk": analysis.environmental_risk,
                "risk_score": analysis.risk_score,
                "risk_level": analysis.risk_level,
                "analyzed_at": analysis.created_at,
            }
        )
    return items
