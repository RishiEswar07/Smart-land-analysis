"""
services/report_service.py
-----------------------------
Business logic for PDF Report generation and retrieval.
"""

import os
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.analysis import Analysis
from app.models.land import Land
from app.models.report import Report
from app.services.exceptions import NotFoundError
from app.utils.pdf_generator import generate_land_report_pdf


def _reports_dir() -> str:
    path = os.path.join(os.getcwd(), settings.REPORTS_DIR)
    os.makedirs(path, exist_ok=True)
    return path


async def generate_report(db: AsyncSession, analysis_id: uuid.UUID, user_id: uuid.UUID) -> Report:
    """
    Generates a PDF for the given analysis (must belong to the current
    user's land), saves it to disk, and records a Report row.
    Raises NotFoundError if the analysis doesn't exist or doesn't
    belong to this user's land.
    """
    result = await db.execute(
        select(Analysis, Land)
        .join(Land, Analysis.land_id == Land.id)
        .where(Analysis.id == analysis_id, Land.user_id == user_id)
    )
    row = result.first()
    if row is None:
        raise NotFoundError(entity="Analysis", identifier=str(analysis_id))
    analysis, land = row

    pdf_bytes = generate_land_report_pdf(land, analysis)

    filename = f"report_{analysis.id}.pdf"
    file_path = os.path.join(_reports_dir(), filename)
    with open(file_path, "wb") as f:
        f.write(pdf_bytes)

    report = Report(analysis_id=analysis.id, land_id=land.id, file_path=file_path)
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


async def get_report_file(db: AsyncSession, report_id: uuid.UUID, user_id: uuid.UUID) -> tuple[str, str]:
    """
    Returns (file_path, land_name) for a report the current user owns.
    Raises NotFoundError otherwise.
    """
    result = await db.execute(
        select(Report, Land)
        .join(Land, Report.land_id == Land.id)
        .where(Report.id == report_id, Land.user_id == user_id)
    )
    row = result.first()
    if row is None:
        raise NotFoundError(entity="Report", identifier=str(report_id))
    report, land = row

    if not os.path.exists(report.file_path):
        raise NotFoundError(entity="Report file", identifier=str(report_id))

    return report.file_path, land.land_name


async def list_reports(db: AsyncSession, user_id: uuid.UUID) -> list[dict]:
    """All reports for the current user's lands, newest first, enriched with land/analysis summary fields."""
    result = await db.execute(
        select(Report, Land, Analysis)
        .join(Land, Report.land_id == Land.id)
        .join(Analysis, Report.analysis_id == Analysis.id)
        .where(Land.user_id == user_id)
        .order_by(Report.created_at.desc())
    )
    rows = result.all()

    items = []
    for report, land, analysis in rows:
        items.append(
            {
                "id": report.id,
                "analysis_id": report.analysis_id,
                "land_id": land.id,
                "location_label": land.land_name or land.address,
                "recommended_building_type": analysis.recommended_building_type,
                "suitability_score": analysis.suitability_score,
                "generated_at": report.created_at,
            }
        )
    return items
