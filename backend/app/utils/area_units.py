"""
utils/area_units.py
-------------------
Centralized area conversion, unit normalization, building requirements,
and indicative construction cost estimation.

Conversion Factors:
- 1 sq.m  = 10.7639 sq.ft
- 1 cent  = 435.6 sq.ft
- 1 acre  = 43,560 sq.ft
"""

import enum
from typing import Dict, Any, Optional

SQFT_PER_SQM = 10.7639
SQFT_PER_CENT = 435.6
SQFT_PER_ACRE = 43560.0


class InputUnit(str, enum.Enum):
    """Supported area measurement units."""
    SQFT = "sq.ft"
    SQM = "sq.m"
    CENTS = "cents"
    ACRES = "acres"


class AreaSource(str, enum.Enum):
    """Source provenance of the parcel area."""
    DIRECT_INPUT = "direct_input"
    POLYGON = "polygon"


def normalize_input_unit(unit: Optional[Any]) -> InputUnit:
    """Normalizes arbitrary unit strings or Enum instances to InputUnit enum."""
    if not unit:
        return InputUnit.SQFT
    if isinstance(unit, InputUnit):
        return unit
    if hasattr(unit, "value"):
        unit = unit.value
    u = str(unit).strip().lower()
    if u.startswith("inputunit."):
        u = u.replace("inputunit.", "")
    if u in ["sq.ft", "sqft", "sq_ft", "square feet", "square_feet", "ft2", "ft²"]:
        return InputUnit.SQFT
    if u in ["sq.m", "sqm", "sq_m", "square meters", "square_meters", "m2", "m²"]:
        return InputUnit.SQM
    if u in ["cents", "cent", "ct"]:
        return InputUnit.CENTS
    if u in ["acres", "acre", "ac"]:
        return InputUnit.ACRES
    return InputUnit.SQFT


def convert_to_sqft(value: float, unit: Any) -> float:
    """
    Converts any supported area unit to square feet (sq.ft).
    Authoritative calculation layer for the entire platform.
    """
    if value is None or value <= 0:
        return 0.0
    
    val = float(value)
    normalized_unit = normalize_input_unit(unit)
    
    if normalized_unit == InputUnit.SQFT:
        return round(val, 2)
    elif normalized_unit == InputUnit.SQM:
        return round(val * SQFT_PER_SQM, 2)
    elif normalized_unit == InputUnit.CENTS:
        return round(val * SQFT_PER_CENT, 2)
    elif normalized_unit == InputUnit.ACRES:
        return round(val * SQFT_PER_ACRE, 2)
    
    return round(val, 2)


def get_all_area_conversions(area_sqft: float) -> Dict[str, Any]:
    """
    Returns a unified conversion dictionary across all 4 standard units.
    Used consistently by Suitability, Reports, and Dashboard.
    """
    sqft = max(0.0, float(area_sqft)) if area_sqft is not None else 0.0
    sqm = round(sqft / SQFT_PER_SQM, 2)
    cents = round(sqft / SQFT_PER_CENT, 4)
    acres = round(sqft / SQFT_PER_ACRE, 4)

    return {
        "sqft": round(sqft, 2),
        "sqm": sqm,
        "cents": cents,
        "acres": acres,
        "formatted_display": f"{sqm:,.2f} m² | {sqft:,.2f} sq.ft | {cents:.4f} cents | {acres:.4f} acres",
    }


# Centralized Building plot rules and cost rates
BUILDING_RULES = {
    "Individual House": {
        "min_sqft": 400.0,
        "rate_inr_sqft": 2000,
        "label": "Individual House",
        "description": "Single-family standalone residence",
    },
    "Residential House": {
        "min_sqft": 400.0,
        "rate_inr_sqft": 2000,
        "label": "Residential House",
        "description": "Single-family standalone residence",
    },
    "Apartment": {
        "min_sqft": 2000.0,
        "rate_inr_sqft": 2200,
        "label": "Multi-Unit Apartment",
        "description": "Multi-family residential complex",
    },
    "Commercial Building": {
        "min_sqft": 1500.0,
        "rate_inr_sqft": 2500,
        "label": "Commercial Building",
        "description": "Retail, commercial office or business hub",
    },
    "School": {
        "min_sqft": 5000.0,
        "rate_inr_sqft": 2000,
        "label": "Educational Facility / School",
        "description": "Educational campus with classrooms and grounds",
    },
    "Hospital": {
        "min_sqft": 10000.0,
        "rate_inr_sqft": 3000,
        "label": "Hospital / Healthcare Facility",
        "description": "Multi-tier healthcare facility with emergency bays",
    },
    "Hospital/Clinic": {
        "min_sqft": 10000.0,
        "rate_inr_sqft": 3000,
        "label": "Hospital / Healthcare Facility",
        "description": "Multi-tier healthcare facility with emergency bays",
    },
}


def validate_building_plot_feasibility(area_sqft: float, building_type: str) -> Dict[str, Any]:
    """
    Validates plot size against building minimum area requirements.
    Single source of truth for plot feasibility across the platform.
    """
    btype = building_type or "Individual House"
    rule = BUILDING_RULES.get(btype, BUILDING_RULES.get("Individual House", {"min_sqft": 400.0, "rate_inr_sqft": 2000}))
    min_sqft = float(rule["min_sqft"])
    actual_sqft = max(0.0, float(area_sqft))
    is_sufficient = actual_sqft >= min_sqft
    diff_sqft = round(actual_sqft - min_sqft, 1)

    if is_sufficient:
        val_status = f"Plot size ({actual_sqft:,.0f} sq.ft) is sufficient for {btype} (surplus of {diff_sqft:,.0f} sq.ft)."
    else:
        val_status = f"Plot size is too small for this building type. Entered plot size ({actual_sqft:,.0f} sq.ft) is below the minimum required {min_sqft:,.0f} sq.ft for a {btype} (deficit of {abs(diff_sqft):,.0f} sq.ft)."

    conversions = get_all_area_conversions(actual_sqft)

    return {
        "building_type": btype,
        "actual_area_sqft": actual_sqft,
        "actual_sqft": actual_sqft,
        "actual_area_sqm": conversions["sqm"],
        "actual_area_cents": conversions["cents"],
        "actual_area_acres": conversions["acres"],
        "required_min_sqft": min_sqft,
        "min_required_sqft": min_sqft,
        "is_valid": is_sufficient,
        "is_sufficient": is_sufficient,
        "deficit_or_surplus_sqft": abs(diff_sqft),
        "difference_sqft": diff_sqft,
        "status": "SUITABLE" if is_sufficient else "DEFICIT",
        "message": val_status,
    }


def calculate_indicative_construction_cost(area_sqft: float, building_type: str) -> Dict[str, Any]:
    """
    Calculates the indicative construction cost based on normalized area.
    Formula: Estimated Construction Cost = Land Area (sq.ft) * Building Type Rate
    """
    btype = building_type or "Individual House"
    rule = BUILDING_RULES.get(btype, BUILDING_RULES.get("Individual House", {"min_sqft": 400.0, "rate_inr_sqft": 2000}))
    rate_sqft = rule["rate_inr_sqft"]
    actual_sqft = max(0.0, float(area_sqft))
    
    est_total_cost = round(actual_sqft * rate_sqft, 2)
    mat_cost = round(est_total_cost * 0.55, 2)
    lab_cost = round(est_total_cost * 0.25, 2)
    oth_cost = round(est_total_cost * 0.20, 2)

    return {
        "building_type": btype,
        "area_sqft": actual_sqft,
        "rate_per_sqft": rate_sqft,
        "rate_per_sqft_inr": rate_sqft,
        "total_estimated_cost": est_total_cost,
        "total_estimated_cost_inr": est_total_cost,
        "material_cost": mat_cost,
        "material_cost_inr": mat_cost,
        "material_pct": 55,
        "labour_cost": lab_cost,
        "labour_cost_inr": lab_cost,
        "labour_pct": 25,
        "finishing_cost": oth_cost,
        "finishing_cost_inr": oth_cost,
        "finishing_pct": 20,
        "disclaimer": "This is an indicative estimate, not an official quotation or government-approved construction rate.",
    }
