"""
tests/test_unit_road_detection.py
---------------------------------
Unit tests for the Road Detection Service & 4-Tier Road Width Priority Engine.
Verifies audit compliance:
1. Missing width tags return 'Road width data unavailable'.
2. Lane count (lanes * 3.5m) is labeled strictly as estimated carriageway width, NOT actual road width.
3. Highway classification alone NEVER assigns a fixed road width.
4. Verified tagged width (width, width:carriageway) returns verified status.
5. Separation of tagged width, estimated carriageway, and distance.
6. Genuine physical accessibility filtering (grade separation, private access, non-vehicular paths).
"""

import pytest
from app.services.road_service import (
    distance_point_to_segment_meters,
    compute_min_distance_to_nodes,
    check_road_accessibility,
    parse_road_width_priority,
    format_road_type,
    detect_nearest_road,
)


def test_distance_point_to_segment():
    """Verify Euclidean point-to-segment distance calculation in meters."""
    # Point at (13.0, 80.0), segment from (13.0, 79.999) to (13.0, 80.001)
    dist_on = distance_point_to_segment_meters(13.0, 80.0, 13.0, 79.999, 13.0, 80.001)
    assert dist_on < 0.1

    # Point offset north by ~110.5 meters (0.001 deg lat)
    dist_offset = distance_point_to_segment_meters(13.001, 80.0, 13.0, 79.999, 13.0, 80.001)
    assert 105.0 < dist_offset < 115.0


def test_compute_min_distance_to_nodes():
    """Verify multi-segment polyline distance calculation."""
    ref_points = [(13.0005, 80.0)]
    nodes = [
        {"lat": 13.0, "lon": 79.999},
        {"lat": 13.0, "lon": 80.001},
        {"lat": 13.002, "lon": 80.001},
    ]
    min_dist = compute_min_distance_to_nodes(ref_points, nodes)
    assert 50.0 < min_dist < 60.0


def test_highway_only_record_never_assigns_fixed_width():
    """CRITICAL AUDIT: Highway classification alone MUST NEVER assign a fixed road width."""
    # Test primary highway with no width or lanes
    tags_primary = {"highway": "primary", "name": "Grand Southern Trunk Road"}
    res_primary = parse_road_width_priority(tags_primary)
    assert res_primary["road_width_ft"] is None
    assert res_primary["road_width_m"] is None
    assert res_primary["verified_road_width_ft"] is None
    assert res_primary["has_tagged_width"] is False
    assert res_primary["has_estimated_carriageway"] is False
    assert res_primary["width_status"] == "Road width data unavailable"
    assert res_primary["verification_requirement"] == "Manual road-width verification required"
    assert "Manual road-width verification required" in res_primary["tncdbr_eligibility"]

    # Test residential highway with no width or lanes
    tags_res = {"highway": "residential", "name": "Anna Nagar 2nd Street"}
    res_res = parse_road_width_priority(tags_res)
    assert res_res["road_width_ft"] is None
    assert res_res["road_width_m"] is None
    assert res_res["width_status"] == "Road width data unavailable"


def test_missing_width_tags_returns_manual_verification_required():
    """CRITICAL AUDIT: Missing width tags return 'Manual road-width verification required'."""
    tags_empty = {"highway": "secondary"}
    res = parse_road_width_priority(tags_empty)
    assert res["has_tagged_width"] is False
    assert res["road_width_ft"] is None
    assert res["width_status"] == "Road width data unavailable"
    assert res["verification_requirement"] == "Manual road-width verification required"
    assert res["confidence"] == "UNAVAILABLE"


def test_lane_based_carriageway_estimate_labeled_strictly():
    """CRITICAL AUDIT: lanes * 3.5m is strictly an estimated carriageway, NOT actual road width."""
    tags_lanes = {"highway": "secondary", "name": "Gandhi Road", "lanes": "2"}
    res = parse_road_width_priority(tags_lanes)
    # 2 lanes * 3.5m = 7.0m = 23.0 ft
    assert res["has_tagged_width"] is False
    assert res["has_estimated_carriageway"] is True
    assert res["estimated_carriageway_width_m"] == 7.0
    assert res["estimated_carriageway_width_ft"] == round(7.0 * 3.28084, 1)
    # road_width_ft and verified_road_width_ft MUST BE NONE - NOT treated as actual road width!
    assert res["road_width_ft"] is None
    assert res["verified_road_width_ft"] is None
    assert "Estimated Carriageway" in res["width_status"]
    assert res["verification_requirement"] == "Manual road-width verification required"
    assert "cannot be used for TNCDBR compliance" in res["tncdbr_eligibility"]


def test_verified_tagged_width_in_meters():
    """Verified: Explicit OSM width tag in meters."""
    tags = {"highway": "residential", "name": "Cross Street", "width": "12.0"}
    res = parse_road_width_priority(tags)
    assert res["has_tagged_width"] is True
    assert res["tagged_road_width_m"] == 12.0
    assert res["tagged_road_width_ft"] == round(12.0 * 3.28084, 1)
    assert res["verified_road_width_ft"] == round(12.0 * 3.28084, 1)
    assert res["road_width_ft"] == round(12.0 * 3.28084, 1)
    assert res["width_status"] == "Verified Tagged Width"
    assert res["verification_requirement"] == "Verified via OSM Measured Tag"
    assert res["confidence"] == "VERIFIED (OSM Measured Tag)"


def test_verified_tagged_width_in_feet():
    """Verified: Explicit OSM width tag in feet."""
    tags = {"highway": "residential", "width": "40 ft"}
    res = parse_road_width_priority(tags)
    assert res["has_tagged_width"] is True
    assert res["tagged_road_width_ft"] == 40.0
    assert res["tagged_road_width_m"] == round(40.0 * 0.3048, 2)
    assert res["verified_road_width_ft"] == 40.0
    assert res["width_status"] == "Verified Tagged Width"


def test_separation_of_all_three_values():
    """CRITICAL AUDIT: Tagged width, estimated carriageway, and distance are strictly separated."""
    tags_both = {"highway": "primary", "width": "50 ft", "lanes": "4"}
    res = parse_road_width_priority(tags_both)
    # Tagged width exists
    assert res["has_tagged_width"] is True
    assert res["tagged_road_width_ft"] == 50.0
    # Estimated carriageway also computed from 4 lanes = 14m = 45.9ft
    assert res["has_estimated_carriageway"] is True
    assert res["estimated_carriageway_width_m"] == 14.0
    # Verified width equals tagged width
    assert res["verified_road_width_ft"] == 50.0


def test_accessibility_filtering_exclusions():
    """CRITICAL AUDIT: Genuine accessibility check rejects non-accessible roads."""
    # 1. Non-vehicular footway
    acc_foot, reason_foot = check_road_accessibility({"highway": "footway"}, 5.0)
    assert acc_foot is False
    assert "Non-vehicular" in reason_foot

    # 2. Private access road
    acc_priv, reason_priv = check_road_accessibility({"highway": "residential", "access": "private"}, 5.0)
    assert acc_priv is False
    assert "restricted/private" in reason_priv

    # 3. Elevated bridge / flyover without ground frontage (layer 1)
    acc_bridge, reason_bridge = check_road_accessibility({"highway": "primary", "bridge": "yes", "layer": "1"}, 5.0)
    assert acc_bridge is False
    assert "Elevated flyover / bridge" in reason_bridge

    # 4. Controlled-access expressway without direct frontage
    acc_motorway, reason_mway = check_road_accessibility({"highway": "motorway"}, 5.0)
    assert acc_motorway is False
    assert "expressway" in reason_mway

    # 5. Distant road beyond 50m (separated by intervening parcels)
    acc_far, reason_far = check_road_accessibility({"highway": "residential"}, 65.0)
    assert acc_far is False
    assert "intervening parcels" in reason_far

    # 6. Valid accessible abutting street (<= 15m)
    acc_valid, reason_valid = check_road_accessibility({"highway": "residential", "name": "Main Street"}, 4.5)
    assert acc_valid is True
    assert "Directly abutting" in reason_valid


def test_format_road_type_labels():
    """Verify human-readable road classification labels."""
    assert format_road_type("primary") == "State Highway / Primary Arterial"
    assert format_road_type("secondary") == "Major District Road / Secondary"
    assert format_road_type("residential") == "Residential Street"
    assert format_road_type("service") == "Local Service Road / Access Lane"


@pytest.mark.asyncio
async def test_detect_nearest_road_returns_separated_keys():
    """Verify detect_nearest_road returns all required audit keys."""
    res = await detect_nearest_road(13.0418, 80.2341)
    assert "available" in res
    assert "road_name" in res
    assert "tagged_road_width_ft" in res
    assert "estimated_carriageway_width_ft" in res
    assert "verified_road_width_ft" in res
    assert "distance_meters" in res
    assert "distance_display" in res
    assert "width_status" in res
    assert "verification_requirement" in res
    assert "tncdbr_eligibility" in res
