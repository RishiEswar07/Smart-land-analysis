"""add user_id and boundary_geojson to lands

Revision ID: 7e08f1ae7ace
Revises: 5c87ac181198
Create Date: 2026-08-09 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "7e08f1ae7ace"
down_revision: Union[str, None] = "5c87ac181198"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Both columns nullable: user_id because pre-Auth rows have no owner
    # to backfill, boundary_geojson because pre-polygon-drawing rows have
    # no boundary shape to backfill. Neither is a data-loss concern —
    # they're additive.
    op.add_column("lands", sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("lands", sa.Column("boundary_geojson", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.create_index(op.f("ix_lands_user_id"), "lands", ["user_id"], unique=False)
    op.create_foreign_key(
        "fk_lands_user_id_users",
        "lands",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_lands_user_id_users", "lands", type_="foreignkey")
    op.drop_index(op.f("ix_lands_user_id"), table_name="lands")
    op.drop_column("lands", "boundary_geojson")
    op.drop_column("lands", "user_id")
