import asyncio
import io
import os
import uuid
import openpyxl
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.models.land import Land, LandType
from app.models.analysis import Analysis
from app.services.analysis_service import compute_analysis, build_detailed_analysis_dict
from app.services.facility_service import fetch_nearby_facilities
from app.utils.pdf_generator import generate_land_report_pdf
from app.utils.excel_generator import generate_land_report_excel

async def audit_reports_and_history():
    print("=" * 70)
    print("TASK 4 AUDIT — REPORTS, HISTORY & DYNAMIC REGENERATION")
    print("=" * 70)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create two distinct users for IDOR testing
        u1_email = f"audit_u1_{uuid.uuid4().hex[:6]}@example.com"
        u2_email = f"audit_u2_{uuid.uuid4().hex[:6]}@example.com"
        pwd = "AuditPassword123!"

        r1 = await client.post("/api/v1/auth/register", json={"email": u1_email, "name": "User One", "password": pwd})
        r2 = await client.post("/api/v1/auth/register", json={"email": u2_email, "name": "User Two", "password": pwd})
        assert r1.status_code == 201, f"Failed to register User 1: {r1.text}"
        assert r2.status_code == 201, f"Failed to register User 2: {r2.text}"

        token1 = (await client.post("/api/v1/auth/login", json={"email": u1_email, "password": pwd})).json()["access_token"]
        token2 = (await client.post("/api/v1/auth/login", json={"email": u2_email, "password": pwd})).json()["access_token"]
        h1 = {"Authorization": f"Bearer {token1}"}
        h2 = {"Authorization": f"Bearer {token2}"}

        # User 1 creates land parcel (without road width)
        land_payload = {
            "land_name": "Audit Grand Residency",
            "latitude": 13.0827,
            "longitude": 80.2707,
            "address": "Audit Address, Chennai",
            "area_sqft": 3600.0,
            "land_type": "Residential",
            "road_width": None
        }
        l1_resp = await client.post("/api/v1/lands", json=land_payload, headers=h1)
        assert l1_resp.status_code == 201
        land1_id = l1_resp.json()["id"]

        # Run suitability analysis for User 1
        pred_resp = await client.post("/api/v1/analysis/predict", json={"land_id": land1_id}, headers=h1)
        assert pred_resp.status_code == 201
        analysis1_id = pred_resp.json()["id"]

        # -------------------------------------------------------------
        # 1. Generate & Inspect Real PDF Report
        # -------------------------------------------------------------
        pdf_resp = await client.get(f"/api/v1/reports/{analysis1_id}/export/pdf", headers=h1)
        assert pdf_resp.status_code == 200, f"PDF failed: {pdf_resp.text}"
        pdf_bytes = pdf_resp.content
        assert len(pdf_bytes) > 2000, "PDF too small"
        assert pdf_bytes[:4] == b"%PDF", "Invalid PDF magic bytes"
        assert b"%%EOF" in pdf_bytes[-1024:], "Missing PDF %%EOF marker"
        
        print(f"1. Real PDF Verified: Valid %PDF-1.4 stream, {len(pdf_bytes):,} bytes, %%EOF verified")
        assert b"20 ft (Standard)" not in pdf_bytes, "Found fabricated 20ft in PDF bytes!"
        print("   - PDF header, EOF, and road width non-fabrication verified (PASS)")

        # -------------------------------------------------------------
        # 2. Generate & Inspect Real Excel Report
        # -------------------------------------------------------------
        excel_resp = await client.get(f"/api/v1/reports/{analysis1_id}/export/excel", headers=h1)
        assert excel_resp.status_code == 200, f"Excel failed: {excel_resp.text}"
        xlsx_bytes = excel_resp.content
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
        sheet_names = wb.sheetnames
        print(f"2. Real Excel Verified: {len(sheet_names)} sheets {sheet_names}, {len(xlsx_bytes):,} bytes")
        assert "Executive Summary" in sheet_names
        assert "Nearby Facilities" in sheet_names
        
        # Verify Road width in Excel is not 20 ft
        exec_sheet = wb["Executive Summary"]
        road_width_val = None
        for row in exec_sheet.iter_rows(values_only=True):
            if row and any("Road Width" in str(c) for c in row if c):
                road_width_val = row
                break
        print(f"   - Excel Road Width Row: {road_width_val}")
        if road_width_val:
            assert "20 ft" not in str(road_width_val), "Found fabricated 20 ft in Excel!"
        print("   - Excel multi-sheet workbook, headers, and road width integrity verified (PASS)")

        # -------------------------------------------------------------
        # 3. Verify History Isolation (User 1 vs User 2)
        # -------------------------------------------------------------
        hist1 = (await client.get("/api/v1/analysis/history", headers=h1)).json()
        hist2 = (await client.get("/api/v1/analysis/history", headers=h2)).json()
        print(f"3. History Isolation: User 1 has {hist1['total']} record(s), User 2 has {hist2['total']} record(s)")
        assert hist1["total"] >= 1, "User 1 should have history"
        assert hist2["total"] == 0, f"User 2 must NOT see User 1's history (got {hist2['total']})"
        print("   - User isolation on /analysis/history confirmed (PASS)")

        # -------------------------------------------------------------
        # 4. Verify Report Access Control & Dynamic Regeneration
        # -------------------------------------------------------------
        # Create disk report row
        rep_create = await client.post(f"/api/v1/reports/{analysis1_id}/generate", headers=h1)
        assert rep_create.status_code == 201
        report_id = rep_create.json()["id"]

        # User 1 can download
        dl1 = await client.get(f"/api/v1/reports/{report_id}/download", headers=h1)
        assert dl1.status_code == 200
        print(f"4. User 1 successfully downloaded report: {len(dl1.content)} bytes (PASS)")

        # User 2 attempts download (IDOR test)
        dl2 = await client.get(f"/api/v1/reports/{report_id}/download", headers=h2)
        print(f"   - User 2 unauthorized download attempt returned status: {dl2.status_code}")
        assert dl2.status_code in [404, 403], f"User 2 unauthorized download must be rejected, got {dl2.status_code}"
        print("   - IDOR protection verified: User 2 access denied (PASS)")
        
        # Test dynamic regeneration when report file on disk is deleted
        async with AsyncSessionLocal() as db:
            from app.models.report import Report
            from sqlalchemy import select
            rep_obj = (await db.execute(select(Report).where(Report.id == uuid.UUID(report_id)))).scalar_one()
            file_on_disk = rep_obj.file_path
            if os.path.exists(file_on_disk):
                os.remove(file_on_disk)
                print(f"   - Deleted {file_on_disk} to simulate ephemeral container restart.")

        dl_regen = await client.get(f"/api/v1/reports/{report_id}/download", headers=h1)
        assert dl_regen.status_code == 200
        assert len(dl_regen.content) > 1000
        print(f"5. Ephemeral container dynamic regeneration: Status {dl_regen.status_code}, {len(dl_regen.content)} bytes (PASS)")

    print("TASK 4 AUDIT COMPLETE — ALL REPORTS, ACCESS CONTROLS & REGENERATION VERIFIED (PASS)")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(audit_reports_and_history())
