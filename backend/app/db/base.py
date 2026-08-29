"""
db/base.py
----------
Single import point that pulls in every ORM model so that:
  1) Alembic's autogenerate can detect all tables via Base.metadata
  2) `init_db.create_all()` (dev/testing convenience) sees all models

IMPORTANT: As new models are added in later modules (User, Land,
NearbyFacility, FloodRisk, Analysis, etc.) they MUST be imported
here. Nothing else needs to change - Alembic and metadata.create_all
both walk Base.metadata.tables automatically.
"""

from app.db.base_class import Base  # noqa: F401

# ------------------------------------------------------------------
# Model imports go below as each module is implemented.
# ------------------------------------------------------------------

from app.models.user import User  # noqa: F401  (Auth module)
from app.models.land import Land  # noqa: F401  (Module 2)
from app.models.analysis import Analysis  # noqa: F401  (Module 6)
from app.models.report import Report  # noqa: F401  (Reports module)

# Still to be added in later modules:
#
# from app.models.facility import NearbyFacility
# from app.models.flood_risk import FloodRisk
# ------------------------------------------------------------------
