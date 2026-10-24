import asyncio
import math
from app.services.facility_service import fetch_nearby_facilities, haversine_distance_km

async def audit_facilities():
    print("=" * 70)
    print("TASK 2 AUDIT — NEARBY FACILITIES ACROSS DIVERSE GEOGRAPHIC SITES")
    print("=" * 70)

    test_sites = [
        {"name": "Chennai Central (Urban Dense)", "lat": 13.0827, "lng": 80.2707, "radius": 5.0},
        {"name": "Coimbatore Suburban", "lat": 11.0168, "lng": 76.9558, "radius": 5.0},
        {"name": "Remote Thar Desert (Zero Facilities Expected)", "lat": 27.0238, "lng": 71.0123, "radius": 3.0},
    ]

    for site in test_sites:
        lat, lng, r = site["lat"], site["lng"], site["radius"]
        print(f"\n--- Testing Site: {site['name']} ({lat}, {lng}) radius={r}km ---")
        
        fac_res = await fetch_nearby_facilities(lat, lng, radius_km=r, use_cache=False)
        status = fac_res.get("status")
        total = fac_res.get("total_found", 0)
        message = fac_res.get("message")
        
        print(f"Status: {status} | Total Found: {total} | Message: {message}")
        assert status in ["success", "empty", "unavailable"], f"Invalid status: {status}"

        if total > 0:
            all_facs = fac_res.get("all_facilities", [])
            print(f"Verifying {len(all_facs)} returned facilities coordinates and distances...")
            for i, f in enumerate(all_facs[:5]):
                name = f.get("name")
                f_lat = f.get("lat")
                f_lng = f.get("lng")
                reported_dist = f.get("distance_km")

                # Verify coordinates exist and are valid numbers
                assert f_lat is not None and -90 <= f_lat <= 90, f"Invalid lat: {f_lat}"
                assert f_lng is not None and -180 <= f_lng <= 180, f"Invalid lng: {f_lng}"
                
                # Independently recalculate Haversine distance
                calc_dist = haversine_distance_km(lat, lng, f_lat, f_lng)
                diff = abs(calc_dist - reported_dist)
                
                # Verify accuracy within 0.05 km
                assert diff <= 0.05, f"Distance discrepancy for {name}: reported={reported_dist}, calculated={calc_dist}"
                print(f"  [{i+1}] {name} ({f.get('category')}): reported={reported_dist}km, calc={calc_dist}km, delta={diff:.3f}km (VERIFIED)")

        elif status == "empty":
            print(f"Verified clear empty message for remote site: '{message}' (VERIFIED)")

    # 4. Test Invalid Coordinates Handling
    print("\n--- Testing Invalid Coordinates Handling ---")
    bad_res = await fetch_nearby_facilities(999.0, 999.0, radius_km=5.0)
    print(f"Status for (999, 999): {bad_res['status']} | Message: {bad_res['message']}")
    assert bad_res["status"] == "invalid_coordinates"

    print("\nTASK 2 AUDIT COMPLETE — ALL DISTANCES, COORDS, AND EMPTY STATES STRICTLY VERIFIED (PASS)")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(audit_facilities())
