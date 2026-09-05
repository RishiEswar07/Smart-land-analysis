"""
utils/excel_generator.py
-------------------------
Generates structured, professional multi-sheet Excel (.xlsx) workbooks
for land analysis reports using openpyxl.
Contains actual property details, factor scores, risks, data quality,
data sources provenance, and regulatory disclaimers.
"""

from io import BytesIO
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

from app.models.land import Land
from app.models.analysis import Analysis


def generate_land_report_excel(land: Land, analysis: Analysis, details: dict) -> bytes:
    wb = openpyxl.Workbook()
    
    navy_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")
    blue_header_fill = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    light_blue_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")
    light_gray_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    accent_green_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    
    title_font = Font(name="Calibri", size=16, bold=True, color="FFFFFF")
    section_font = Font(name="Calibri", size=12, bold=True, color="1E3A8A")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    bold_font = Font(name="Calibri", size=11, bold=True, color="0F172A")
    regular_font = Font(name="Calibri", size=11, color="334155")
    small_gray_font = Font(name="Calibri", size=9, italic=True, color="64748B")
    
    thin_border_side = Side(border_style="thin", color="CBD5E1")
    border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)

    # 1. Executive Summary
    ws_summary = wb.active
    ws_summary.title = "Executive Summary"
    ws_summary.views.sheetView[0].showGridLines = True

    ws_summary.merge_cells("A1:F2")
    ws_summary["A1"] = "SMART LAND ANALYSIS PLATFORM — DECISION SUPPORT REPORT"
    ws_summary["A1"].font = title_font
    ws_summary["A1"].fill = navy_fill
    ws_summary["A1"].alignment = Alignment(horizontal="center", vertical="center")

    ws_summary["A4"] = "1. Property Overview"
    ws_summary["A4"].font = section_font

    prop_rows = [
        ("Land Name / Identifier", land.land_name or "Selected Parcel"),
        ("Address / Locality", land.address or "Unknown Address"),
        ("Geographic Coordinates", f"{land.latitude:.6f}, {land.longitude:.6f}"),
        ("Parcel Area", f"{land.area_sqft:,.0f} sq.ft"),
        ("Road Access Width", f"{land.road_width:.0f} ft" if land.road_width else "20 ft"),
        ("Soil Taxonomy", land.soil_type.value if land.soil_type else "Loamy"),
        ("Zoning / Land Type", land.land_type.value if land.land_type else "Residential"),
        ("Water Utility Status", "Available" if land.water_availability else "Not Available"),
        ("Electricity Utility Status", "Available" if land.electricity_availability else "Not Available"),
    ]

    for idx, (label, val) in enumerate(prop_rows, start=5):
        ws_summary[f"A{idx}"] = label
        ws_summary[f"A{idx}"].font = bold_font
        ws_summary[f"A{idx}"].fill = light_gray_fill
        ws_summary[f"A{idx}"].border = border
        
        ws_summary.merge_cells(f"B{idx}:F{idx}")
        ws_summary[f"B{idx}"] = val
        ws_summary[f"B{idx}"].font = regular_font
        ws_summary[f"B{idx}"].border = border

    start_r = len(prop_rows) + 6
    ws_summary[f"A{start_r}"] = "2. AI Suitability & Risk Assessment"
    ws_summary[f"A{start_r}"].font = section_font

    suitability_metrics = [
        ("Overall Suitability Score", f"{analysis.suitability_score:.1f}%", "Out of 100% (Higher = More Suitable)"),
        ("Recommended Building Type", analysis.recommended_building_type, "Optimal developmental footprint"),
        ("Aggregated Risk Score", f"{analysis.risk_score:.1f}%", "Composite risk across 4 key dimensions"),
        ("Overall Risk Level", analysis.risk_level, "Banded Risk Classification (Low/Moderate/High)"),
        ("Flood Risk Exposure", analysis.flood_risk, "Hydrological elevation & discharge assessment"),
        ("Environmental Risk", analysis.environmental_risk, "Satellite land cover & ecological sensitivity"),
        ("Infrastructure Score", f"{analysis.infrastructure_score:.1f}%", "Utility grid proximity index"),
        ("Accessibility Score", f"{analysis.traffic_accessibility_score:.1f}%", "Corridor width & highway accessibility"),
    ]

    for idx, (metric, val, note) in enumerate(suitability_metrics, start=start_r + 1):
        ws_summary[f"A{idx}"] = metric
        ws_summary[f"A{idx}"].font = bold_font
        ws_summary[f"A{idx}"].fill = light_blue_fill
        ws_summary[f"A{idx}"].border = border

        ws_summary[f"B{idx}"] = val
        ws_summary[f"B{idx}"].font = bold_font
        ws_summary[f"B{idx}"].alignment = Alignment(horizontal="center")
        ws_summary[f"B{idx}"].border = border

        ws_summary.merge_cells(f"C{idx}:F{idx}")
        ws_summary[f"C{idx}"] = note
        ws_summary[f"C{idx}"].font = regular_font
        ws_summary[f"C{idx}"].border = border

    expl_r = start_r + len(suitability_metrics) + 2
    ws_summary[f"A{expl_r}"] = "3. Analysis Explanation & Reasoning"
    ws_summary[f"A{expl_r}"].font = section_font

    ws_summary.merge_cells(f"A{expl_r+1}:F{expl_r+3}")
    ws_summary[f"A{expl_r+1}"] = analysis.ai_explanation
    ws_summary[f"A{expl_r+1}"].font = regular_font
    ws_summary[f"A{expl_r+1}"].alignment = Alignment(wrap_text=True, vertical="top")

    # 2. Factor Breakdown
    ws_factors = wb.create_sheet(title="Factor Breakdown")
    ws_factors.views.sheetView[0].showGridLines = True

    ws_factors.merge_cells("A1:E2")
    ws_factors["A1"] = "DETAILED FACTOR SCORE BREAKDOWN & IMPACT ASSESSMENT"
    ws_factors["A1"].font = title_font
    ws_factors["A1"].fill = blue_header_fill
    ws_factors["A1"].alignment = Alignment(horizontal="center", vertical="center")

    headers_factors = ["Factor Name", "Score (0-100)", "Impact", "Weight in Risk", "Assessment Basis / Methodology"]
    for c_idx, h_text in enumerate(headers_factors, start=1):
        cell = ws_factors.cell(row=4, column=c_idx, value=h_text)
        cell.font = header_font
        cell.fill = navy_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    factors = details.get("factors", [])
    for r_idx, f in enumerate(factors, start=5):
        c1 = ws_factors.cell(row=r_idx, column=1, value=f["name"])
        c1.font = bold_font
        c1.border = border
        
        c2 = ws_factors.cell(row=r_idx, column=2, value=f"{f['score']:.1f}" if f["score"] is not None else "N/A")
        c2.font = bold_font
        c2.alignment = Alignment(horizontal="center")
        c2.border = border

        c3 = ws_factors.cell(row=r_idx, column=3, value=f["impact"])
        c3.font = bold_font
        c3.alignment = Alignment(horizontal="center")
        c3.border = border
        if f["impact"] == "Positive":
            c3.fill = accent_green_fill
        elif f["impact"] == "Moderate":
            c3.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
        elif f["impact"] == "Negative":
            c3.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")

        weight_str = f"{round(f['weight'] * 100)}%" if f.get("weight") is not None else "N/A"
        c4 = ws_factors.cell(row=r_idx, column=4, value=weight_str)
        c4.alignment = Alignment(horizontal="center")
        c4.font = regular_font
        c4.border = border

        c5 = ws_factors.cell(row=r_idx, column=5, value=f.get("description", ""))
        c5.font = regular_font
        c5.border = border

    # 3. Data Quality
    ws_quality = wb.create_sheet(title="Data Quality")
    ws_quality.views.sheetView[0].showGridLines = True

    ws_quality.merge_cells("A1:D2")
    ws_quality["A1"] = f"SCIENTIFIC DATA QUALITY & COMPLETENESS ({details['data_quality']['overall_confidence_pct']}% Overall)"
    ws_quality["A1"].font = title_font
    ws_quality["A1"].fill = navy_fill
    ws_quality["A1"].alignment = Alignment(horizontal="center", vertical="center")

    headers_quality = ["Data Category", "Completeness / Confidence", "Status", "Technical Basis & Source Quality"]
    for c_idx, h_text in enumerate(headers_quality, start=1):
        cell = ws_quality.cell(row=4, column=c_idx, value=h_text)
        cell.font = header_font
        cell.fill = blue_header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    quality_items = details.get("data_quality", {}).get("items", [])
    for r_idx, q in enumerate(quality_items, start=5):
        c1 = ws_quality.cell(row=r_idx, column=1, value=q["category"])
        c1.font = bold_font
        c1.border = border

        c2 = ws_quality.cell(row=r_idx, column=2, value=f"{q['completeness_pct']:.0f}%")
        c2.font = bold_font
        c2.alignment = Alignment(horizontal="center")
        c2.border = border
        if q["completeness_pct"] >= 90:
            c2.fill = accent_green_fill

        c3 = ws_quality.cell(row=r_idx, column=3, value=q["status"])
        c3.font = regular_font
        c3.border = border

        c4 = ws_quality.cell(row=r_idx, column=4, value=q["basis"])
        c4.font = regular_font
        c4.border = border

    # 4. Data Sources & Provenance
    ws_provenance = wb.create_sheet(title="Data Sources & Provenance")
    ws_provenance.views.sheetView[0].showGridLines = True

    ws_provenance.merge_cells("A1:F2")
    ws_provenance["A1"] = "GIS DATA SOURCES, PROVENANCE & TECHNICAL METADATA"
    ws_provenance["A1"].font = title_font
    ws_provenance["A1"].fill = blue_header_fill
    ws_provenance["A1"].alignment = Alignment(horizontal="center", vertical="center")

    headers_prov = ["Dataset Name", "Authoritative Source", "Dataset Date", "Spatial Resolution", "Processing Method", "Sync Frequency"]
    for c_idx, h_text in enumerate(headers_prov, start=1):
        cell = ws_provenance.cell(row=4, column=c_idx, value=h_text)
        cell.font = header_font
        cell.fill = navy_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    sources = details.get("data_sources", [])
    for r_idx, s in enumerate(sources, start=5):
        ws_provenance.cell(row=r_idx, column=1, value=s["dataset_name"]).font = bold_font
        ws_provenance.cell(row=r_idx, column=2, value=s["source"]).font = regular_font
        ws_provenance.cell(row=r_idx, column=3, value=s["data_date"]).font = regular_font
        ws_provenance.cell(row=r_idx, column=4, value=s["resolution"]).font = regular_font
        ws_provenance.cell(row=r_idx, column=5, value=s["processing_method"]).font = regular_font
        ws_provenance.cell(row=r_idx, column=6, value=s["last_updated"]).font = regular_font

        for col in range(1, 7):
            ws_provenance.cell(row=r_idx, column=col).border = border

    # 5. Regulatory Notice
    ws_disc = wb.create_sheet(title="Regulatory Notice")
    ws_disc.views.sheetView[0].showGridLines = True

    ws_disc.merge_cells("A1:E2")
    ws_disc["A1"] = "REGULATORY DISCLAIMER & TECHNICAL CONDITIONS"
    ws_disc["A1"].font = title_font
    ws_disc["A1"].fill = PatternFill(start_color="475569", end_color="475569", fill_type="solid")
    ws_disc["A1"].alignment = Alignment(horizontal="center", vertical="center")

    ws_disc.merge_cells("A4:E7")
    ws_disc["A4"] = (
        "OFFICIAL DISCLAIMER:\n\n"
        "This analysis is a GIS-based decision-support assessment. It does not constitute "
        "government approval, legal clearance, land-title verification, environmental clearance, "
        "or structural engineering certification. Site boundaries, road widths, and flood projections "
        "are synthesized from publicly available geospatial records and statistical machine learning "
        "models. A licensed civil engineer or registered surveyor must inspect the physical parcel "
        "prior to property acquisition, excavation, or capital expenditure."
    )
    ws_disc["A4"].font = regular_font
    ws_disc["A4"].alignment = Alignment(wrap_text=True, vertical="top")

    ws_disc["A9"] = f"Report Generated: {datetime.now().strftime('%d %B %Y, %H:%M UTC')}"
    ws_disc["A9"].font = small_gray_font

    # Auto-fit column widths
    for sheet in wb.worksheets:
        for col in sheet.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            sheet.column_dimensions[col_letter].width = max(max_len + 3, 15)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
