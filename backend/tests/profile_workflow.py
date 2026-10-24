import asyncio
import time
import uuid
import httpx
from sqlalchemy import select
from app.db.session import AsyncSessionLocal as async_session_factory
from app.models.land import Land, LandType
from app.models.user import User
from app.models.analysis import Analysis
from app.services.analysis_service import (
    _fetch_realtime_metrics,
    _fetch_overpass_amenities,
    compute_analysis,
    build_detailed_analysis_dict,
)
from app.services.soil_service import fetch_soilgrids_data
from app.services.landcover_service import get_land_cover
from app.services.facility_service import fetch_nearby_facilities
from app.utils.pdf_generator import generate_land_report_pdf
from app.utils.excel_generator import generate_land_report_excel

async def profile_components():
    lat, lng = 13.0827, 80.2707  # Chennai
    print("=" * 60)
    print("PROFILING COMPONENT EXECUTION TIMES (Single Run)")
    print("=" * 60)

    # 1. Realtime Metrics (Open-Meteo elevation + flood)
    t0 = time.perf_counter()
    metrics = await _fetch_realtime_metrics(lat, lng)
    t_metrics = (time.perf_counter() - t0) * 1000
    print(f"1. Open-Meteo Metrics:       {t_metrics:.2f} ms -> {metrics}")

    # 2. Overpass Amenities
    t0 = time.perf_counter()
    amenities = await _fetch_overpass_amenities(lat, lng)
    t_amenities = (time.perf_counter() - t0) * 1000
    print(f"2. Overpass Amenities:       {t_amenities:.2f} ms -> {amenities}")

    # 3. SoilGrids Data
    t0 = time.perf_counter()
    soil = await fetch_soilgrids_data(lat, lng)
    t_soil = (time.perf_counter() - t0) * 1000
    print(f"3. SoilGrids API:            {t_soil:.2f} ms -> {soil.get('soil_type', 'N/A')}")

    # 4. ESA WorldCover Local Raster Lookup
    t0 = time.perf_counter()
    lc = get_land_cover(lat, lng)
    t_lc = (time.perf_counter() - t0) * 1000
    print(f"4. ESA WorldCover Raster:    {t_lc:.2f} ms -> {lc.class_name if lc else 'None'}")

    # 5. Database Query: Create User & Land & Read
    t0 = time.perf_counter()
    async with async_session_factory() as db:
        user_res = await db.execute(select(User).limit(1))
        user = user_res.scalar_one_or_none()
        if not user:
            user = User(
                id=uuid.uuid4(),
                email=f"profile_{uuid.uuid4().hex[:6]}@example.com",
                name="Profile User",
                hashed_password="pw",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        land = Land(
            id=uuid.uuid4(),
            user_id=user.id,
            land_name="Profile Parcel",
            address="Chennai, Tamil Nadu",
            latitude=lat,
            longitude=lng,
            land_type=LandType.RESIDENTIAL,
            area_sqft=2400.0,
            road_width=None,
        )
        db.add(land)
        await db.commit()
        await db.refresh(land)
    t_db = (time.perf_counter() - t0) * 1000
    print(f"5. DB Land Insert & Commit:  {t_db:.2f} ms -> Land ID: {land.id}")

    # 6. Entire compute_analysis() (includes parallel external calls + ML rule calculation)
    t0 = time.perf_counter()
    res = await compute_analysis(land)
    t_compute = (time.perf_counter() - t0) * 1000
    print(f"6. compute_analysis() Total: {t_compute:.2f} ms -> Suitability: {res.suitability_score}")

    # 7. Nearby Facilities (Overpass multi-mirror query)
    t0 = time.perf_counter()
    fac = await fetch_nearby_facilities(lat, lng, radius_km=5.0)
    t_fac = (time.perf_counter() - t0) * 1000
    print(f"7. Nearby Facilities Overpass: {t_fac:.2f} ms -> Status: {fac['status']}, Count: {fac.get('total_found', 0)}")

    # 8. Report Generation (PDF & Excel)
    dummy_analysis = Analysis(
        id=uuid.uuid4(),
        land_id=land.id,
        suitability_score=res.suitability_score,
        recommended_building_type=res.recommended_building_type,
        flood_risk=res.flood_risk,
        environmental_risk=res.environmental_risk,
        infrastructure_score=res.infrastructure_score,
        traffic_accessibility_score=res.traffic_accessibility_score,
        risk_score=res.risk_score,
        risk_level=res.risk_level,
        risk_breakdown=res.risk_breakdown,
        ai_explanation=res.explanation,
    )
    details = build_detailed_analysis_dict(land, dummy_analysis)
    details["nearby_facilities"] = fac

    t0 = time.perf_counter()
    pdf_bytes = generate_land_report_pdf(land, dummy_analysis, details)
    t_pdf = (time.perf_counter() - t0) * 1000
    print(f"8. PDF Report Generation:    {t_pdf:.2f} ms -> {len(pdf_bytes)} bytes")

    t0 = time.perf_counter()
    xlsx_bytes = generate_land_report_excel(land, dummy_analysis, details)
    t_xlsx = (time.perf_counter() - t0) * 1000
    print(f"9. Excel Report Generation:  {t_xlsx:.2f} ms -> {len(xlsx_bytes)} bytes")

    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(profile_components())
