"""
test_unit_security_ownership.py
---------------------------------
Unit tests for authentication, JWT security, and strict resource ownership
isolation across Land Management, Analysis, and Report endpoints.
Does not depend on external databases or live network.
"""

import os
import sys
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.security import create_access_token, decode_access_token
from app.models.analysis import Analysis
from app.models.land import Land, LandType, SoilType
from app.models.user import User
from app.services import analysis_service, land_service, report_service
from app.services.exceptions import NotFoundError


# ---------------------------------------------------------------------------
# 1. JWT Security & Expiration Tests
# ---------------------------------------------------------------------------

def test_jwt_create_and_decode_valid():
    user_id = str(uuid.uuid4())
    token = create_access_token(subject=user_id, expires_minutes=15)
    assert token is not None and isinstance(token, str)

    payload = decode_access_token(token)
    assert payload is not None
    assert payload.get("sub") == user_id
    assert payload.get("type") == "access"
    assert "exp" in payload


def test_jwt_expired_token_rejected():
    user_id = str(uuid.uuid4())
    # Create token expired in the past
    token = create_access_token(subject=user_id, expires_minutes=-10)
    payload = decode_access_token(token)
    assert payload is None, "Expired token must be rejected"


def test_jwt_tampered_token_rejected():
    user_id = str(uuid.uuid4())
    token = create_access_token(subject=user_id, expires_minutes=15)
    tampered_token = token[:-5] + "ABCDE"
    payload = decode_access_token(tampered_token)
    assert payload is None, "Tampered token must be rejected"


# ---------------------------------------------------------------------------
# 2. Land Ownership Isolation Tests (User A vs User B)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_user_a_can_access_own_land():
    user_a_id = uuid.uuid4()
    land_id = uuid.uuid4()
    mock_land = Land(
        id=land_id,
        user_id=user_a_id,
        land_name="User A Parcel",
        latitude=13.0827,
        longitude=80.2707,
        area_sqft=2400.0,
        land_type=LandType.RESIDENTIAL,
        soil_type=SoilType.LOAMY,
    )

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_land
    mock_db.execute.return_value = mock_result

    land = await land_service.get_land(mock_db, land_id, user_id=user_a_id)
    assert land.id == land_id
    assert land.user_id == user_a_id


@pytest.mark.asyncio
async def test_user_b_cannot_access_user_a_land():
    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()
    land_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    # Query for land_id where user_id == user_b_id returns None
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError):
        await land_service.get_land(mock_db, land_id, user_id=user_b_id)


@pytest.mark.asyncio
async def test_user_b_cannot_update_user_a_land():
    user_b_id = uuid.uuid4()
    land_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    payload = MagicMock()
    payload.model_dump.return_value = {"land_name": "Hijacked Parcel"}

    with pytest.raises(NotFoundError):
        await land_service.update_land(mock_db, land_id, payload, user_id=user_b_id)


@pytest.mark.asyncio
async def test_user_b_cannot_delete_user_a_land():
    user_b_id = uuid.uuid4()
    land_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError):
        await land_service.delete_land(mock_db, land_id, user_id=user_b_id)


# ---------------------------------------------------------------------------
# 3. Analysis Ownership Isolation Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_user_b_cannot_predict_for_user_a_land():
    user_b_id = uuid.uuid4()
    land_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError):
        await analysis_service.predict_for_land(mock_db, land_id, user_id=user_b_id)


@pytest.mark.asyncio
async def test_user_b_cannot_get_user_a_analysis():
    user_b_id = uuid.uuid4()
    analysis_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError):
        await analysis_service.get_analysis(mock_db, analysis_id, user_id=user_b_id)


@pytest.mark.asyncio
async def test_user_b_cannot_get_user_a_detailed_analysis():
    user_b_id = uuid.uuid4()
    analysis_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError):
        await analysis_service.get_detailed_analysis_by_id(mock_db, analysis_id, user_id=user_b_id)


@pytest.mark.asyncio
async def test_user_b_cannot_generate_or_export_user_a_report():
    user_b_id = uuid.uuid4()
    analysis_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.first.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError):
        await report_service.generate_report(mock_db, analysis_id, user_id=user_b_id)

    with pytest.raises(NotFoundError):
        await report_service.get_or_generate_pdf_bytes(mock_db, analysis_id, user_id=user_b_id)

    with pytest.raises(NotFoundError):
        await report_service.get_or_generate_excel_report(mock_db, analysis_id, user_id=user_b_id)
