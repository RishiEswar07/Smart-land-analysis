"""create analyses table

Revision ID: 9c72e5a1d4f6
Revises: 7a41f2c9e8b0
Create Date: 2026-08-08 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "9c72e5a1d4f6"
down_revision: Union[str, None] = "7a41f2c9e8b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("land_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("lands.id", ondelete="CASCADE"), nullable=False),
        sa.Column("suitability_score", sa.Float(), nullable=False),
        sa.Column("recommended_building_type", sa.String(length=50), nullable=False),
        sa.Column("flood_risk", sa.String(length=20), nullable=False),
        sa.Column("environmental_risk", sa.String(length=20), nullable=False),
        sa.Column("infrastructure_score", sa.Float(), nullable=False),
        sa.Column("traffic_accessibility_score", sa.Float(), nullable=False),
        sa.Column("ai_explanation", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_analyses_id"), "analyses", ["id"], unique=True)
    op.create_index(op.f("ix_analyses_land_id"), "analyses", ["land_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_analyses_land_id"), table_name="analyses")
    op.drop_index(op.f("ix_analyses_id"), table_name="analyses")
    op.drop_table("analyses")
