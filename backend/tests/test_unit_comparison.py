"""
tests/test_unit_comparison.py
-----------------------------
Unit tests for the Multi-Parcel Comparison feature:
- 2-parcel and 3-parcel comparison
- Duplicate parcel rejection
- Parcel count bounds validation (min 2, max 3)
- Strict user ownership isolation
- Missing analysis graceful handling
- Building-specific road adequacy and ranking
"""

import os
import sys
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.analysis import Analysis
from app.models.land import Land, LandType, SoilType
from app.models.user import User
from app.schemas.comparison import ParcelComparisonRequest, ParcelComparisonResponse
from app.services import comparison_service
from app.services.exceptions import NotFoundError


def _make_mock_user(user_id=None):
    u = MagicMock(spec=User)
    u.id = user_id or uuid.uuid4()
    u.email = "testuser@example.com"
    return u


def _make_mock_land(land_id=None, user_id=None, name="Parcel A", area_sqft=2400.0, road_width=30.0, soil_type=SoilType.RED_SOIL, land_type=LandType.RESIDENTIAL):
    l = MagicMock(spec=Land)
    l.id = land_id or uuid.uuid4()
    l.user_id = user_id or uuid.uuid4()
    l.land_name = name
    l.address = f"123 {name} Road, Chennai"
    l.latitude = 13.0827
    l.longitude = 80.2707
    l.area_sqft = area_sqft
    l.area = area_sqft
    l.input_unit = "sq.ft"
    l.area_source = "polygon"
    l.road_width = road_width
    l.soil_type = soil_type
    l.land_type = land_type
    l.water_availability = True
    l.electricity_availability = True
    l.boundary_geojson = None
    l.facilities_cache = {
        "categories": {
            "schools": [{"name": "Public School", "distance_km": 0.8}],
            "hospitals": [{"name": "City Clinic", "distance_km": 1.2}],
            "commercial": [{"name": "Supermarket", "distance_km": 0.4}],
        }
    }
    return l


def _make_mock_analysis(land_id, suit_score=80.0, btype="Individual House", flood_risk="Low", flood_score=20.0):
    a = MagicMock(spec=Analysis)
    a.id = uuid.uuid4()
    a.land_id = land_id
    a.suitability_score = suit_score
    a.recommended_building_type = btype
    a.risk_score = 100.0 - suit_score
    a.risk_level = "Low" if suit_score >= 70 else ("Moderate" if suit_score >= 45 else "High")
    a.flood_risk = flood_risk
    a.environmental_risk = "Low"
    a.infrastructure_score = 85.0
    a.traffic_accessibility_score = 80.0
    a.created_at = None
    a.risk_breakdown = {
        "flood_risk": {"score": flood_score, "label": "Flood Risk"},
        "environmental_risk": {"score": 15.0, "label": "Environmental Risk"},
        "building_suitability_distribution": [
            {"name": "Individual House", "probability": 85.0, "suitability": suit_score},
            {"name": "Apartment", "probability": 65.0, "suitability": suit_score * 0.8},
            {"name": "Hospital/Clinic", "probability": 40.0, "suitability": suit_score * 0.5},
            {"name": "School", "probability": 50.0, "suitability": suit_score * 0.6},
            {"name": "Shopping Complex", "probability": 55.0, "suitability": suit_score * 0.7},
        ],
    }
    return a


# =========================================================================
# 1. Pydantic Schema Validation Tests
# =========================================================================

def test_request_validation_valid_2_parcels():
    p1 = uuid.uuid4()
    p2 = uuid.uuid4()
    req = ParcelComparisonRequest(parcel_ids=[p1, p2], building_type="Hospital")
    assert len(req.parcel_ids) == 2
    assert req.building_type == "Hospital"


def test_request_validation_valid_3_parcels():
    p1, p2, p3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    req = ParcelComparisonRequest(parcel_ids=[p1, p2, p3])
    assert len(req.parcel_ids) == 3
    assert req.building_type == "Individual House"


def test_request_validation_rejects_duplicates():
    p1 = uuid.uuid4()
    with pytest.raises(ValueError, match="Duplicate parcel IDs"):
        ParcelComparisonRequest(parcel_ids=[p1, p1])


def test_request_validation_rejects_single_parcel():
    p1 = uuid.uuid4()
    with pytest.raises(ValueError):
        ParcelComparisonRequest(parcel_ids=[p1])


def test_request_validation_rejects_more_than_3_parcels():
    p = [uuid.uuid4() for _ in range(4)]
    with pytest.raises(ValueError):
        ParcelComparisonRequest(parcel_ids=p)


# =========================================================================
# 2. Service-Level Ownership & Isolation Tests
# =========================================================================

@pytest.mark.asyncio
async def test_comparison_enforces_user_ownership():
    user = _make_mock_user()
    p1 = uuid.uuid4()
    p2 = uuid.uuid4()

    # DB only returns 1 land because the other belongs to someone else
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [_make_mock_land(land_id=p1, user_id=user.id)]
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError, match="do not belong to the authenticated user"):
        await comparison_service.compare_parcels(mock_db, user.id, [p1, p2])


@pytest.mark.asyncio
async def test_comparison_2_parcels_successful():
    user = _make_mock_user()
    p1_id, p2_id = uuid.uuid4(), uuid.uuid4()
    land1 = _make_mock_land(land_id=p1_id, user_id=user.id, name="Greenfield", area_sqft=3000.0, road_width=40.0)
    land2 = _make_mock_land(land_id=p2_id, user_id=user.id, name="CityPlot", area_sqft=2000.0, road_width=20.0)

    an1 = _make_mock_analysis(p1_id, suit_score=85.0)
    an2 = _make_mock_analysis(p2_id, suit_score=70.0)

    mock_db = AsyncMock()
    # First call returns lands, subsequent calls return analyses
    mock_lands_res = MagicMock()
    mock_lands_res.scalars.return_value.all.return_value = [land1, land2]

    mock_an1_res = MagicMock()
    mock_an1_res.scalar_one_or_none.return_value = an1
    mock_an2_res = MagicMock()
    mock_an2_res.scalar_one_or_none.return_value = an2

    mock_db.execute.side_effect = [mock_lands_res, mock_an1_res, mock_an2_res]

    resp = await comparison_service.compare_parcels(
        mock_db, user.id, [p1_id, p2_id], target_building_type="Individual House"
    )

    assert isinstance(resp, ParcelComparisonResponse)
    assert resp.total_parcels == 2
    assert len(resp.parcels) == 2
    assert len(resp.rankings) == 2
    assert resp.rankings[0].rank == 1
    assert resp.rankings[1].rank == 2
    assert resp.summary.winner_parcel_id == p1_id
    assert resp.summary.winner_parcel_name == "Greenfield"
    assert resp.summary.recommendation_confidence in ["High", "Moderate"]
    assert "TNCDBR" in resp.summary.disclaimer


@pytest.mark.asyncio
async def test_comparison_3_parcels_successful():
    user = _make_mock_user()
    p1, p2, p3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    l1 = _make_mock_land(land_id=p1, user_id=user.id, name="Plot 1", area_sqft=4000.0, road_width=45.0)
    l2 = _make_mock_land(land_id=p2, user_id=user.id, name="Plot 2", area_sqft=2500.0, road_width=30.0)
    l3 = _make_mock_land(land_id=p3, user_id=user.id, name="Plot 3", area_sqft=1800.0, road_width=15.0)

    an1 = _make_mock_analysis(p1, suit_score=90.0)
    an2 = _make_mock_analysis(p2, suit_score=75.0)
    an3 = _make_mock_analysis(p3, suit_score=60.0)

    mock_db = AsyncMock()
    mock_lands_res = MagicMock()
    mock_lands_res.scalars.return_value.all.return_value = [l1, l2, l3]

    m_an1, m_an2, m_an3 = MagicMock(), MagicMock(), MagicMock()
    m_an1.scalar_one_or_none.return_value = an1
    m_an2.scalar_one_or_none.return_value = an2
    m_an3.scalar_one_or_none.return_value = an3

    mock_db.execute.side_effect = [mock_lands_res, m_an1, m_an2, m_an3]

    resp = await comparison_service.compare_parcels(
        mock_db, user.id, [p1, p2, p3], target_building_type="Apartment"
    )

    assert resp.total_parcels == 3
    assert len(resp.rankings) == 3
    assert resp.rankings[0].parcel_id == p1
    assert resp.rankings[0].rank == 1
    assert resp.rankings[1].rank == 2
    assert resp.rankings[2].rank == 3


@pytest.mark.asyncio
async def test_comparison_handles_missing_analyses():
    user = _make_mock_user()
    p1, p2 = uuid.uuid4(), uuid.uuid4()
    l1 = _make_mock_land(land_id=p1, user_id=user.id, name="Unanalyzed 1")
    l2 = _make_mock_land(land_id=p2, user_id=user.id, name="Unanalyzed 2")

    mock_db = AsyncMock()
    mock_lands_res = MagicMock()
    mock_lands_res.scalars.return_value.all.return_value = [l1, l2]

    # No analyses exist
    m_none1 = MagicMock()
    m_none1.scalar_one_or_none.return_value = None
    m_none2 = MagicMock()
    m_none2.scalar_one_or_none.return_value = None

    mock_db.execute.side_effect = [mock_lands_res, m_none1, m_none2]

    resp = await comparison_service.compare_parcels(
        mock_db, user.id, [p1, p2], target_building_type="Commercial Building"
    )

    assert resp.total_parcels == 2
    assert resp.parcels[0].has_analysis is False
    assert resp.parcels[1].has_analysis is False
    assert resp.summary.recommendation_confidence == "Insufficient Data"
    assert resp.summary.winner_parcel_id is None
    assert "Insufficient data" in resp.summary.verdict


@pytest.mark.asyncio
async def test_hospital_road_width_deficiency_ranking():
    user = _make_mock_user()
    p1, p2 = uuid.uuid4(), uuid.uuid4()
    # l1 has high suitability 85% but substandard road (15ft) for Hospital (< 29.5ft / 9.0m)
    # l2 has moderate suitability 75% but compliant 40ft road for Hospital
    l1 = _make_mock_land(land_id=p1, user_id=user.id, name="Narrow Road Site", road_width=15.0)
    l2 = _make_mock_land(land_id=p2, user_id=user.id, name="Wide Road Site", road_width=40.0)

    an1 = _make_mock_analysis(p1, suit_score=85.0)
    an2 = _make_mock_analysis(p2, suit_score=75.0)

    mock_db = AsyncMock()
    mock_lands_res = MagicMock()
    mock_lands_res.scalars.return_value.all.return_value = [l1, l2]

    m_an1 = MagicMock()
    m_an1.scalar_one_or_none.return_value = an1
    m_an2 = MagicMock()
    m_an2.scalar_one_or_none.return_value = an2

    mock_db.execute.side_effect = [mock_lands_res, m_an1, m_an2]

    resp = await comparison_service.compare_parcels(
        mock_db, user.id, [p1, p2], target_building_type="Hospital"
    )

    # Wide road parcel should be favored over road-deficient parcel for Hospital
    assert resp.summary.winner_parcel_id == p2
    assert resp.rankings[0].parcel_id == p2
    assert resp.parcels[0].planning_rules.road_adequacy_status == "deficient"
    assert resp.parcels[1].planning_rules.road_adequacy_status in ["adequate", "surplus"]
