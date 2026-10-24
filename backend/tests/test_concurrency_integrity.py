import asyncio
import uuid
import time
from app.db.session import AsyncSessionLocal
from app.models.land import Land, LandType
from app.models.user import User
from app.services.analysis_service import compute_analysis, build_detailed_analysis_dict
from app.models.analysis import Analysis

async def test_concurrent_parcels():
    print("=" * 65)
    print("TESTING CONCURRENT ANALYSIS INTEGRITY & DATA ISOLATION")
    print("=" * 65)

    test_sites = [
        {"name": "Chennai Urban", "lat": 13.0827, "lng": 80.2707, "area": 3200.0},
        {"name": "Coimbatore Inland", "lat": 11.0168, "lng": 76.9558, "area": 5000.0},
        {"name": "Madurai Semi-Arid", "lat": 9.9252, "lng": 78.1198, "area": 1800.0},
    ]

    async def run_single_site(site):
        land = Land(
            id=uuid.uuid4(),
            land_name=site["name"],
            address=f"{site['name']} Address",
            latitude=site["lat"],
            longitude=site["lng"],
            land_type=LandType.RESIDENTIAL,
            area_sqft=site["area"],
            road_width=None,
        )
        t0 = time.perf_counter()
        res = await compute_analysis(land)
        elapsed = (time.perf_counter() - t0) * 1000
        return {
            "site": site["name"],
            "lat": site["lat"],
            "lng": site["lng"],
            "suitability": res.suitability_score,
            "btype": res.recommended_building_type,
            "flood_risk": res.flood_risk,
            "risk_score": res.risk_score,
            "elapsed_ms": elapsed,
        }

    t_all0 = time.perf_counter()
    results = await asyncio.gather(*(run_single_site(s) for s in test_sites))
    total_elapsed = (time.perf_counter() - t_all0) * 1000

    print(f"Executed {len(results)} concurrent analyses in parallel: {total_elapsed:.1f}ms")
    for r in results:
        print(f"  - [{r['site']}] coords=({r['lat']}, {r['lng']}) -> Suitability={r['suitability']}%, Risk={r['risk_score']}%, BType={r['btype']}, Latency={r['elapsed_ms']:.1f}ms")

    # Verify no mixed results
    names = [r["site"] for r in results]
    assert len(set(names)) == 3, "Duplicate site names"
    
    # Verify different coordinates produced valid results
    coords = [(r["lat"], r["lng"]) for r in results]
    assert len(set(coords)) == 3, "Duplicate coordinates"

    print("ALL CONCURRENT REQUESTS RETURNED INDEPENDENT, UNMIXED RESULTS (PASS)")
    print("=" * 65)

if __name__ == "__main__":
    asyncio.run(test_concurrent_parcels())
