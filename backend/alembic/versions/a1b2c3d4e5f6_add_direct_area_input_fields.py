"""add direct area input fields to lands

Revision ID: a1b2c3d4e5f6
Revises: 3383c8c39d01
Create Date: 2026-10-02 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "3383c8c39d01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lands", sa.Column("area", sa.Float(), nullable=True))
    op.add_column("lands", sa.Column("input_unit", sa.String(length=20), nullable=True, server_default="sq.ft"))
    op.add_column("lands", sa.Column("area_source", sa.String(length=30), nullable=True, server_default="polygon"))


def downgrade() -> None:
    op.drop_column("lands", "area_source")
    op.drop_column("lands", "input_unit")
    op.drop_column("lands", "area")
