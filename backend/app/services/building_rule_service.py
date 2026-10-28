"""
services/building_rule_service.py
---------------------------------
Automated Building Planning Rules & Regulatory Compliance Engine.

Calculates permissible Floor Space Index (FSI), theoretical maximum gross floor area,
mandatory front, rear, and side setbacks, maximum permissible building height, and
preliminary planning feasibility in accordance with the:

    Tamil Nadu Combined Development and Building Rules, 2019 (TNCDBR-2019)
    Government Order: G.O. (Ms) No. 18, Municipal Administration and Water Supply (MA.1) Department
    Effective Date: 04 February 2019 (incorporating subsequent state amendments).

Statutory Disclaimer:
    These results are preliminary planning guidance based on available inputs and verified rules.
    They are not official building approval or a substitute for professional architectural or
    engineering assessment.
"""

import math
from typing import Any, Dict, List, Optional, Tuple


# Unit Conversion Constants (Exact Geodetic / Standard Values)
FT_TO_M = 0.3048
M_TO_FT = 1.0 / FT_TO_M          # ~3.28084
SQFT_TO_SQM = FT_TO_M * FT_TO_M  # ~0.09290304
SQM_TO_SQFT = 1.0 / SQFT_TO_SQM  # ~10.7639104

STATUTORY_DISCLAIMER = (
    "These results are preliminary planning guidance based on available inputs and verified rules. "
    "They are not official building approval or a substitute for professional architectural or "
    "engineering assessment."
)

OFFICIAL_SOURCE_CITATION = {
    "act_name": "Tamil Nadu Combined Development and Building Rules, 2019 (TNCDBR)",
    "notification": "G.O. (Ms) No. 18, MA&WS (MA.1) Department, dated 04.02.2019",
    "jurisdiction": "State of Tamil Nadu (CMDA, DTCP, Corporations, Municipalities, Panchayats)",
    "applicable_parts": "Part VI: Development Regulations (Rules 35, 36, 38, 39)",
}


def _round_num(val: Optional[float], decimals: int = 2) -> Optional[float]:
    if val is None:
        return None
    return round(float(val), decimals)


def _extract_bounding_dimensions_from_geojson(geojson: Optional[dict]) -> Tuple[Optional[float], Optional[float]]:
    """
    Computes geodetic bounding width and depth (in feet) from a GeoJSON polygon boundary.
    Returns (width_ft, depth_ft) or (None, None) if not available or invalid.
    """
    if not geojson or not isinstance(geojson, dict):
        return None, None

    geom_type = geojson.get("type")
    coords = geojson.get("coordinates")
    if geom_type != "Polygon" or not coords or not isinstance(coords, list):
        return None, None

    ring = coords[0]
    if not isinstance(ring, list) or len(ring) < 3:
        return None, None

    try:
        lngs = [pt[0] for pt in ring if isinstance(pt, (list, tuple)) and len(pt) >= 2]
        lats = [pt[1] for pt in ring if isinstance(pt, (list, tuple)) and len(pt) >= 2]
        if not lngs or not lats:
            return None, None

        min_lng, max_lng = min(lngs), max(lngs)
        min_lat, max_lat = min(lats), max(lats)

        delta_lng = max_lng - min_lng
        delta_lat = max_lat - min_lat
        if delta_lng <= 0 or delta_lat <= 0:
            return None, None

        avg_lat = (min_lat + max_lat) / 2.0
        # 1 degree lat approx 110,574 meters; 1 degree lng approx 111,320 * cos(lat) meters
        width_m = delta_lng * 111320.0 * math.cos(math.radians(avg_lat))
        depth_m = delta_lat * 110574.0

        width_ft = width_m * M_TO_FT
        depth_ft = depth_m * M_TO_FT

        return width_ft, depth_ft
    except Exception:
        return None, None


def evaluate_building_rules(
    area_sqft: Optional[float],
    road_width_ft: Optional[float],
    building_type: Optional[str] = "Individual House",
    plot_width_ft: Optional[float] = None,
    plot_depth_ft: Optional[float] = None,
    boundary_geojson: Optional[dict] = None,
) -> Dict[str, Any]:
    """
    Evaluates statutory building planning rules for a given parcel under TNCDBR 2019.

    Args:
        area_sqft: Total plot area in square feet.
        road_width_ft: Abutting road right-of-way width in feet.
        building_type: Target building occupancy type (e.g., 'Individual House', 'Apartment',
                       'Commercial Building', 'Hospital', 'School').
        plot_width_ft: Optional frontage/width of plot in feet.
        plot_depth_ft: Optional depth of plot in feet.
        boundary_geojson: Optional GeoJSON polygon boundary to extract bounding dimensions.

    Returns:
        Structured dictionary containing FSI, setbacks, height restrictions, road adequacy,
        coverage envelopes, geometry provenance, assumptions, and official disclaimers.
    """
    normalized_btype = (building_type or "Individual House").strip()
    missing_inputs: List[str] = []

    # Validate essential inputs
    has_valid_area = area_sqft is not None and isinstance(area_sqft, (int, float)) and area_sqft > 0
    has_valid_road = road_width_ft is not None and isinstance(road_width_ft, (int, float)) and road_width_ft > 0

    if not has_valid_area:
        missing_inputs.append("area_sqft (plot area must be a positive number)")
    if not has_valid_road:
        missing_inputs.append("road_width (adjacent road width must be a positive number)")

    # If any essential input is missing, return an explicit insufficient_data payload
    if missing_inputs:
        return {
            "status": "insufficient_data",
            "statutory_source": OFFICIAL_SOURCE_CITATION,
            "disclaimer": STATUTORY_DISCLAIMER,
            "missing_inputs": missing_inputs,
            "message": (
                "Sufficient inputs are not available to evaluate building planning rules. "
                f"Missing or invalid parameters: {', '.join(missing_inputs)}. "
                "Please ensure both parcel area and abutting road width are provided."
            ),
            "planning_feasibility": {
                "status": "Incomplete Data",
                "summary": "Building planning rules cannot be calculated without valid plot area and road width.",
                "action_required": "Provide adjacent road width in feet and plot area to evaluate TNCDBR 2019 rules.",
            },
            "parameters": None,
        }

    # Safe float conversions
    area_sqft_f = float(area_sqft)
    road_width_ft_f = float(road_width_ft)
    area_sqm_f = area_sqft_f * SQFT_TO_SQM
    road_width_m_f = road_width_ft_f * FT_TO_M

    # -------------------------------------------------------------------------
    # 1. Statutory Road Width Adequacy Check per Occupancy Type
    # -------------------------------------------------------------------------
    # Thresholds verified against TNCDBR 2019 and Master Plan zoning regulations:
    # - Schools / Educational: 7.20 m (23.62 ft) minimum
    # - Commercial: 9.00 m (29.53 ft) minimum
    # - Hospitals: 9.00 m (29.53 ft) minimum
    # - Apartments (Multi-dwelling): 7.20 m (23.62 ft) minimum
    # - Individual House: 3.00 m (9.84 ft) standard (1.5m in CBA / EWS)
    road_adequacy_status = "adequate"
    road_adequacy_message = "Abutting road width meets statutory access requirements for this building category."
    min_required_road_m = 3.0
    min_required_road_ft = min_required_road_m * M_TO_FT

    if normalized_btype == "School":
        min_required_road_m = 7.20
        min_required_road_ft = min_required_road_m * M_TO_FT
        if road_width_m_f < 7.20:
            road_adequacy_status = "deficient"
            road_adequacy_message = (
                f"TNCDBR mandates a minimum abutting road width of 7.20 m ({min_required_road_ft:.1f} ft) "
                f"for educational institutions. Current road width ({road_width_ft_f:.1f} ft / {road_width_m_f:.2f} m) "
                "is substandard for school sanction."
            )
    elif normalized_btype == "Commercial Building":
        min_required_road_m = 9.00
        min_required_road_ft = min_required_road_m * M_TO_FT
        if road_width_m_f < 9.00:
            road_adequacy_status = "deficient"
            road_adequacy_message = (
                f"TNCDBR mandates a minimum abutting road width of 9.00 m ({min_required_road_ft:.1f} ft) "
                f"for commercial developments. Current road width ({road_width_ft_f:.1f} ft / {road_width_m_f:.2f} m) "
                "is below the standard commercial threshold."
            )
    elif normalized_btype == "Hospital":
        min_required_road_m = 9.00
        min_required_road_ft = min_required_road_m * M_TO_FT
        if road_width_m_f < 9.00:
            road_adequacy_status = "deficient"
            road_adequacy_message = (
                f"TNCDBR mandates a minimum road width of 9.00 m ({min_required_road_ft:.1f} ft) for healthcare "
                f"facilities and hospitals to permit emergency vehicular access. Current width is {road_width_ft_f:.1f} ft."
            )
    elif normalized_btype == "Apartment":
        min_required_road_m = 7.20
        min_required_road_ft = min_required_road_m * M_TO_FT
        if road_width_m_f < 7.20:
            road_adequacy_status = "deficient"
            road_adequacy_message = (
                f"TNCDBR mandates a minimum road width of 7.20 m ({min_required_road_ft:.1f} ft) for multi-dwelling "
                f"residential apartments. Current width ({road_width_ft_f:.1f} ft) is substandard."
            )
    else:  # Individual House / Residential House
        min_required_road_m = 3.00
        min_required_road_ft = min_required_road_m * M_TO_FT
        if road_width_m_f < 3.00:
            road_adequacy_status = "substandard"
            road_adequacy_message = (
                f"Abutting road width ({road_width_ft_f:.1f} ft / {road_width_m_f:.2f} m) is below standard 3.0 m "
                "(9.8 ft) non-CBA access. May require Continuous Building Area (CBA) or EWS classification."
            )

    # -------------------------------------------------------------------------
    # 2. Rule Classification, FSI, and Building Height
    # -------------------------------------------------------------------------
    rule_reference: str
    rule_title: str
    rule_category: str
    base_fsi: float = 2.0
    max_height_m: float
    max_height_ft: float
    floors_description: str
    high_rise_eligible: bool = False
    high_rise_note: Optional[str] = None

    if normalized_btype in ("Individual House", "Residential House"):
        rule_reference = "Rule 35(1) Table"
        rule_title = "Planning Parameters for Non-High Rise Buildings (Height up to 12.0 m)"
        rule_category = "Non-High-Rise Building (NHRB) - Low Rise"
        base_fsi = 2.0
        max_height_m = 12.0
        max_height_ft = max_height_m * M_TO_FT
        floors_description = "Up to Ground + 2 Floors (or Stilt + 3 Floors), maximum 12.0 m height"
    elif normalized_btype in ("Apartment", "Commercial Building", "Hospital", "School"):
        rule_reference = "Rule 35(2) Table"
        rule_title = "Planning Parameters for Non-High Rise Buildings (Height up to 18.30 m)"
        rule_category = "Non-High-Rise Building (NHRB) - Mid Rise"
        base_fsi = 2.0
        max_height_m = 18.30
        max_height_ft = max_height_m * M_TO_FT
        floors_description = "Up to Stilt + 5 Floors, maximum 18.30 m height"

        if road_width_m_f >= 12.0 and area_sqft_f >= 10000.0:
            high_rise_eligible = True
            if road_width_m_f >= 18.0:
                hr_fsi = 3.25
            elif road_width_m_f >= 15.0:
                hr_fsi = 2.50
            else:
                hr_fsi = 2.00
            high_rise_note = (
                f"This parcel abuts a {road_width_m_f:.1f} m road and has sufficient area to qualify as a "
                f"High-Rise Building (HRB) under Rule 39 (FSI up to {hr_fsi}, height > 18.3 m, subject to "
                "7.0 m all-around fire setbacks and multi-storey clearance)."
            )
    else:
        rule_reference = "Rule 35(1) & (2) Table"
        rule_title = "Standard Planning Parameters for Non-High Rise Buildings"
        rule_category = "Non-High-Rise Building (NHRB)"
        base_fsi = 2.0
        max_height_m = 12.0
        max_height_ft = max_height_m * M_TO_FT
        floors_description = "Up to Ground + 2 Floors, maximum 12.0 m height"

    # -------------------------------------------------------------------------
    # 3. Mandatory Front Setback (Road-Side Margin)
    # -------------------------------------------------------------------------
    # Strictly determined by abutting road right-of-way width under Rule 35 Table:
    # - Road width <= 9.0 m (<= 29.53 ft)              -> 1.5 m (4.92 ft)
    # - Road width > 9.0 m up to 18.0 m (29.53 - 59.05 ft) -> 3.0 m (9.84 ft)
    # - Road width > 18.0 m up to 30.5 m (59.05 - 100.06 ft)-> 4.5 m (14.76 ft)
    # - Road width > 30.5 m (> 100.06 ft)                  -> 6.0 m (19.69 ft)
    front_setback_m: float
    front_setback_rule_note: str

    if road_width_m_f <= 9.0:
        front_setback_m = 1.5
        front_setback_rule_note = "Rule 35: Road width up to 9.0 m requires a minimum 1.5 m front setback."
    elif road_width_m_f <= 18.0:
        front_setback_m = 3.0
        front_setback_rule_note = "Rule 35: Road width > 9.0 m up to 18.0 m requires a minimum 3.0 m front setback."
    elif road_width_m_f <= 30.5:
        front_setback_m = 4.5
        front_setback_rule_note = "Rule 35: Road width > 18.0 m up to 30.5 m requires a minimum 4.5 m front setback."
    else:
        front_setback_m = 6.0
        front_setback_rule_note = "Rule 35: Road width exceeding 30.5 m requires a minimum 6.0 m front setback."

    front_setback_ft = front_setback_m * M_TO_FT

    # -------------------------------------------------------------------------
    # 4. Geometry Inspection & Dimension Provenance
    # -------------------------------------------------------------------------
    # Check whether actual plot frontage and depth were explicitly supplied or
    # can be derived from boundary GeoJSON coordinates.
    measured_width_ft: Optional[float] = None
    measured_depth_ft: Optional[float] = None
    geometry_status: str
    geometry_source_label: str
    is_geometry_verified: bool

    if plot_width_ft is not None and plot_depth_ft is not None and plot_width_ft > 0 and plot_depth_ft > 0:
        measured_width_ft = float(plot_width_ft)
        measured_depth_ft = float(plot_depth_ft)
        geometry_status = "user_provided"
        geometry_source_label = "User-Specified Dimensions"
        is_geometry_verified = True
    elif boundary_geojson:
        geo_w, geo_d = _extract_bounding_dimensions_from_geojson(boundary_geojson)
        if geo_w and geo_d and geo_w > 0 and geo_d > 0:
            measured_width_ft = geo_w
            measured_depth_ft = geo_d
            geometry_status = "measured_polygon"
            geometry_source_label = "Geodetic Bounding Box from Drawn Map Polygon"
            is_geometry_verified = True
        else:
            geometry_status = "unverified_dimensions"
            geometry_source_label = "Unverified Dimensions (Survey Required)"
            is_geometry_verified = False
    else:
        geometry_status = "unverified_dimensions"
        geometry_source_label = "Unverified Dimensions (Survey Required)"
        is_geometry_verified = False

    # -------------------------------------------------------------------------
    # 5. Mandatory Rear and Side Setback Requirements
    # -------------------------------------------------------------------------
    rear_setback_m: float
    side_left_setback_m: float
    side_right_setback_m: float
    setback_rule_citation: str

    if max_height_m <= 12.0:
        rear_setback_m = 1.5
        effective_w_m = (measured_width_ft * FT_TO_M) if measured_width_ft else None

        if effective_w_m is not None and effective_w_m <= 6.0:
            side_left_setback_m = 1.0
            side_right_setback_m = 0.0
            setback_rule_citation = "Rule 35(1)(a): Narrow plot (frontage <= 6m), 1.0 m required on one side only."
        elif effective_w_m is not None and effective_w_m <= 9.0:
            side_left_setback_m = 1.5
            side_right_setback_m = 0.0
            setback_rule_citation = "Rule 35(1)(a): Plot width 6m-9m, 1.5 m required on one side only."
        elif effective_w_m is not None:
            side_left_setback_m = 1.5
            side_right_setback_m = 1.5
            setback_rule_citation = "Rule 35(1)(a): Standard plot (frontage > 9m), 1.5 m required on both sides."
        else:
            # When width is unmeasured, report standard guidance for plots > 9m
            side_left_setback_m = 1.5
            side_right_setback_m = 1.5
            setback_rule_citation = (
                "Rule 35(1)(a): Standard guidance assumes frontage > 9.0 m (1.5 m on both sides). "
                "Narrower plots (<=6m or 6-9m) have relaxed setbacks (1.0m to 1.5m on one side only)."
            )
    else:
        # Exceeding 12.0 m (Apartments, Commercial, Hospital, School under Rule 35(2))
        rear_setback_m = 3.0
        side_left_setback_m = 3.0
        side_right_setback_m = 3.0
        setback_rule_citation = "Rule 35(2): Structures exceeding 12.0 m require minimum 3.0 m all-around fire tender clearances."

    rear_setback_ft = rear_setback_m * M_TO_FT
    side_left_setback_ft = side_left_setback_m * M_TO_FT
    side_right_setback_ft = side_right_setback_m * M_TO_FT

    # -------------------------------------------------------------------------
    # 6. Floor Space Index & Built-Up Area Calculations
    # -------------------------------------------------------------------------
    # Theoretical Gross Floor Area: Area * Base FSI (Statutory maximum unconstrained by shape)
    theoretical_max_floor_area_sqft = area_sqft_f * base_fsi
    theoretical_max_floor_area_sqm = area_sqm_f * base_fsi

    # Distinguish verified geometric footprint from hypothetical estimates
    achievable_ground_footprint_sqft: Optional[float] = None
    achievable_ground_footprint_sqm: Optional[float] = None
    practical_achievable_floor_area_sqft: Optional[float] = None
    practical_achievable_floor_area_sqm: Optional[float] = None
    coverage_percentage: Optional[float] = None
    indicative_scenario: Optional[Dict[str, Any]] = None

    typical_floors = 3 if max_height_m <= 12.0 else 5

    if is_geometry_verified and measured_width_ft and measured_depth_ft:
        eff_width_ft = max(0.0, measured_width_ft - (side_left_setback_ft + side_right_setback_ft))
        eff_depth_ft = max(0.0, measured_depth_ft - (front_setback_ft + rear_setback_ft))
        raw_footprint = eff_width_ft * eff_depth_ft
        achievable_ground_footprint_sqft = min(area_sqft_f, max(0.0, raw_footprint))
        achievable_ground_footprint_sqm = achievable_ground_footprint_sqft * SQFT_TO_SQM
        coverage_percentage = (achievable_ground_footprint_sqft / area_sqft_f) * 100.0 if area_sqft_f > 0 else 0.0

        practical_achievable_floor_area_sqft = min(
            theoretical_max_floor_area_sqft,
            achievable_ground_footprint_sqft * typical_floors
        )
        practical_achievable_floor_area_sqm = practical_achievable_floor_area_sqft * SQFT_TO_SQM
    else:
        # DO NOT present an assumed 1:1.5 aspect ratio as an actual measured result!
        # Instead, provide an explicitly segregated indicative scenario clearly marked as hypothetical.
        hyp_depth_ft = math.sqrt(area_sqft_f * 1.5)
        hyp_width_ft = area_sqft_f / hyp_depth_ft
        hyp_eff_w = max(0.0, hyp_width_ft - (side_left_setback_ft + side_right_setback_ft))
        hyp_eff_d = max(0.0, hyp_depth_ft - (front_setback_ft + rear_setback_ft))
        hyp_footprint = min(area_sqft_f, max(0.0, hyp_eff_w * hyp_eff_d))
        hyp_practical_area = min(theoretical_max_floor_area_sqft, hyp_footprint * typical_floors)
        hyp_coverage_pct = (hyp_footprint / area_sqft_f) * 100.0 if area_sqft_f > 0 else 0.0

        indicative_scenario = {
            "is_purely_indicative": True,
            "disclaimer": (
                "This is an unverified mathematical scenario assuming an arbitrary 1:1.5 rectangular parcel. "
                "It is provided for conceptual visualization only and must NOT be used for architectural planning, "
                "site layout approval, or property transaction decisions."
            ),
            "assumed_aspect_ratio": "1:1.5 (Hypothetical rectangular plot)",
            "estimated_ground_footprint_sqft": _round_num(hyp_footprint, 1),
            "estimated_ground_footprint_sqm": _round_num(hyp_footprint * SQFT_TO_SQM, 2),
            "estimated_practical_floor_area_sqft": _round_num(hyp_practical_area, 1),
            "estimated_practical_floor_area_sqm": _round_num(hyp_practical_area * SQFT_TO_SQM, 2),
            "estimated_coverage_percentage": _round_num(hyp_coverage_pct, 1),
        }

    # -------------------------------------------------------------------------
    # 7. Planning Feasibility Synthesis
    # -------------------------------------------------------------------------
    feasibility_status: str
    feasibility_rating: str
    feasibility_summary: str

    if road_adequacy_status == "deficient":
        feasibility_status = "Regulatory Constraint"
        feasibility_rating = "Caution / Substandard Road"
        feasibility_summary = (
            f"The parcel does not meet the minimum statutory road width of {min_required_road_m:.1f} m "
            f"({min_required_road_ft:.1f} ft) required for {normalized_btype} development under TNCDBR 2019. "
            "Building plan approval may be rejected unless road widening or special zoning relaxation is granted."
        )
    elif is_geometry_verified and achievable_ground_footprint_sqft is not None and achievable_ground_footprint_sqft <= 0.0:
        feasibility_status = "Spatial Infeasibility"
        feasibility_rating = "Plot Too Narrow for Mandatory Setbacks"
        feasibility_summary = (
            f"With a verified plot frontage of {measured_width_ft:.1f} ft and depth of {measured_depth_ft:.1f} ft, "
            "the mandatory front, rear, and side setbacks exceed the parcel dimensions. "
            "No buildable ground footprint remains under standard zoning rules."
        )
    elif is_geometry_verified and achievable_ground_footprint_sqft is not None and achievable_ground_footprint_sqft < 250.0:
        feasibility_status = "Spatial Constraint"
        feasibility_rating = "Severely Constrained by Setbacks"
        feasibility_summary = (
            "After applying mandatory setbacks, the remaining buildable ground footprint "
            f"({achievable_ground_footprint_sqft:.0f} sq.ft) is too narrow for practical development. "
            "Consider amalgamating adjoining land or applying for setback relaxations under Continuous Building Area rules."
        )
    elif not is_geometry_verified:
        feasibility_status = "Statutorily Feasible (Dimensions Unverified)"
        feasibility_rating = "FSI Favorable / Dimension Survey Required"
        feasibility_summary = (
            f"Abutting road width ({road_width_ft_f:.1f} ft) meets standard TNCDBR 2019 requirements for {normalized_btype}. "
            f"Permissible Base FSI of {base_fsi:.2f} allows up to {theoretical_max_floor_area_sqft:,.0f} sq.ft of total "
            f"theoretical gross floor area across {floors_description.lower()}. "
            "Plot frontage (width) and depth are required to compute the exact setback-constrained buildable footprint."
        )
    else:
        feasibility_status = "Statutorily Feasible"
        feasibility_rating = "FSI & Setbacks Favorable"
        feasibility_summary = (
            f"Parcel dimensions ({measured_width_ft:.1f} ft × {measured_depth_ft:.1f} ft) and abutting road width "
            f"({road_width_ft_f:.1f} ft) comply with standard TNCDBR 2019 requirements for {normalized_btype}. "
            f"Permissible Base FSI of {base_fsi:.2f} allows up to {theoretical_max_floor_area_sqft:,.0f} sq.ft of theoretical "
            f"built-up area across {floors_description.lower()}, with {achievable_ground_footprint_sqft:,.0f} sq.ft buildable ground footprint."
        )

    # -------------------------------------------------------------------------
    # 8. Assumptions & Missing Parameters
    # -------------------------------------------------------------------------
    assumptions = [
        "Evaluated strictly against baseline rules for Non-Continuous Building Areas (Non-CBA) under TNCDBR 2019.",
        "Plot coverage is computed dynamically from setback clearances; Rule 35 does not apply a standalone flat percentage cap.",
        "Calculations assume normal flat ground topology without municipal road-widening reservations.",
        "Premium FSI (up to 40%-50% additional FSI upon fee payment) is excluded as eligibility depends on specific ward notification.",
        "Corner plot setbacks (requiring secondary front setback on the side road) require full street topology inspection.",
    ]

    missing_context: List[str] = []
    if not is_geometry_verified:
        missing_context.append(
            "Plot frontage (width) and depth: Required to determine exact side setbacks and certify realistic ground coverage."
        )
    if normalized_btype == "Commercial Building" and road_width_m_f < 12.0:
        missing_context.append(
            "Commercial complex scale: Roads < 12m permit small commercial up to 300 sq.m; larger complexes require 12m-18m."
        )

    return {
        "status": "complete",
        "statutory_source": OFFICIAL_SOURCE_CITATION,
        "disclaimer": STATUTORY_DISCLAIMER,
        "rule_category": rule_category,
        "rule_reference": rule_reference,
        "rule_title": rule_title,
        "building_type": normalized_btype,
        "geometry": {
            "status": geometry_status,
            "source_label": geometry_source_label,
            "is_verified": is_geometry_verified,
            "measured_width_ft": _round_num(measured_width_ft, 1),
            "measured_depth_ft": _round_num(measured_depth_ft, 1),
            "note": (
                "Verified boundary dimensions used for setback analysis."
                if is_geometry_verified
                else "Plot frontage and depth are not verified. Practical setback-constrained buildable footprint cannot be certified."
            ),
        },
        "road_width": {
            "feet": _round_num(road_width_ft_f, 1),
            "meters": _round_num(road_width_m_f, 2),
            "statutory_minimum_meters": _round_num(min_required_road_m, 2),
            "statutory_minimum_feet": _round_num(min_required_road_ft, 1),
            "adequacy": road_adequacy_status,
            "note": road_adequacy_message,
        },
        "floor_space_index": {
            "base_fsi": _round_num(base_fsi, 2),
            "theoretical_max_floor_area_sqft": _round_num(theoretical_max_floor_area_sqft, 1),
            "theoretical_max_floor_area_sqm": _round_num(theoretical_max_floor_area_sqm, 2),
            "practical_achievable_floor_area_sqft": _round_num(practical_achievable_floor_area_sqft, 1),
            "practical_achievable_floor_area_sqm": _round_num(practical_achievable_floor_area_sqm, 2),
            "formula": "Theoretical Max Floor Area = Total Plot Area × Base FSI",
            "distinction_note": (
                "Theoretical maximum floor area is purely mathematical (Plot Area × FSI). "
                "Practical achievable floor area accounts for ground footprint envelope remaining after setbacks "
                "multiplied by typical permissible floors. Requires verified plot frontage and depth."
            ),
        },
        "setbacks": {
            "front": {
                "meters": _round_num(front_setback_m, 2),
                "feet": _round_num(front_setback_ft, 1),
                "basis": front_setback_rule_note,
                "is_deterministic": True,
            },
            "rear": {
                "meters": _round_num(rear_setback_m, 2),
                "feet": _round_num(rear_setback_ft, 1),
                "basis": "Mandatory rear boundary clearance under Rule 35.",
                "is_deterministic": True,
            },
            "side_left": {
                "meters": _round_num(side_left_setback_m, 2),
                "feet": _round_num(side_left_setback_ft, 1),
                "basis": setback_rule_citation,
                "is_deterministic": is_geometry_verified,
            },
            "side_right": {
                "meters": _round_num(side_right_setback_m, 2),
                "feet": _round_num(side_right_setback_ft, 1),
                "basis": setback_rule_citation,
                "is_deterministic": is_geometry_verified,
            },
            "summary_display": (
                f"Front: {front_setback_m:.1f} m ({front_setback_ft:.1f} ft) · "
                f"Rear: {rear_setback_m:.1f} m ({rear_setback_ft:.1f} ft) · "
                f"Sides: {side_left_setback_m:.1f} m / {side_right_setback_m:.1f} m "
                f"({side_left_setback_ft:.1f} ft / {side_right_setback_ft:.1f} ft)"
            ),
        },
        "height_and_floors": {
            "max_permissible_height_meters": _round_num(max_height_m, 2),
            "max_permissible_height_feet": _round_num(max_height_ft, 1),
            "typical_permissible_floors": floors_description,
            "high_rise_eligible": high_rise_eligible,
            "high_rise_note": high_rise_note,
        },
        "plot_coverage": {
            "achievable_ground_footprint_sqft": _round_num(achievable_ground_footprint_sqft, 1),
            "achievable_ground_footprint_sqm": _round_num(achievable_ground_footprint_sqm, 2),
            "coverage_percentage": _round_num(coverage_percentage, 1),
            "is_measured": is_geometry_verified,
            "rule_note": (
                "TNCDBR Rule 35 plot coverage is dynamically bounded by mandatory setbacks rather than an "
                "arbitrary flat percentage cap."
            ),
        },
        "indicative_scenario": indicative_scenario,
        "planning_feasibility": {
            "status": feasibility_status,
            "rating": feasibility_rating,
            "summary": feasibility_summary,
        },
        "calculation_assumptions": assumptions,
        "missing_context": missing_context,
    }
