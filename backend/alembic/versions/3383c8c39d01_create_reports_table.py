"""create reports table

Revision ID: 3383c8c39d01
Revises: 7e08f1ae7ace
Create Date: 2026-08-09 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "3383c8c39d01"
down_revision: Union[str, None] = "7e08f1ae7ace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("analysis_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("land_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("lands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_reports_id"), "reports", ["id"], unique=True)
    op.create_index(op.f("ix_reports_analysis_id"), "reports", ["analysis_id"], unique=False)
    op.create_index(op.f("ix_reports_land_id"), "reports", ["land_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_reports_land_id"), table_name="reports")
    op.drop_index(op.f("ix_reports_analysis_id"), table_name="reports")
    op.drop_index(op.f("ix_reports_id"), table_name="reports")
    op.drop_table("reports")
