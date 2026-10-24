"""
verify_e2e_backend.py
---------------------
End-to-end verification script for Smart Land Analysis Platform backend.
Directly tests the FastAPI app, database persistence, ML prediction,
risk breakdown, PDF generation, Excel generation, and History endpoints.
"""

import asyncio
import os
import sys
import time
import uuid
import httpx
from httpx import ASGITransport

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app

results = {
    "executed": [],
    "passed": [],
    "failed": [],
    "measurements": {}
}

def record_test(name: str, passed: bool, details: str = ""):
    results["executed"].append(name)
    if passed:
        results["passed"].append(name)
        print(f"  [PASS] {name} {details}")
    else:
        results["failed"].append((name, details))
        print(f"  [FAIL] {name}: {details}")

async def main():
    print("=" * 70)
    print("RUNNING END-TO-END BACKEND API & PERFORMANCE VERIFICATION")
    print("=" * 70)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=30.0) as client:
        # ---------------------------------------------------------
        # 1. Health / Root Check
        # ---------------------------------------------------------
        t0 = time.perf_counter()
        health_resp = await client.get("/health")
        t_health = (time.perf_counter() - t0) * 1000
        results["measurements"]["health_check_ms"] = round(t_health, 2)
        record_test("Health Endpoint Check", health_resp.status_code == 200, f"({t_health:.1f}ms)")

        # ---------------------------------------------------------
        # 2. Authentication: Register / Login (Measure Login Time)
        # ---------------------------------------------------------
        test_email = f"verify_{uuid.uuid4().hex[:6]}@example.com"
        test_password = "Password123!"
        reg_resp = await client.post("/api/v1/auth/register", json={
            "name": "Verification User",
            "email": test_email,
            "password": test_password
        })
        record_test("User Registration", reg_resp.status_code in [201, 200], f"status={reg_resp.status_code}")

        t0 = time.perf_counter()
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": test_email,
            "password": test_password
        })
        t_login = (time.perf_counter() - t0) * 1000
        results["measurements"]["login_time_ms"] = round(t_login, 2)

        is_login_ok = login_resp.status_code == 200 and "access_token" in login_resp.json()
        record_test("User Login & JWT Generation", is_login_ok, f"({t_login:.1f}ms)")

        if not is_login_ok:
            print("Aborting remaining tests due to login failure:", login_resp.text)
            return

        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # ---------------------------------------------------------
        # 3. Create Land Parcel without hardcoded road width (road_width=None)
        # ---------------------------------------------------------
        land_payload = {
            "land_name": "E2E Verification Plot (Madurai)",
            "latitude": 9.9252,
            "longitude": 78.1198,
            "address": "Simmakkal, Madurai, Tamil Nadu",
            "area_sqft": 2400.0,
            "area": 2400.0,
            "input_unit": "sq.ft",
            "area_source": "polygon",
            "road_width": None,  # EXPLICITLY NONE to test lack of road width data
            "soil_type": "Red Soil",
            "land_type": "Residential",
            "water_availability": True,
            "electricity_availability": True
        }
        land_resp = await client.post("/api/v1/lands", json=land_payload, headers=headers)
        land_ok = land_resp.status_code == 201 and "id" in land_resp.json()
        record_test("Create Land Parcel", land_ok, f"status={land_resp.status_code}")
        if not land_ok:
            print("Cannot proceed with analysis without land parcel:", land_resp.text)
            return

        land_id = land_resp.json()["id"]

        # Confirm road_width is null in created land
        land_data = land_resp.json()
        no_fake_20_in_db = land_data.get("road_width") is None
        record_test("Database Land road_width is None (No fabricated 20ft)", no_fake_20_in_db)

        # ---------------------------------------------------------
        # 4. Predict Suitability (Measure Analysis Execution Time)
        # ---------------------------------------------------------
        t0 = time.perf_counter()
        predict_resp = await client.post("/api/v1/analysis/predict", json={"land_id": land_id}, headers=headers)
        t_analysis = (time.perf_counter() - t0) * 1000
        results["measurements"]["analysis_api_time_ms"] = round(t_analysis, 2)

        pred_ok = predict_resp.status_code == 201
        record_test("Suitability & Risk Prediction API", pred_ok, f"({t_analysis:.1f}ms)")
        if not pred_ok:
            print("Analysis predict failed:", predict_resp.text)
            return

        analysis_data = predict_resp.json()
        analysis_id = analysis_data["id"]

        # Check probability distribution for Pie Chart
        rb = analysis_data.get("risk_breakdown", {})
        has_btype_dist = "building_suitability_distribution" in rb and isinstance(rb["building_suitability_distribution"], list)
        record_test("Risk Breakdown contains Building Suitability Distribution", has_btype_dist)

        # ---------------------------------------------------------
        # 5. Fetch Detailed Analysis Breakdown
        # ---------------------------------------------------------
        details_resp = await client.get(f"/api/v1/analysis/{analysis_id}/details", headers=headers)
        details_ok = details_resp.status_code == 200
        record_test("Get Detailed Analysis Breakdown", details_ok)

        if details_ok:
            det = details_resp.json()
            prop_road = det.get("property_info", {}).get("road_width_ft")
            no_fake_prop_road = (prop_road is None)
            record_test("Detailed property_info road_width_ft is None (Not 20)", no_fake_prop_road)

            # Check road risk why explanation does NOT say 20ft
            road_why = det.get("risks", {}).get("breakdown", {}).get("accessibility_risk", {}).get("why_reason", "")
            no_20_in_why = "20ft" not in road_why and "20 ft" not in road_why
            record_test("Accessibility Risk explanation does NOT claim 20ft", no_20_in_why, f"why='{road_why[:60]}...'")

            # Check nearby facilities structure
            fac = det.get("nearby_facilities", {})
            fac_ok = "categories" in fac and "all_facilities" in fac
            record_test("Nearby Facilities structure valid", fac_ok)

        # ---------------------------------------------------------
        # 6. PDF Report Generation & Direct Streaming (Measure PDF Time)
        # ---------------------------------------------------------
        t0 = time.perf_counter()
        pdf_resp = await client.get(f"/api/v1/reports/{analysis_id}/export/pdf", headers=headers)
        t_pdf = (time.perf_counter() - t0) * 1000
        results["measurements"]["pdf_generation_time_ms"] = round(t_pdf, 2)

        pdf_bytes = pdf_resp.content
        is_pdf_valid = (
            pdf_resp.status_code == 200
            and pdf_resp.headers.get("content-type") == "application/pdf"
            and pdf_bytes.startswith(b"%PDF-1.")
            and len(pdf_bytes) > 2000
        )
        record_test("Direct Stream PDF Generation", is_pdf_valid, f"({t_pdf:.1f}ms, {len(pdf_bytes)} bytes)")

        # Save actual PDF to local scratch/test file to verify
        pdf_out_path = os.path.join(os.path.dirname(__file__), "test_output.pdf")
        with open(pdf_out_path, "wb") as f:
            f.write(pdf_bytes)
        print(f"  -> Saved real generated PDF to: {pdf_out_path}")

        # ---------------------------------------------------------
        # 7. Excel Report Generation (.xlsx)
        # ---------------------------------------------------------
        t0 = time.perf_counter()
        excel_resp = await client.get(f"/api/v1/reports/{analysis_id}/export/excel", headers=headers)
        t_excel = (time.perf_counter() - t0) * 1000
        results["measurements"]["excel_generation_time_ms"] = round(t_excel, 2)

        excel_bytes = excel_resp.content
        is_excel_valid = (
            excel_resp.status_code == 200
            and "spreadsheetml" in excel_resp.headers.get("content-type", "")
            and excel_bytes.startswith(b"PK\x03\x04")  # Standard ZIP / xlsx magic header
            and len(excel_bytes) > 1000
        )
        record_test("Excel Workbook Report Generation", is_excel_valid, f"({t_excel:.1f}ms, {len(excel_bytes)} bytes)")

        # ---------------------------------------------------------
        # 8. Analysis History Endpoint (/api/v1/analysis/history)
        # ---------------------------------------------------------
        hist_resp = await client.get("/api/v1/analysis/history", headers=headers)
        hist_ok = hist_resp.status_code == 200
        if hist_ok:
            hist_data = hist_resp.json()
            items = hist_data.get("items", [])
            total = hist_data.get("total", 0)
            has_records = total >= 1 and len(items) >= 1
            record_test("Analysis History Endpoint returns user records", has_records, f"total={total}, items={len(items)}")
        else:
            record_test("Analysis History Endpoint", False, f"status={hist_resp.status_code}")

        # ---------------------------------------------------------
        # 9. Ephemeral Filesystem Recovery (Simulate Deleted PDF)
        # ---------------------------------------------------------
        gen_resp = await client.post(f"/api/v1/reports/{analysis_id}/generate", headers=headers)
        if gen_resp.status_code == 201:
            report_id = gen_resp.json()["id"]
            # Fetch report info
            reports_list = (await client.get("/api/v1/reports", headers=headers)).json()
            target_report = next((r for r in reports_list if r["id"] == report_id), None)
            
            # Delete file from disk if present to simulate container restart
            from app.core.config import settings
            expected_disk_path = os.path.join(os.getcwd(), settings.REPORTS_DIR, f"report_{analysis_id}.pdf")
            if os.path.exists(expected_disk_path):
                os.remove(expected_disk_path)
            
            # Now call download - it should dynamically regenerate rather than throw 404!
            dl_resp = await client.get(f"/api/v1/reports/{report_id}/download", headers=headers)
            recovery_ok = dl_resp.status_code == 200 and dl_resp.content.startswith(b"%PDF-1.")
            record_test("Ephemeral Container Missing PDF Dynamic Regeneration", recovery_ok, f"status={dl_resp.status_code}")
        else:
            record_test("Generate Report Record", False, f"status={gen_resp.status_code}")

    print("=" * 70)
    print(f"BACKEND TEST SUMMARY: {len(results['passed'])}/{len(results['executed'])} PASSED")
    if results['failed']:
        print(f"FAILED TESTS ({len(results['failed'])}):")
        for f, reason in results['failed']:
            print(f"  - {f}: {reason}")
    print("MEASURED TIMINGS:")
    for k, v in results["measurements"].items():
        print(f"  - {k}: {v} ms")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(main())
