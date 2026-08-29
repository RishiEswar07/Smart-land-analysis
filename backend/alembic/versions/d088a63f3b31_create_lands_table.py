"""create lands table

Revision ID: d088a63f3b31
Revises:
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d088a63f3b31"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lands",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("land_name", sa.String(length=150), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("area_sqft", sa.Float(), nullable=False),
        sa.Column("road_width", sa.Float(), nullable=False),
        sa.Column(
            "soil_type",
            sa.Enum(
                "CLAYEY", "SANDY", "LOAMY", "ROCKY", "BLACK_COTTON", "RED_SOIL",
                name="soil_type_enum",
            ),
            nullable=False,
        ),
        sa.Column(
            "land_type",
            sa.Enum(
                "RESIDENTIAL", "COMMERCIAL", "INDUSTRIAL", "AGRICULTURAL",
                name="land_type_enum",
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_lands_id"), "lands", ["id"], unique=True)
    op.create_index(op.f("ix_lands_land_name"), "lands", ["land_name"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lands_land_name"), table_name="lands")
    op.drop_index(op.f("ix_lands_id"), table_name="lands")
    op.drop_table("lands")
    # Drop the native Postgres enum types created for this table
    sa.Enum(name="soil_type_enum").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="land_type_enum").drop(op.get_bind(), checkfirst=True)
