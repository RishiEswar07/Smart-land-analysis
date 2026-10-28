"""
tests/test_unit_building_rules.py
---------------------------------
Unit tests for the TNCDBR 2019 FSI & Setback Rule Engine.
Tests all verified statutory rules, road width thresholds, boundary conditions,
occupancy requirements, unit conversions, invalid/insufficient inputs,
geometry provenance (measured vs unverified), and API ownership authorization.
"""

import os
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock
import pytest

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.land import Land, LandType, SoilType
from app.services import land_service
from app.services.exceptions import NotFoundError
from app.services.building_rule_service import (
    evaluate_building_rules,
    FT_TO_M,
    M_TO_FT,
    SQFT_TO_SQM,
    STATUTORY_DISCLAIMER,
)


# ============================================================================
# Unit Tests: Pure Domain Service (evaluate_building_rules)
# ============================================================================

def test_insufficient_inputs_missing_area():
    """Missing or None area returns explicit insufficient_data status."""
    res = evaluate_building_rules(area_sqft=None, road_width_ft=30.0)
    assert res["status"] == "insufficient_data"
    assert "area_sqft" in res["missing_inputs"][0]
    assert res["parameters"] is None
    assert STATUTORY_DISCLAIMER in res["disclaimer"]


def test_insufficient_inputs_missing_road_width():
    """Missing or None road width returns explicit insufficient_data status."""
    res = evaluate_building_rules(area_sqft=2400.0, road_width_ft=None)
    assert res["status"] == "insufficient_data"
    assert "road_width" in res["missing_inputs"][0]
    assert res["planning_feasibility"]["status"] == "Incomplete Data"


def test_zero_and_negative_inputs():
    """Zero or negative area / road width are rejected as insufficient data."""
    res_zero_area = evaluate_building_rules(area_sqft=0, road_width_ft=30.0)
    assert res_zero_area["status"] == "insufficient_data"

    res_neg_road = evaluate_building_rules(area_sqft=1500.0, road_width_ft=-10.0)
    assert res_neg_road["status"] == "insufficient_data"

    res_both_zero = evaluate_building_rules(area_sqft=-500.0, road_width_ft=0.0)
    assert res_both_zero["status"] == "insufficient_data"
    assert len(res_both_zero["missing_inputs"]) == 2


def test_area_and_unit_conversions():
    """Verifies standard unit conversions and mathematical FSI area scaling."""
    area_sqft = 2400.0
    road_width_ft = 30.0
    res = evaluate_building_rules(area_sqft=area_sqft, road_width_ft=road_width_ft)
    
    assert res["status"] == "complete"
    # FSI is 2.0
    assert res["floor_space_index"]["base_fsi"] == 2.0
    assert res["floor_space_index"]["theoretical_max_floor_area_sqft"] == 4800.0
    expected_sqm = round(area_sqft * SQFT_TO_SQM * 2.0, 2)
    assert res["floor_space_index"]["theoretical_max_floor_area_sqm"] == expected_sqm
    # Road width meters
    assert res["road_width"]["meters"] == round(30.0 * FT_TO_M, 2)


def test_rule_35_1_low_rise_individual_house():
    """Standard low-rise individual house on 20 ft road complies with Rule 35(1)."""
    res = evaluate_building_rules(
        area_sqft=1800.0,
        road_width_ft=20.0,
        building_type="Individual House"
    )
    assert res["status"] == "complete"
    assert res["rule_reference"] == "Rule 35(1) Table"
    assert res["height_and_floors"]["max_permissible_height_meters"] == 12.0
    assert res["height_and_floors"]["max_permissible_height_feet"] == round(12.0 * M_TO_FT, 1)
    # Road width: 20 ft = 6.096 m <= 9.0 m -> Front Setback = 1.5 m
    assert res["setbacks"]["front"]["meters"] == 1.5
    assert res["setbacks"]["rear"]["meters"] == 1.5
    assert res["setbacks"]["side_left"]["meters"] == 1.5
    assert res["setbacks"]["side_right"]["meters"] == 1.5


# ============================================================================
# Boundary Condition Tests: Exact Road Width Thresholds (TNCDBR Rule 35)
# ============================================================================

def test_road_width_threshold_exact_boundary_9m():
    """
    Threshold: 9.0 meters (~29.528 ft).
    <= 9.0 m requires 1.5 m front setback.
    > 9.0 m up to 18.0 m requires 3.0 m front setback.
    """
    exact_9m_ft = 9.0 * M_TO_FT
    res_at_9m = evaluate_building_rules(area_sqft=2000.0, road_width_ft=exact_9m_ft)
    assert res_at_9m["setbacks"]["front"]["meters"] == 1.5

    # Below 9.0m: 8.9m
    res_below_9m = evaluate_building_rules(area_sqft=2000.0, road_width_ft=8.9 * M_TO_FT)
    assert res_below_9m["setbacks"]["front"]["meters"] == 1.5

    # Above 9.0m: 9.1m
    res_above_9m = evaluate_building_rules(area_sqft=2000.0, road_width_ft=9.1 * M_TO_FT)
    assert res_above_9m["setbacks"]["front"]["meters"] == 3.0


def test_road_width_threshold_exact_boundary_18m():
    """
    Threshold: 18.0 meters (~59.055 ft).
    <= 18.0 m requires 3.0 m front setback.
    > 18.0 m up to 30.5 m requires 4.5 m front setback.
    """
    exact_18m_ft = 18.0 * M_TO_FT
    res_at_18m = evaluate_building_rules(area_sqft=4000.0, road_width_ft=exact_18m_ft)
    assert res_at_18m["setbacks"]["front"]["meters"] == 3.0

    res_below_18m = evaluate_building_rules(area_sqft=4000.0, road_width_ft=17.9 * M_TO_FT)
    assert res_below_18m["setbacks"]["front"]["meters"] == 3.0

    res_above_18m = evaluate_building_rules(area_sqft=4000.0, road_width_ft=18.1 * M_TO_FT)
    assert res_above_18m["setbacks"]["front"]["meters"] == 4.5


def test_road_width_threshold_exact_boundary_30_5m():
    """
    Threshold: 30.5 meters (~100.065 ft).
    <= 30.5 m requires 4.5 m front setback.
    > 30.5 m requires 6.0 m front setback.
    """
    exact_30_5m_ft = 30.5 * M_TO_FT
    res_at_30_5m = evaluate_building_rules(area_sqft=10000.0, road_width_ft=exact_30_5m_ft)
    assert res_at_30_5m["setbacks"]["front"]["meters"] == 4.5

    res_above_30_5m = evaluate_building_rules(area_sqft=10000.0, road_width_ft=31.0 * M_TO_FT)
    assert res_above_30_5m["setbacks"]["front"]["meters"] == 6.0


# ============================================================================
# Occupancy-Specific Road Width Adequacy Tests
# ============================================================================

def test_school_road_adequacy_threshold_7_2m():
    """Schools require minimum 7.20m (23.62 ft) road width under TNCDBR 2019."""
    res_deficient = evaluate_building_rules(area_sqft=6000.0, road_width_ft=20.0, building_type="School")
    assert res_deficient["road_width"]["adequacy"] == "deficient"
    assert "substandard" in res_deficient["road_width"]["note"].lower()
    assert res_deficient["planning_feasibility"]["status"] == "Regulatory Constraint"

    res_adequate = evaluate_building_rules(area_sqft=6000.0, road_width_ft=30.0, building_type="School")
    assert res_adequate["road_width"]["adequacy"] == "adequate"
    assert res_adequate["planning_feasibility"]["status"].startswith("Statutorily Feasible")


def test_commercial_road_adequacy_threshold_9m():
    """Commercial buildings require minimum 9.0m (29.53 ft) road width."""
    res_def = evaluate_building_rules(area_sqft=3000.0, road_width_ft=25.0, building_type="Commercial Building")
    assert res_def["road_width"]["adequacy"] == "deficient"

    res_adq = evaluate_building_rules(area_sqft=3000.0, road_width_ft=35.0, building_type="Commercial Building")
    assert res_adq["road_width"]["adequacy"] == "adequate"


def test_hospital_road_adequacy_threshold_9m():
    """Hospitals require minimum 9.0m (29.53 ft) road width for ambulance access."""
    res_def = evaluate_building_rules(area_sqft=12000.0, road_width_ft=20.0, building_type="Hospital")
    assert res_def["road_width"]["adequacy"] == "deficient"

    res_adq = evaluate_building_rules(area_sqft=12000.0, road_width_ft=40.0, building_type="Hospital")
    assert res_adq["road_width"]["adequacy"] == "adequate"


def test_apartment_road_adequacy_threshold_7_2m():
    """Multi-dwelling apartments require minimum 7.20m (23.62 ft) road width."""
    res_def = evaluate_building_rules(area_sqft=5000.0, road_width_ft=18.0, building_type="Apartment")
    assert res_def["road_width"]["adequacy"] == "deficient"

    res_adq = evaluate_building_rules(area_sqft=5000.0, road_width_ft=30.0, building_type="Apartment")
    assert res_adq["road_width"]["adequacy"] == "adequate"


def test_high_rise_eligibility_under_rule_39():
    """High-Rise eligible when road width >= 12.0m and plot area >= 10,000 sq.ft."""
    res_hr = evaluate_building_rules(
        area_sqft=15000.0,
        road_width_ft=60.0,  # 18.28m >= 18m -> FSI up to 3.25
        building_type="Apartment"
    )
    assert res_hr["height_and_floors"]["high_rise_eligible"] is True
    assert "Rule 39" in res_hr["height_and_floors"]["high_rise_note"]


# ============================================================================
# Geometry & Dimension Provenance Tests (Requirement 1, 2, 3, 5)
# ============================================================================

def test_unverified_geometry_does_not_fabricate_practical_area():
    """
    When plot dimensions are not supplied, practical achievable area must NOT be fabricated.
    It returns None with an explicit indicative scenario and warning.
    """
    res = evaluate_building_rules(area_sqft=2000.0, road_width_ft=30.0)
    assert res["geometry"]["is_verified"] is False
    assert res["geometry"]["status"] == "unverified_dimensions"
    # Practical achievable area must be None when unmeasured
    assert res["floor_space_index"]["practical_achievable_floor_area_sqft"] is None
    assert res["plot_coverage"]["achievable_ground_footprint_sqft"] is None
    # Hypothetical scenario must be segregated and clearly marked
    assert res["indicative_scenario"] is not None
    assert res["indicative_scenario"]["is_purely_indicative"] is True
    assert "unverified mathematical scenario" in res["indicative_scenario"]["disclaimer"]


def test_measured_user_dimensions_calculates_practical_area():
    """
    When user provides actual width and depth, practical floor area is certified
    from effective buildable ground footprint * permissible floors.
    """
    plot_w = 40.0  # 40 ft width (> 9m -> sides = 1.5m = 4.92 ft each)
    plot_d = 60.0  # 60 ft depth (front = 3.0m = 9.84 ft, rear = 1.5m = 4.92 ft)
    res = evaluate_building_rules(
        area_sqft=2400.0,
        road_width_ft=30.0,
        plot_width_ft=plot_w,
        plot_depth_ft=plot_d,
        building_type="Individual House"
    )
    assert res["geometry"]["is_verified"] is True
    assert res["geometry"]["status"] == "user_provided"
    assert res["floor_space_index"]["practical_achievable_floor_area_sqft"] is not None
    # Practical area must be constrained by footprint * 3 floors (<= FSI 4800)
    assert res["floor_space_index"]["practical_achievable_floor_area_sqft"] <= res["floor_space_index"]["theoretical_max_floor_area_sqft"]
    assert res["plot_coverage"]["achievable_ground_footprint_sqft"] is not None
    assert res["plot_coverage"]["coverage_percentage"] > 0


def test_polygon_boundary_extracts_measured_dimensions():
    """Valid GeoJSON polygon bounding box extracts measured dimensions."""
    # Polygon around Chennai Central: approx 0.0003 deg lat (~108 ft) x 0.0003 deg lng (~106 ft)
    polygon = {
        "type": "Polygon",
        "coordinates": [[
            [80.2700, 13.0820],
            [80.2703, 13.0820],
            [80.2703, 13.0823],
            [80.2700, 13.0823],
            [80.2700, 13.0820]
        ]]
    }
    res = evaluate_building_rules(
        area_sqft=5000.0,
        road_width_ft=40.0,
        boundary_geojson=polygon,
        building_type="Individual House"
    )
    assert res["geometry"]["is_verified"] is True
    assert res["geometry"]["status"] == "measured_polygon"
    assert res["geometry"]["measured_width_ft"] is not None
    assert res["geometry"]["measured_depth_ft"] is not None
    assert res["floor_space_index"]["practical_achievable_floor_area_sqft"] is not None


def test_spatial_infeasibility_when_plot_is_narrower_than_setbacks():
    """When plot width is less than required setbacks, flags spatial infeasibility."""
    # Plot width: 3 ft (0.91m), minimum narrow setback alone is 1.0m (3.28 ft)
    res = evaluate_building_rules(
        area_sqft=300.0,
        road_width_ft=30.0,
        plot_width_ft=3.0,
        plot_depth_ft=100.0,
    )
    assert res["planning_feasibility"]["status"] == "Spatial Infeasibility"
    assert res["plot_coverage"]["achievable_ground_footprint_sqft"] == 0.0


def test_statutory_disclaimer_content():
    """Confirms exact statutory disclaimer is present in every result."""
    res = evaluate_building_rules(area_sqft=2000.0, road_width_ft=30.0)
    assert res["disclaimer"] == STATUTORY_DISCLAIMER
    assert res["statutory_source"]["act_name"] == "Tamil Nadu Combined Development and Building Rules, 2019 (TNCDBR)"


# ============================================================================
# API Ownership Authorization Tests (User A vs User B)
# ============================================================================

@pytest.mark.asyncio
async def test_user_a_can_access_own_land_for_planning_rules():
    """User A can access own land to evaluate planning rules."""
    user_a_id = uuid.uuid4()
    land_id = uuid.uuid4()
    mock_land = Land(
        id=land_id,
        user_id=user_a_id,
        land_name="User A Rule Test Parcel",
        latitude=13.0827,
        longitude=80.2707,
        area_sqft=3000.0,
        road_width=40.0,
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

    # Evaluate planning rules for User A's land
    res = evaluate_building_rules(
        area_sqft=land.area_sqft,
        road_width_ft=land.road_width,
        building_type="Apartment"
    )
    assert res["status"] == "complete"
    assert res["building_type"] == "Apartment"


@pytest.mark.asyncio
async def test_user_b_cannot_access_user_a_land_for_planning_rules():
    """User B attempting to fetch User A's land raises NotFoundError (ownership isolation)."""
    user_a_id = uuid.uuid4()
    user_b_id = uuid.uuid4()
    land_id = uuid.uuid4()

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    with pytest.raises(NotFoundError):
        await land_service.get_land(mock_db, land_id, user_id=user_b_id)
