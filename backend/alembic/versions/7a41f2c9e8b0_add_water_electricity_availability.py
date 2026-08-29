"""add water and electricity availability to lands

Revision ID: 7a41f2c9e8b0
Revises: d088a63f3b31
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "7a41f2c9e8b0"
down_revision: Union[str, None] = "d088a63f3b31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default here backfills existing rows with False, then the
    # default is dropped in the same migration so future inserts must
    # explicitly supply a value (matches the Pydantic schema requiring it).
    op.add_column(
        "lands",
        sa.Column("water_availability", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "lands",
        sa.Column("electricity_availability", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("lands", "water_availability", server_default=None)
    op.alter_column("lands", "electricity_availability", server_default=None)


def downgrade() -> None:
    op.drop_column("lands", "electricity_availability")
    op.drop_column("lands", "water_availability")
