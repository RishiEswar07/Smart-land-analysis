"""
services/comparison_service.py
------------------------------
Business logic for Multi-Parcel Comparison and Ranking.
Enforces strict user ownership, integrates TNCDBR 2019 statutory building rules,
computes comparative metrics, and provides transparent, justified parcel rankings.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import Analysis
from app.models.land import Land
from app.schemas.comparison import (
    AreaBreakdown,
    BuildingPlanningComparison,
    ComparisonSummary,
    FacilitiesDistance,
    ParcelComparisonItem,
    ParcelComparisonResponse,
    ParcelRankingItem,
)
from app.services.building_rule_service import evaluate_building_rules
from app.services.exceptions import NotFoundError
from app.services.facility_service import fetch_nearby_facilities
from app.utils.area_units import get_all_area_conversions

logger = logging.getLogger(__name__)

STATUTORY_COMPARISON_DISCLAIMER = (
    "This multi-parcel comparison and ranking is a preliminary decision-support assessment based "
    "on available inputs and statutory rules (including TNCDBR 2019). It does not constitute official "
    "planning approval, land-title clearance, environmental clearance, or architectural certification."
)

BUILDING_TYPE_MAPPING = {
    "individual house": "Individual House",
    "residential house": "Individual House",
    "apartment": "Apartment",
    "commercial building": "Shopping Complex",
    "commercial": "Shopping Complex",
    "shopping complex": "Shopping Complex",
    "hospital": "Hospital/Clinic",
    "hospital/clinic": "Hospital/Clinic",
    "school": "School",
}


def _calculate_completeness(land: Land, analysis: Optional[Analysis]) -> Tuple[float, str, List[str]]:
    """Evaluates data completeness percentage and identifies missing inputs."""
    score = 0.0
    missing = []

    # Coordinates (15%)
    if land.latitude is not None and land.longitude is not None:
        score += 15.0
    else:
        missing.append("Geographic GPS coordinates")

    # Area (20%)
    if land.area_sqft is not None and land.area_sqft > 0:
        score += 20.0
    else:
        missing.append("Plot area")

    # Road width (20%)
    if land.road_width is not None and land.road_width > 0:
        score += 20.0
    else:
        missing.append("Abutting road width")

    # Soil type (15%)
    if land.soil_type is not None:
        score += 15.0
    else:
        missing.append("Soil classification")

    # Utilities (10%)
    if land.water_availability is not None and land.electricity_availability is not None:
        score += 10.0
    elif land.water_availability is not None or land.electricity_availability is not None:
        score += 5.0
        missing.append("Partial utility status (water or electricity)")
    else:
        missing.append("Utility infrastructure (water and electricity)")

    # Analysis existence (20%)
    if analysis is not None:
        score += 20.0
    else:
        missing.append("AI suitability analysis (not yet analyzed)")

    score = round(min(100.0, score), 1)
    if score >= 85.0:
        status = "High Quality"
    elif score >= 60.0:
        status = "Moderate Quality"
    else:
        status = "Incomplete Data"

    return score, status, missing


def _extract_target_building_suitability(analysis: Optional[Analysis], target_building_type: str) -> Optional[float]:
    """Extracts target building suitability score from the analysis distribution or estimates it."""
    if analysis is None:
        return None

    mapped_btype = BUILDING_TYPE_MAPPING.get(target_building_type.lower(), target_building_type)
    rb = analysis.risk_breakdown or {}
    dist = rb.get("building_suitability_distribution", [])

    if isinstance(dist, list):
        for item in dist:
            if isinstance(item, dict) and item.get("name", "").lower() == mapped_btype.lower():
                # Item provides 'suitability' or 'probability'
                suit = item.get("suitability")
                if suit is not None:
                    return round(float(suit), 1)

    # Fallback to recommended building type match
    if analysis.recommended_building_type and (
        analysis.recommended_building_type.lower() == target_building_type.lower()
        or analysis.recommended_building_type.lower() == mapped_btype.lower()
    ):
        return round(float(analysis.suitability_score), 1)

    # Generic estimate based on overall suitability
    return round(float(analysis.suitability_score) * 0.8, 1)


def _extract_facilities_distance(land: Land) -> FacilitiesDistance:
    """Extracts nearest facilities distance from land cache if available."""
    cached = getattr(land, "facilities_cache", {}) or {}
    cats = cached.get("categories", {}) if isinstance(cached, dict) else {}

    def _min_dist(items: Any) -> Optional[float]:
        if not items or not isinstance(items, list):
            return None
        distances = []
        for it in items:
            if isinstance(it, dict) and "distance_km" in it and it["distance_km"] is not None:
                distances.append(float(it["distance_km"]))
        return round(min(distances), 2) if distances else None

    return FacilitiesDistance(
        nearest_school_km=_min_dist(cats.get("schools")),
        nearest_hospital_km=_min_dist(cats.get("hospitals")),
        nearest_commercial_km=_min_dist(cats.get("commercial")),
    )


def _rank_parcels(
    items: List[ParcelComparisonItem], target_building_type: str
) -> Tuple[List[ParcelRankingItem], ComparisonSummary]:
    """
    Ranks parcels using a multi-criteria algorithm tailored to the target building type.
    Handles missing data penalization and generates justified strengths and weaknesses.
    """
    ranked_results: List[Tuple[float, ParcelRankingItem]] = []
    has_any_analysis = any(it.has_analysis for it in items)
    avg_completeness = sum(it.data_completeness_pct for it in items) / len(items) if items else 0.0

    # If critical data is missing everywhere
    if not has_any_analysis or avg_completeness < 35.0:
        rankings = [
            ParcelRankingItem(
                parcel_id=it.land_id,
                land_name=it.land_name,
                rank=idx + 1,
                composite_score=0.0,
                is_recommended=False,
                status="Insufficient Data",
                key_strengths=[],
                key_weaknesses=["No suitability analysis has been run for this parcel."] + it.missing_data_items,
                regulatory_summary="Statutory evaluation incomplete due to missing suitability data.",
            )
            for idx, it in enumerate(items)
        ]
        summary = ComparisonSummary(
            target_building_type=target_building_type,
            winner_parcel_id=None,
            winner_parcel_name=None,
            verdict="Insufficient data for a reliable recommendation. Please perform suitability analyses on the selected parcels first.",
            recommendation_confidence="Insufficient Data",
            comparison_insights=[
                "One or more parcels lack an AI suitability analysis record.",
                "Complete analyses to enable automated multi-criteria ranking and risk comparison.",
            ],
            disclaimer=STATUTORY_COMPARISON_DISCLAIMER,
        )
        return rankings, summary

    for it in items:
        strengths: List[str] = []
        weaknesses: List[str] = []

        # 1. Target Building Suitability (Weight: 35%)
        # -------------------------------------------------------------
        if it.target_building_suitability_score is not None:
            suit_comp = it.target_building_suitability_score
            if suit_comp >= 75.0:
                strengths.append(f"High suitability score ({suit_comp:.1f}%) for {target_building_type}.")
            elif suit_comp < 50.0:
                weaknesses.append(f"Sub-optimal suitability score ({suit_comp:.1f}%) for {target_building_type}.")
        elif it.suitability_score is not None:
            suit_comp = it.suitability_score * 0.75
            weaknesses.append(f"Building-specific suitability unmodeled; using general suitability ({it.suitability_score:.1f}%).")
        else:
            suit_comp = 30.0
            weaknesses.append("Suitability analysis not yet executed.")

        # 2. Road Adequacy for Target Building Type (Weight: 25%)
        # -------------------------------------------------------------
        p_rules = it.planning_rules
        road_status = p_rules.road_adequacy_status
        road_w = it.road_width_ft

        if road_status == "adequate" or road_status == "surplus":
            road_comp = 100.0
            min_r = p_rules.min_required_road_ft or 0.0
            strengths.append(f"Abutting road width ({road_w:.0f} ft) meets or exceeds TNCDBR requirement ({min_r:.0f} ft) for {target_building_type}.")
        elif road_status == "substandard":
            road_comp = 50.0
            weaknesses.append(f"Road width ({road_w or 0:.0f} ft) is substandard. May require local continuous-building area (CBA) classification.")
        elif road_status == "deficient":
            road_comp = 15.0
            min_r = p_rules.min_required_road_ft or 0.0
            weaknesses.append(f"Road width ({road_w or 0:.0f} ft) is deficient under TNCDBR rules (min {min_r:.0f} ft required for {target_building_type}).")
        else:
            road_comp = 35.0
            weaknesses.append("Road width is unrecorded, preventing statutory access verification.")

        # 3. Flood & Environmental Safety (Weight: 20%)
        # -------------------------------------------------------------
        if it.flood_risk_score is not None:
            flood_safety = max(0.0, min(100.0, 100.0 - it.flood_risk_score))
            if it.flood_risk_score <= 30.0:
                strengths.append(f"Low hydrological flood risk ({it.flood_risk_score:.0f}% risk index).")
            elif it.flood_risk_score >= 60.0:
                weaknesses.append(f"Elevated flood risk ({it.flood_risk_score:.0f}% risk index) from GloFAS hydrological model.")
        elif it.flood_risk_level == "Low":
            flood_safety = 80.0
            strengths.append("Low flood risk classification.")
        elif it.flood_risk_level == "Moderate":
            flood_safety = 50.0
            weaknesses.append("Moderate flood risk classification.")
        elif it.flood_risk_level == "High":
            flood_safety = 20.0
            weaknesses.append("High flood risk classification.")
        else:
            flood_safety = 50.0
            weaknesses.append("Hydrological flood telemetry unavailable.")

        # 4. Infrastructure & Site Readiness (Weight: 20%)
        # -------------------------------------------------------------
        infra_comp = 0.0
        if it.infrastructure_score is not None:
            infra_comp += it.infrastructure_score * 0.6
        else:
            infra_comp += 30.0

        if it.water_availability is True and it.electricity_availability is True:
            infra_comp += 40.0
            strengths.append("Municipal water and power grid connections confirmed.")
        elif it.water_availability is True or it.electricity_availability is True:
            infra_comp += 20.0
            strengths.append("Partial utility connection available.")
        else:
            weaknesses.append("Utility connections (water/electricity) unconfirmed.")

        infra_comp = max(0.0, min(100.0, infra_comp))

        # Composite Score Calculation
        raw_composite = (
            (suit_comp * 0.35)
            + (road_comp * 0.25)
            + (flood_safety * 0.20)
            + (infra_comp * 0.20)
        )

        # Apply confidence penalty if data completeness is low
        completeness_factor = max(0.4, it.data_completeness_pct / 100.0)
        final_composite = round(raw_composite * completeness_factor, 1)

        # Plot size and FSI strength
        if p_rules.theoretical_max_floor_area_sqft:
            strengths.append(
                f"Permissible base FSI {p_rules.base_fsi or 2.0} supports up to {p_rules.theoretical_max_floor_area_sqft:,.0f} sq.ft gross floor area."
            )

        if not it.has_analysis:
            weaknesses.append("Lacks AI suitability analysis record.")

        # Status determination
        if road_status == "deficient":
            stat = "Deficient Road for Building Type"
        elif it.flood_risk_level == "High":
            stat = "High Flood Risk Warning"
        elif it.data_completeness_pct < 60.0:
            stat = "Viable with Incomplete Data"
        else:
            stat = "Viable Candidate"

        reg_summary = (
            f"FSI: {p_rules.base_fsi or 'N/A'}, Max Height: {p_rules.max_height_ft or 'N/A'}ft, "
            f"Road: {p_rules.road_adequacy_status or 'Unknown'}"
        )

        ranking_item = ParcelRankingItem(
            parcel_id=it.land_id,
            land_name=it.land_name,
            rank=0,  # Will be populated after sorting
            composite_score=final_composite,
            is_recommended=False,
            status=stat,
            key_strengths=strengths,
            key_weaknesses=weaknesses,
            regulatory_summary=reg_summary,
        )
        ranked_results.append((final_composite, ranking_item))

    # Statutory compliance takes precedence over raw score:
    # Parcels legally barred due to deficient access road are ranked below statutorily viable parcels.
    ranked_results.sort(
        key=lambda x: (not x[1].status.startswith("Deficient"), x[0]),
        reverse=True,
    )

    final_rankings: List[ParcelRankingItem] = []
    for rank_idx, (_, r_item) in enumerate(ranked_results):
        r_item.rank = rank_idx + 1
        if rank_idx == 0 and r_item.composite_score >= 45.0 and not r_item.status.startswith("Deficient"):
            r_item.is_recommended = True
            r_item.status = "Top Recommendation"
        final_rankings.append(r_item)

    winner = final_rankings[0] if final_rankings and final_rankings[0].is_recommended else None
    confidence = "High" if avg_completeness >= 80.0 else ("Moderate" if avg_completeness >= 60.0 else "Low")

    # Generate insights
    insights = []
    if winner:
        insights.append(
            f"'{winner.land_name}' is the top-ranked parcel for {target_building_type} with a composite suitability score of {winner.composite_score}%."
        )
        if len(final_rankings) > 1:
            runner_up = final_rankings[1]
            diff = round(winner.composite_score - runner_up.composite_score, 1)
            insights.append(
                f"It leads the runner-up '{runner_up.land_name}' by {diff} points, primarily due to "
                f"{winner.key_strengths[0] if winner.key_strengths else 'superior infrastructure and regulatory road compliance'}."
            )
    else:
        insights.append(
            f"No single parcel achieved an unequivocal recommendation for {target_building_type}. "
            "Please review road width adequacy and missing parameters across the parcels."
        )

    # Road deficiency check
    deficient_roads = [it.land_name for it in items if it.planning_rules.road_adequacy_status == "deficient"]
    if deficient_roads:
        insights.append(
            f"Statutory Warning: {', '.join(deficient_roads)} have abutting road widths below the TNCDBR threshold for {target_building_type}."
        )

    verdict_text = (
        f"'{winner.land_name}' is recommended as the most suitable parcel for {target_building_type}."
        if winner
        else f"None of the evaluated parcels fully meet both statutory road thresholds and suitability benchmarks for {target_building_type}."
    )

    summary = ComparisonSummary(
        target_building_type=target_building_type,
        winner_parcel_id=winner.parcel_id if winner else None,
        winner_parcel_name=winner.land_name if winner else None,
        verdict=verdict_text,
        recommendation_confidence=confidence,
        comparison_insights=insights,
        disclaimer=STATUTORY_COMPARISON_DISCLAIMER,
    )

    return final_rankings, summary


async def compare_parcels(
    db: AsyncSession,
    user_id: uuid.UUID,
    parcel_ids: List[uuid.UUID],
    target_building_type: str = "Individual House",
) -> ParcelComparisonResponse:
    """
    Main entry point for multi-parcel comparison.
    Fetches parcels, validates ownership, extracts metrics, evaluates TNCDBR rules,
    and returns a side-by-side comparison matrix with justified rankings.
    """
    if len(parcel_ids) < 2 or len(parcel_ids) > 3:
        raise ValueError("Multi-parcel comparison requires between 2 and 3 parcels.")

    # 1. Fetch strictly user-owned lands
    stmt = select(Land).where(Land.id.in_(parcel_ids), Land.user_id == user_id)
    result = await db.execute(stmt)
    lands_dict = {land.id: land for land in result.scalars().all()}

    # Verify that all requested parcel IDs were found and belong to this user
    missing_ids = [pid for pid in parcel_ids if pid not in lands_dict]
    if missing_ids:
        raise NotFoundError(
            entity="Land",
            identifier=f"Parcels {missing_ids} were not found or do not belong to the authenticated user.",
        )

    # Preserve the caller's requested ordering
    ordered_lands = [lands_dict[pid] for pid in parcel_ids]

    # 2. Build comparison items for each parcel
    parcel_items: List[ParcelComparisonItem] = []

    for land in ordered_lands:
        # Fetch latest analysis for this land
        an_stmt = (
            select(Analysis)
            .where(Analysis.land_id == land.id)
            .order_by(Analysis.created_at.desc())
            .limit(1)
        )
        an_res = await db.execute(an_stmt)
        analysis: Optional[Analysis] = an_res.scalar_one_or_none()

        # Area conversions
        area_sqft = float(land.area_sqft) if (land.area_sqft and land.area_sqft > 0) else 1500.0
        conversions = get_all_area_conversions(area_sqft)
        area_bd = AreaBreakdown(
            sqft=conversions["sqft"],
            sqm=conversions["sqm"],
            cents=conversions["cents"],
            acres=conversions["acres"],
            source=getattr(land, "area_source", "polygon") or "polygon",
            formatted_display=conversions["formatted_display"],
        )

        # TNCDBR 2019 Building Rules
        rules_dict = evaluate_building_rules(
            area_sqft=land.area_sqft,
            road_width_ft=land.road_width,
            building_type=target_building_type,
            boundary_geojson=land.boundary_geojson,
        )

        rw = rules_dict.get("road_width", {}) if isinstance(rules_dict.get("road_width"), dict) else {}
        fsi = rules_dict.get("floor_space_index", {}) if isinstance(rules_dict.get("floor_space_index"), dict) else {}
        hf = rules_dict.get("height_and_floors", {}) if isinstance(rules_dict.get("height_and_floors"), dict) else {}
        geom = rules_dict.get("geometry", {}) if isinstance(rules_dict.get("geometry"), dict) else {}
        sb = rules_dict.get("setbacks", {}) if isinstance(rules_dict.get("setbacks"), dict) else {}
        pf = rules_dict.get("planning_feasibility", {}) if isinstance(rules_dict.get("planning_feasibility"), dict) else {}

        front_sb = sb.get("front", {}).get("feet") if isinstance(sb.get("front"), dict) else None
        rear_sb = sb.get("rear", {}).get("feet") if isinstance(sb.get("rear"), dict) else None
        side1_sb = sb.get("side_left", {}).get("feet") if isinstance(sb.get("side_left"), dict) else None
        side2_sb = sb.get("side_right", {}).get("feet") if isinstance(sb.get("side_right"), dict) else None

        planning_comp = BuildingPlanningComparison(
            status=rules_dict.get("status", "insufficient_data"),
            rule_reference=rules_dict.get("rule_reference"),
            rule_category=rules_dict.get("rule_category"),
            base_fsi=fsi.get("base_fsi"),
            max_permissible_fsi=fsi.get("max_permissible_fsi", fsi.get("base_fsi")),
            theoretical_max_floor_area_sqft=fsi.get("theoretical_max_floor_area_sqft"),
            practical_achievable_floor_area_sqft=fsi.get("practical_achievable_floor_area_sqft"),
            is_geometry_verified=bool(geom.get("is_verified", False)),
            front_setback_ft=front_sb,
            rear_setback_ft=rear_sb,
            side_setback1_ft=side1_sb,
            side_setback2_ft=side2_sb,
            max_height_ft=hf.get("max_permissible_height_feet"),
            permissible_floors=hf.get("typical_permissible_floors"),
            road_adequacy_status=rw.get("adequacy"),
            road_adequacy_message=rw.get("note"),
            min_required_road_ft=rw.get("statutory_minimum_feet"),
            feasibility_status=pf.get("status"),
            spatial_feasibility_note=pf.get("summary"),
        )

        # Completeness & Quality
        completeness_pct, comp_status, missing_items = _calculate_completeness(land, analysis)

        # Target building suitability
        target_suit = _extract_target_building_suitability(analysis, target_building_type)

        # Facilities
        fac_dist = _extract_facilities_distance(land)

        # Risk breakdown details
        flood_score = None
        env_score = None
        if analysis and analysis.risk_breakdown:
            f_item = analysis.risk_breakdown.get("flood_risk")
            if isinstance(f_item, dict) and "score" in f_item:
                flood_score = f_item.get("score")
            e_item = analysis.risk_breakdown.get("environmental_risk")
            if isinstance(e_item, dict) and "score" in e_item:
                env_score = e_item.get("score")

        suit_rating = None
        if analysis:
            if analysis.suitability_score >= 75.0:
                suit_rating = "High Suitability"
            elif analysis.suitability_score >= 50.0:
                suit_rating = "Moderate Suitability"
            else:
                suit_rating = "Low Suitability"

        item = ParcelComparisonItem(
            land_id=land.id,
            land_name=land.land_name,
            address=land.address,
            latitude=land.latitude,
            longitude=land.longitude,
            land_type=land.land_type.value if hasattr(land.land_type, "value") else str(land.land_type),
            soil_type=land.soil_type.value if hasattr(land.soil_type, "value") else (str(land.soil_type) if land.soil_type else None),
            area_sqft=area_sqft,
            area_breakdown=area_bd,
            road_width_ft=land.road_width,
            water_availability=land.water_availability,
            electricity_availability=land.electricity_availability,
            has_analysis=analysis is not None,
            analysis_id=analysis.id if analysis else None,
            analyzed_at=analysis.created_at.isoformat() if analysis and analysis.created_at else None,
            suitability_score=analysis.suitability_score if analysis else None,
            suitability_rating=suit_rating,
            target_building_suitability_score=target_suit,
            recommended_building_type=analysis.recommended_building_type if analysis else None,
            overall_risk_score=analysis.risk_score if analysis else None,
            overall_risk_level=analysis.risk_level if analysis else None,
            flood_risk_level=analysis.flood_risk if analysis else None,
            flood_risk_score=flood_score,
            environmental_risk_level=analysis.environmental_risk if analysis else None,
            environmental_risk_score=env_score,
            infrastructure_score=analysis.infrastructure_score if analysis else None,
            traffic_accessibility_score=analysis.traffic_accessibility_score if analysis else None,
            facilities=fac_dist,
            planning_rules=planning_comp,
            data_completeness_pct=completeness_pct,
            data_completeness_status=comp_status,
            missing_data_items=missing_items,
        )
        parcel_items.append(item)

    # 3. Compute rankings and summary
    rankings, summary = _rank_parcels(parcel_items, target_building_type)

    return ParcelComparisonResponse(
        target_building_type=target_building_type,
        total_parcels=len(parcel_items),
        parcels=parcel_items,
        rankings=rankings,
        summary=summary,
    )
