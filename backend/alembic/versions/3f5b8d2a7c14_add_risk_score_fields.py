"""add dedicated risk score fields to analyses

Revision ID: 3f5b8d2a7c14
Revises: 9c72e5a1d4f6
Create Date: 2026-08-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "3f5b8d2a7c14"
down_revision: Union[str, None] = "9c72e5a1d4f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backfill existing rows with a neutral default, then drop the
    # server_default so future inserts must supply a real computed value.
    op.add_column("analyses", sa.Column("risk_score", sa.Float(), nullable=False, server_default="50.0"))
    op.add_column("analyses", sa.Column("risk_level", sa.String(length=20), nullable=False, server_default="Moderate"))
    op.add_column(
        "analyses",
        sa.Column("risk_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
    )
    op.alter_column("analyses", "risk_score", server_default=None)
    op.alter_column("analyses", "risk_level", server_default=None)
    op.alter_column("analyses", "risk_breakdown", server_default=None)


def downgrade() -> None:
    op.drop_column("analyses", "risk_breakdown")
    op.drop_column("analyses", "risk_level")
    op.drop_column("analyses", "risk_score")
