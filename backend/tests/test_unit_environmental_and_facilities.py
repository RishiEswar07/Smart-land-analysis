"""
test_unit_environmental_and_facilities.py
-------------------------------------------
Unit tests for Overpass parsing, Haversine geodesic distance calculation,
environmental data reliability, missing elevation/discharge telemetry handling,
regional flood dataset distance constraints, and report generation with unavailable values.
"""

import os
import sys
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.analysis import Analysis
from app.models.land import Land, LandType, SoilType
from app.services.analysis_service import (
    _get_nearest_regional_info,
    build_detailed_analysis_dict,
    compute_analysis,
    compute_hydrological_flood_risk,
)
from app.services.facility_service import (
    _execute_fetch,
    fetch_nearby_facilities,
    haversine_distance_km,
)
from app.utils.pdf_generator import generate_land_report_pdf


# ---------------------------------------------------------------------------
# 1. Haversine Distance & Coordinate Validation
# ---------------------------------------------------------------------------

def test_haversine_distance_calculation():
    # Chennai Central (13.0827, 80.2707) to Marina Beach (13.0500, 80.2824) ~ 3.8 km
    dist = haversine_distance_km(13.0827, 80.2707, 13.0500, 80.2824)
    assert 3.5 <= dist <= 4.2
    assert dist == round(dist, 2)

    # Identical coordinates should be 0.0 km
    assert haversine_distance_km(13.0, 80.0, 13.0, 80.0) == 0.0


@pytest.mark.asyncio
async def test_facility_service_invalid_coordinates():
    res = await fetch_nearby_facilities(lat=195.0, lng=80.0, radius_km=5.0)
    assert res["status"] == "invalid_coordinates"
    assert res["total_found"] == 0

    res_none = await fetch_nearby_facilities(lat=None, lng=80.0, radius_km=5.0)
    assert res_none["status"] == "invalid_coordinates"


# ---------------------------------------------------------------------------
# 2. Overpass Parsing, Empty States, and Unavailable Handling
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_facility_parsing_individual_elements():
    """Verifies that individual elements from Overpass are correctly parsed into categories."""
    mock_elements = [
        {
            "type": "node",
            "id": 101,
            "lat": 13.0830,
            "lon": 80.2710,
            "tags": {"amenity": "school", "name": "Central High School"},
        },
        {
            "type": "node",
            "id": 102,
            "lat": 13.0850,
            "lon": 80.2730,
            "tags": {"amenity": "hospital", "name": "General Hospital"},
        },
        {
            "type": "node",
            "id": 103,
            "lat": 13.0840,
            "lon": 80.2720,
            "tags": {"amenity": "bus_station", "name": "Main Bus Terminal"},
        },
    ]

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"elements": mock_elements}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        with patch("app.services.facility_service._fetch_from_nominatim_fallback", new_callable=AsyncMock, return_value={
            "bus_stands": [], "railway_stations": [], "airports": [], "hospitals": [],
            "schools": [], "commercial": [], "roads": [], "water_bodies": []
        }):
            res = await _execute_fetch(13.0827, 80.2707, radius_km=2.0)

            assert res["status"] == "success"
            assert res["total_found"] >= 3
            assert len(res["categories"]["schools"]) >= 1
            assert len(res["categories"]["hospitals"]) >= 1
            assert len(res["categories"]["bus_stands"]) >= 1

            first_school = res["categories"]["schools"][0]
            assert first_school["name"] == "Central High School"
            assert first_school["lat"] == 13.0830
            assert first_school["lng"] == 80.2710
            assert isinstance(first_school["distance_km"], float)
            assert first_school["distance_km"] >= 0.0


@pytest.mark.asyncio
async def test_facility_empty_state_without_fabrication():
    """Verifies that when no facilities are found, status is 'empty' and zero fake facilities are added."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"elements": []}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        with patch("app.services.facility_service._fetch_from_nominatim_fallback", new_callable=AsyncMock, return_value={
            "bus_stands": [], "railway_stations": [], "airports": [], "hospitals": [],
            "schools": [], "commercial": [], "roads": [], "water_bodies": []
        }):
            res = await _execute_fetch(27.0238, 71.0123, radius_km=3.0)
            assert res["status"] == "empty"
            assert res["total_found"] == 0
            assert len(res["all_facilities"]) == 0
            assert "No facilities identified" in res["message"]


@pytest.mark.asyncio
async def test_facility_unavailable_state_on_timeout():
    """Verifies that when Overpass and fallback fail, status is 'unavailable'."""
    with patch("httpx.AsyncClient.post", side_effect=Exception("Timeout connecting to Overpass")):
        with patch("app.services.facility_service._fetch_from_nominatim_fallback", side_effect=Exception("Nominatim offline")):
            res = await _execute_fetch(13.0827, 80.2707, radius_km=3.0)
            assert res["status"] == "unavailable"
            assert res["total_found"] == 0
            assert "unavailable" in res["message"].lower() or "busy" in res["message"].lower()


# ---------------------------------------------------------------------------
# 3. Environmental Reliability & Missing Data Handling
# ---------------------------------------------------------------------------

def test_flood_risk_missing_elevation_returns_none():
    """When elevation is unavailable (None), flood risk must return None instead of fabricating a low risk score."""
    flood_score = compute_hydrological_flood_risk(elevation=None, discharge=0.0, soil_type="Loamy")
    assert flood_score is None, "Missing elevation must return None, not an arbitrary low-risk default"


def test_flood_risk_wetland_overrides_missing_elevation():
    """Satellite wetland/water classification should establish high flood risk even if elevation telemetry fails."""
    flood_score = compute_hydrological_flood_risk(elevation=None, discharge=None, land_cover_category="Water")
    assert flood_score == 90.0


def test_flood_risk_valid_elevation_calculation():
    """Low elevation (3m) must produce high flood risk; high elevation (250m) must produce lower flood risk."""
    low_elev_score = compute_hydrological_flood_risk(elevation=3.0, discharge=200.0, soil_type="Clayey")
    high_elev_score = compute_hydrological_flood_risk(elevation=250.0, discharge=10.0, soil_type="Sandy")

    assert low_elev_score is not None
    assert high_elev_score is not None
    assert low_elev_score > high_elev_score, f"Low elevation risk ({low_elev_score}) must exceed high elevation risk ({high_elev_score})"


# ---------------------------------------------------------------------------
# 4. Regional Flood Dataset Geographic Distance Constraint
# ---------------------------------------------------------------------------

def test_regional_flood_dataset_rejects_distant_points():
    """Points located thousands of kilometers away (e.g. Paris or Null Island) must NOT receive regional records."""
    # Paris, France (48.8566, 2.3522)
    record_far = _get_nearest_regional_info(lat=48.8566, lng=2.3522, max_distance_km=50.0)
    assert record_far is None, "Distant point >50km away must return None"

    # Null Island (0.0, 0.0)
    record_null_island = _get_nearest_regional_info(lat=0.0, lng=0.0, max_distance_km=50.0)
    assert record_null_island is None, "Null Island must return None"

    # Invalid coordinates
    assert _get_nearest_regional_info(lat=None, lng=80.0) is None
    assert _get_nearest_regional_info(lat=95.0, lng=80.0) is None


# ---------------------------------------------------------------------------
# 5. Missing Telemetry Handling in Full Analysis Pipeline
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compute_analysis_with_missing_elevation():
    """
    When elevation and discharge APIs fail, compute_analysis must:
    1. Mark flood_risk as 'Unavailable'.
    2. Mark overall risk_level as 'Incomplete'.
    3. NOT assign a deceptive low-risk rating.
    """
    land = Land(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        land_name="Coastal Parcel Without DEM",
        latitude=13.0827,
        longitude=80.2707,
        area_sqft=3000.0,
        road_width=25.0,
        land_type=LandType.RESIDENTIAL,
        soil_type=SoilType.LOAMY,
        water_availability=True,
        electricity_availability=True,
    )

    with patch("app.services.analysis_service._fetch_realtime_metrics", return_value=(None, None)):
        with patch("app.services.analysis_service._fetch_overpass_amenities", return_value=(2, 1, 1)):
            with patch("app.services.analysis_service.fetch_soilgrids_data", return_value={"soil_type": "Loamy", "status": "unavailable"}):
                with patch("app.services.analysis_service.get_land_cover", return_value=None):
                    result = await compute_analysis(land)

                    assert result.flood_risk == "Unavailable", f"Expected 'Unavailable', got {result.flood_risk}"
                    assert result.risk_level == "Incomplete", f"Expected 'Incomplete', got {result.risk_level}"
                    assert result.risk_breakdown["flood_risk"]["status"] == "unavailable"
                    assert result.risk_breakdown["flood_risk"]["score"] is None
                    assert "unavailable" in result.explanation.lower()


# ---------------------------------------------------------------------------
# 6. PDF Report Generation with Unavailable Values
# ---------------------------------------------------------------------------

def test_pdf_generation_handles_unavailable_flood_risk_gracefully():
    land = Land(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        land_name="Test Report Parcel",
        latitude=13.0827,
        longitude=80.2707,
        area_sqft=2500.0,
        land_type=LandType.RESIDENTIAL,
    )

    analysis = Analysis(
        id=uuid.uuid4(),
        land_id=land.id,
        suitability_score=68.5,
        recommended_building_type="Individual House",
        flood_risk="Unavailable",
        environmental_risk="Low",
        infrastructure_score=80.0,
        traffic_accessibility_score=75.0,
        risk_score=31.5,
        risk_level="Incomplete",
        risk_breakdown={
            "flood_risk": {"score": None, "status": "unavailable", "why_reason": "Elevation telemetry unavailable."},
            "accessibility_risk": {"score": 25.0, "status": "verified", "why_reason": "Good road access."},
            "infrastructure_risk": {"score": 20.0, "status": "verified", "why_reason": "Power and water grid accessible."},
            "environmental_risk": {"score": 15.0, "status": "verified", "why_reason": "Residential land cover."},
        },
        ai_explanation="Flood risk unavailable due to telemetry outage. Overall assessment is partial.",
    )

    details = build_detailed_analysis_dict(land, analysis)
    details["nearby_facilities"] = {"status": "unavailable", "all_facilities": []}

    pdf_bytes = generate_land_report_pdf(land, analysis, details)
    assert pdf_bytes is not None
    assert len(pdf_bytes) > 2000
    assert pdf_bytes.startswith(b"%PDF")
    assert b"%%EOF" in pdf_bytes[-1024:]
