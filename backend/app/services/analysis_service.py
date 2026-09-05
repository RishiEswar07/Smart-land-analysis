"""
services/analysis_service.py
-----------------------------
AI Suitability + Risk scoring engine.
Uses Machine Learning (RandomForest) with Real-Time Open-Meteo & Overpass API Data.
"""

import uuid
import httpx
import numpy as np
import pandas as pd
import logging
import json
from dataclasses import dataclass, field
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import Analysis
from app.models.land import Land, LandType, SoilType
from app.services.exceptions import NotFoundError
from app.services.soil_service import fetch_soilgrids_data
from app.services.landcover_service import get_land_cover, LandCoverLookupError

logger = logging.getLogger(__name__)

# ============================================================
# ML Model Training (In-Memory Mock on Startup)
# ============================================================

_soil_types = [s.value for s in SoilType]
_land_types = [l.value for l in LandType]

# Instead of generating synthetic data, we load the real historical datasets
def _load_real_dataset():
    import os
    dataset_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'land_risk_dataset.csv')
    return pd.read_csv(dataset_path)

def _load_indian_flood_dataset():
    import os
    dataset_path = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'indian_flood_land_dataset.csv')
    if os.path.exists(dataset_path):
        try:
            df_ind = pd.read_csv(dataset_path)
            df_ind['latitude'] = pd.to_numeric(df_ind['latitude'], errors='coerce')
            df_ind['longitude'] = pd.to_numeric(df_ind['longitude'], errors='coerce')
            return df_ind.dropna(subset=['latitude', 'longitude'])
        except Exception as e:
            logger.error(f"Error loading regional dataset: {e}")
    return None

df = _load_real_dataset()
df_regional = _load_indian_flood_dataset()

# Label Encoders
le_soil = LabelEncoder().fit(_soil_types)
le_land = LabelEncoder().fit(_land_types)
le_btype = LabelEncoder().fit(df['btype'])

df['soil_enc'] = le_soil.transform(df['soil'])
df['land_enc'] = le_land.transform(df['land'])
df['btype_enc'] = le_btype.transform(df['btype'])

# Included all real-time features
X = df[['soil_enc', 'land_enc', 'road', 'water', 'elec', 'area', 'elevation', 'discharge', 'schools', 'hospitals', 'hotels']]

# Train Models
reg_risk = RandomForestRegressor(n_estimators=50, random_state=42).fit(X, df[['flood_risk', 'env_risk', 'access_risk', 'infra_risk', 'overall_risk', 'suitability']])
clf_btype = RandomForestClassifier(n_estimators=50, random_state=42).fit(X, df['btype_enc'])

def _get_nearest_regional_info(lat: float, lng: float):
    """Finds nearest regional record from indian_flood_land_dataset.csv"""
    try:
        if df_regional is None or df_regional.empty:
            return None
        
        dists = (df_regional['latitude'] - float(lat))**2 + (df_regional['longitude'] - float(lng))**2
        idx = dists.idxmin()
        return df_regional.iloc[idx].to_dict()
    except Exception as e:
        logger.error(f"Error querying regional dataset: {e}")
        return None

# ============================================================
# Core Functions
# ============================================================

def _clip(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))

def _risk_level(risk_score: float) -> str:
    if risk_score <= 30: return "Low"
    if risk_score <= 60: return "Moderate"
    return "High"

def _level_label(score: float) -> str:
    if score <= 30: return "Low"
    if score <= 60: return "Moderate"
    return "High"

@dataclass
class _AnalysisResult:
    suitability_score: float
    recommended_building_type: str
    flood_risk: str
    environmental_risk: str
    infrastructure_score: float
    traffic_accessibility_score: float
    risk_score: float
    risk_level: str
    risk_breakdown: dict = field(default_factory=dict)
    explanation: str = ""

def _build_explanation(land: Land, r: dict) -> str:
    btype = r['building_type']
    schools = r['schools']
    hospitals = r['hospitals']
    hotels = r['hotels']
    road = land.road_width or 20.0
    reg_info = r.get('reg_info')
    lc = r.get('land_cover')
    
    # 1. Satellite & Spatial Land Cover Check
    reasons = []
    if lc:
        reasons.append(f"Satellite Land Cover (ESA WorldCover 2021): {lc.class_name} [{lc.construction_suitability}] — {lc.suitability_note}")
    elif reg_info:
        cover = reg_info.get('land_cover', 'Unknown')
        hist_flood = reg_info.get('historical_floods', 0) or reg_info.get('flood_occurred', 0)
        if cover == 'Water Body':
            reasons.append("CRITICAL WARNING: Spatial land cover lookup identifies this location inside or directly adjacent to a Water Body. Construction suitability is heavily penalized.")
        elif hist_flood == 1:
            reasons.append(f"Historical GIS records indicate past flood events in this zone (elevation: {r['elevation']:.1f}m, discharge: {r['discharge']:.1f} m³/s).")

    # 2. Why this building type?
    if btype == "Not Recommended":
        reasons.append("Construction is NOT recommended at this site due to high-risk satellite land-cover or ecological protection status.")
    elif btype == "School" and schools == 0:
        reasons.append(f"A {btype} is highly recommended here due to a lack of educational facilities within a 2km radius (high demand).")
    elif btype == "Hospital/Clinic" and hospitals == 0:
        reasons.append(f"A {btype} is strongly suggested because the ML model detected 0 medical facilities nearby and sufficient road width ({road}ft) for emergency access.")
    elif btype == "Hotel/Resort" and hotels == 0:
        reasons.append(f"A {btype} is viable due to zero market saturation (0 hotels nearby) and low flood risk.")
    elif btype in ["Apartment", "Individual House"]:
        reasons.append(f"Recommended as {btype} due to solid infrastructure metrics and {land.land_type.value.lower()} zoning.")
    else:
        reasons.append(f"Recommended as {btype} for this {land.land_type.value.lower()} plot based on ML spatial predictions.")
        
    # 3. Why NOT other types?
    rejections = []
    if btype != "Not Recommended":
        if btype != "Hospital/Clinic":
            if hospitals > 1:
                rejections.append(f"A Hospital/Clinic is NOT recommended due to market saturation (already {hospitals} nearby).")
            elif road < 25:
                rejections.append("A Hospital/Clinic is rejected due to narrow traffic access (<25ft road) unsuitable for ambulances.")
        
        if btype != "Hotel/Resort" and hotels > 2:
            rejections.append(f"A Hotel/Resort is rejected due to heavy local competition ({hotels} nearby).")
            
        if btype != "School" and schools > 3:
            rejections.append(f"A School is not advised as the area is already heavily served ({schools} existing).")
        
    parts = reasons + rejections + [
        f"Real-time API metrics show plot elevation at {r['elevation']:.1f}m and nearest river discharge at {r['discharge']:.1f} m³/s, strongly influencing the {r['flood_score']}% flood risk score."
    ]
    return " ".join(parts)

async def _fetch_overpass_amenities(lat: float, lng: float):
    """Queries OpenStreetMap Overpass API for facilities within 2000m"""
    schools, hospitals, hotels = 0, 0, 0
    query = f"""
    [out:json][timeout:5];
    (
      node["amenity"~"school|hospital|clinic"](around:2000,{lat},{lng});
      node["tourism"~"hotel"](around:2000,{lat},{lng});
    );
    out count;
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post("https://overpass-api.de/api/interpreter", data=query, timeout=8.0)
            if resp.status_code == 200:
                data = resp.json()
                if "elements" in data and len(data["elements"]) > 0:
                    tags = data["elements"][0].get("tags", {})
                    schools = int(tags.get("amenity", 0)) // 2
                    hospitals = int(tags.get("amenity", 0)) // 4
                    hotels = int(tags.get("tourism", 0))
    except Exception as e:
        logger.error(f"Error fetching Overpass data: {e}")
        schools, hospitals, hotels = 1, 0, 0
        
    return schools, hospitals, hotels

async def _fetch_realtime_metrics(lat: float, lng: float):
    elevation = 150.0 
    discharge = 0.0
    try:
        async with httpx.AsyncClient() as client:
            elv_resp = await client.get(f"https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lng}", timeout=5.0)
            if elv_resp.status_code == 200 and "elevation" in elv_resp.json():
                elevs = elv_resp.json()["elevation"]
                if elevs and len(elevs) > 0:
                    elevation = elevs[0]
            
            flood_resp = await client.get(f"https://flood-api.open-meteo.com/v1/flood?latitude={lat}&longitude={lng}&daily=river_discharge", timeout=5.0)
            if flood_resp.status_code == 200 and "daily" in flood_resp.json():
                daily = flood_resp.json()["daily"]
                if "river_discharge" in daily and len(daily["river_discharge"]) > 0:
                    discharges = [d for d in daily["river_discharge"] if d is not None]
                    if discharges:
                        discharge = discharges[-1]
    except Exception as e:
        logger.error(f"Error fetching real-time metrics: {e}")
    return elevation, discharge

def compute_hydrological_flood_risk(
    elevation: float,
    discharge: float,
    soil_type: str = "Loamy",
    land_cover_category: str = None
) -> float:
    """
    Physically-based continuous hydrological flood risk scoring.
    Combines:
    1. Geomorphic elevation baseline (meters above sea level)
    2. Real-time river discharge (m³/s from Open-Meteo Flood API)
    3. Soil percolation & drainage capacity
    4. Satellite land cover proximity / water bodies
    """
    # 1. Elevation Curve
    # Lowlands (<10m) have high baseline flood vulnerability;
    # Uplands & hills (>100m) have low to negligible baseline river flooding.
    if elevation <= 5.0:
        elev_risk = 85.0 - (elevation / 5.0) * 10.0
    elif elevation <= 20.0:
        elev_risk = 75.0 - ((elevation - 5.0) / 15.0) * 25.0
    elif elevation <= 50.0:
        elev_risk = 50.0 - ((elevation - 20.0) / 30.0) * 22.0
    elif elevation <= 100.0:
        elev_risk = 28.0 - ((elevation - 50.0) / 50.0) * 14.0
    elif elevation <= 200.0:
        elev_risk = 14.0 - ((elevation - 100.0) / 100.0) * 8.0
    else:
        elev_risk = max(3.0, 6.0 - ((elevation - 200.0) / 300.0) * 3.0)

    # 2. River Discharge Impact (Open-Meteo daily river discharge in m³/s)
    if discharge <= 10.0:
        flow_risk = 0.0
    elif discharge <= 100.0:
        flow_risk = (discharge / 100.0) * 15.0
    elif discharge <= 500.0:
        flow_risk = 15.0 + ((discharge - 100.0) / 400.0) * 25.0
    elif discharge <= 1500.0:
        flow_risk = 40.0 + ((discharge - 500.0) / 1000.0) * 30.0
    else:
        flow_risk = min(85.0, 70.0 + ((discharge - 1500.0) / 2000.0) * 15.0)

    # If elevation is high (> 120m), high river flow in distant regional channels has reduced impact on the plot
    if elevation > 120.0:
        flow_risk = flow_risk * max(0.1, (250.0 - elevation) / 130.0)

    # 3. Soil Drainage Adjustment
    soil_adj = 0.0
    s_lower = (soil_type or "").lower()
    if "clay" in s_lower or "black" in s_lower:
        soil_adj = +6.0
    elif "sand" in s_lower or "red" in s_lower or "rock" in s_lower or "gravel" in s_lower:
        soil_adj = -4.0

    # 4. Combined Raw Flood Risk
    flood_score = (elev_risk * 0.70) + (flow_risk * 0.30) + soil_adj

    # 5. Satellite Land-Cover Overrides
    if land_cover_category in ["Water", "Wetland", "Mangroves"]:
        flood_score = max(flood_score, 90.0)

    return round(_clip(flood_score, 2.0, 98.0), 1)

async def compute_analysis(land: Land) -> _AnalysisResult:
    lat = land.latitude or 0.0
    lng = land.longitude or 0.0
    
    # 1. Fetch live metrics
    elevation, discharge = await _fetch_realtime_metrics(lat, lng)
    schools, hospitals, hotels = await _fetch_overpass_amenities(lat, lng)
    reg_info = _get_nearest_regional_info(lat, lng)
    soil_data = await fetch_soilgrids_data(lat, lng)
    
    # Real ESA WorldCover Satellite Land-Cover Lookup
    land_cover_res = None
    try:
        land_cover_res = get_land_cover(lat, lng)
    except LandCoverLookupError as exc:
        logger.warning(f"ESA WorldCover lookup note for ({lat}, {lng}): {exc}")
    except Exception as exc:
        logger.warning(f"ESA WorldCover unexpected error for ({lat}, {lng}): {exc}")

    # 2. Build ML Input
    if land.soil_type:
        s_val = land.soil_type.value
    elif soil_data and soil_data.get("soil_type"):
        s_val = soil_data["soil_type"]
    else:
        s_val = reg_info.get('soil_type', 'Loamy') if reg_info else "Loamy"
    
    l_val = land.land_type.value if land.land_type else "Residential"
    
    # Fallback soil mapping if soil_type string differs
    s_val_clean = s_val if s_val in _soil_types else "Loamy"
    
    s_enc = le_soil.transform([s_val_clean])[0]
    l_enc = le_land.transform([l_val])[0]
    
    road_val = land.road_width if land.road_width is not None else 20.0
    water_val = 1 if land.water_availability else 0
    elec_val = 1 if land.electricity_availability else 0
    area_val = land.area_sqft if land.area_sqft is not None else 1500.0
    
    x_input = pd.DataFrame([{
        'soil_enc': s_enc, 'land_enc': l_enc, 'road': road_val, 
        'water': water_val,
        'elec': elec_val,
        'area': area_val,
        'elevation': elevation,
        'discharge': discharge,
        'schools': schools,
        'hospitals': hospitals,
        'hotels': hotels
    }])

    # 3. Predict Sub-scores
    preds = reg_risk.predict(x_input)[0]
    _, env_score, access_score, infra_risk, _, _ = (round(_clip(p), 1) for p in preds)
    
    # Accurate physically-based flood risk from live Open-Meteo elevation and river discharge
    lc_cat = land_cover_res.category if land_cover_res else None
    flood_score = compute_hydrological_flood_risk(elevation, discharge, s_val_clean, lc_cat)
    
    # 4. Regional Dataset Penalties & Overrides
    if reg_info:
        cover = reg_info.get('land_cover')
        hist_flood = reg_info.get('historical_floods', 0) or reg_info.get('flood_occurred', 0)
        if cover == 'Water Body':
            flood_score = max(flood_score, 85.0)
        if hist_flood == 1 and elevation < 80.0:
            flood_score = round(_clip(flood_score + 15.0), 1)

    # 5. ESA WorldCover High-Confidence Ground-Truth Overrides
    if land_cover_res:
        if land_cover_res.construction_suitability == "Unsuitable":
            env_score = max(env_score, 95.0)
            if land_cover_res.category in ["Water", "Wetland"]:
                flood_score = max(flood_score, 90.0)
        elif land_cover_res.construction_suitability == "Caution":
            env_score = round(_clip(env_score + 15.0), 1)
    
    # Aggregate Risk Score & Suitability directly from physical components
    risk_score = round(_clip(flood_score * 0.35 + access_score * 0.25 + infra_risk * 0.25 + env_score * 0.15), 1)
    suitability = round(_clip(100.0 - risk_score), 1)
    if land_cover_res and land_cover_res.construction_suitability == "Unsuitable":
        suitability = min(suitability, 5.0)
        risk_score = max(risk_score, 95.0)

    btype_pred = clf_btype.predict(x_input)[0]
    building_type = le_btype.inverse_transform([btype_pred])[0]
    if land_cover_res and land_cover_res.construction_suitability == "Unsuitable":
        building_type = "Not Recommended"

    risk_level = _risk_level(risk_score)
    infra_readiness = round(_clip(100.0 - infra_risk), 1)
    traffic_score = round(_clip(100.0 - access_score), 1)

    env_label = f"Environmental Risk ({land_cover_res.class_name})" if land_cover_res else "Environmental Risk"
    risk_breakdown = {
        "flood_risk": {"label": f"Flood Risk (Elev: {elevation:.0f}m, Flow: {discharge:.0f}m³/s)", "score": flood_score, "weight": 0.35},
        "accessibility_risk": {"label": "Accessibility / Road Risk", "score": access_score, "weight": 0.25},
        "infrastructure_risk": {"label": "Infrastructure Risk", "score": infra_risk, "weight": 0.25},
        "environmental_risk": {"label": env_label, "score": env_score, "weight": 0.15},
    }

    explanation = _build_explanation(
        land,
        {
            "building_type": building_type,
            "risk_level": risk_level,
            "risk_score": risk_score,
            "flood_score": flood_score,
            "access_score": access_score,
            "infra_risk": infra_risk,
            "env_score": env_score,
            "elevation": elevation,
            "discharge": discharge,
            "schools": schools,
            "hospitals": hospitals,
            "hotels": hotels,
            "reg_info": reg_info,
            "land_cover": land_cover_res,
        },
    )

    return _AnalysisResult(
        suitability_score=suitability,
        recommended_building_type=building_type,
        flood_risk=_level_label(flood_score),
        environmental_risk=_level_label(env_score),
        infrastructure_score=infra_readiness,
        traffic_accessibility_score=traffic_score,
        risk_score=risk_score,
        risk_level=risk_level,
        risk_breakdown=risk_breakdown,
        explanation=explanation,
    )

async def predict_for_land(db: AsyncSession, land_id: uuid.UUID) -> Analysis:
    result = await db.execute(select(Land).where(Land.id == land_id))
    land = result.scalar_one_or_none()
    if land is None:
        raise NotFoundError(entity="Land", identifier=str(land_id))

    computed = await compute_analysis(land)

    analysis = Analysis(
        land_id=land.id,
        suitability_score=computed.suitability_score,
        recommended_building_type=computed.recommended_building_type,
        flood_risk=computed.flood_risk,
        environmental_risk=computed.environmental_risk,
        infrastructure_score=computed.infrastructure_score,
        traffic_accessibility_score=computed.traffic_accessibility_score,
        risk_score=computed.risk_score,
        risk_level=computed.risk_level,
        risk_breakdown=computed.risk_breakdown,
        ai_explanation=computed.explanation,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)
    return analysis

async def get_analysis(db: AsyncSession, analysis_id: uuid.UUID) -> Analysis:
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id))
    analysis = result.scalar_one_or_none()
    if analysis is None:
        raise NotFoundError(entity="Analysis", identifier=str(analysis_id))
    return analysis
