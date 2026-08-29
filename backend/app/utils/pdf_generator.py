"""
utils/pdf_generator.py
------------------------
Builds the land analysis PDF report using ReportLab.

DATA HONESTY NOTE: this report only includes data the platform actually
has and actually computed — land details entered/auto-captured by the
user, the polygon boundary if one was drawn, and the rule-based
suitability/risk engine's real output. It does not include a rendered
map image (no map-tile-to-image service is wired up) or any live
traffic/elevation data the platform doesn't actually have — the
boundary is listed as coordinates and vertex count instead of a picture,
and the report explicitly says "rule-based" for the scoring so no one
mistakes it for a trained ML model's output.
"""

from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models.analysis import Analysis
from app.models.land import Land

_BRAND_BLUE = colors.HexColor("#2563EB")
_BRAND_GREEN = colors.HexColor("#16A34A")
_INK = colors.HexColor("#0B1B2B")
_SLATE = colors.HexColor("#64748B")
_LINE = colors.HexColor("#E2E8F0")

_BRAND_GREEN_HEX = "#16A34A"
_RISK_HEX = {"Low": "#16A34A", "Moderate": "#D97706", "High": "#DC2626"}


def _risk_color_hex(level: str) -> str:
    return _RISK_HEX.get(level, "#64748B")


def generate_land_report_pdf(land: Land, analysis: Analysis) -> bytes:
    """Renders a complete land analysis report PDF and returns it as bytes."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        title=f"Land Analysis Report - {land.land_name}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleBrand", parent=styles["Title"], textColor=_INK, fontSize=20, spaceAfter=2)
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"], textColor=_SLATE, fontSize=10)
    section_style = ParagraphStyle("Section", parent=styles["Heading2"], textColor=_INK, fontSize=13, spaceBefore=16, spaceAfter=8)
    label_style = ParagraphStyle("Label", parent=styles["Normal"], textColor=_SLATE, fontSize=9)
    value_style = ParagraphStyle("Value", parent=styles["Normal"], textColor=_INK, fontSize=11)
    body_style = ParagraphStyle("Body", parent=styles["Normal"], textColor=_INK, fontSize=10, leading=15)
    disclaimer_style = ParagraphStyle("Disclaimer", parent=styles["Normal"], textColor=_SLATE, fontSize=8, leading=12)

    story = []

    # ---------------- Header ----------------
    story.append(Paragraph("Smart Land Analysis Platform", title_style))
    story.append(Paragraph("AI-Based Decision Support System for Building Planning — Analysis Report", subtitle_style))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", color=_LINE, thickness=1))
    story.append(Spacer(1, 10))

    # ---------------- Land Details ----------------
    story.append(Paragraph("Land Details", section_style))
    land_rows = [
        [Paragraph("Land name", label_style), Paragraph(land.land_name, value_style)],
        [Paragraph("Address", label_style), Paragraph(land.address, value_style)],
        [Paragraph("Latitude / Longitude", label_style), Paragraph(f"{land.latitude:.6f}, {land.longitude:.6f}", value_style)],
        [Paragraph("Land area", label_style), Paragraph(f"{land.area_sqft:,.0f} sq.ft", value_style)],
        [Paragraph("Road width", label_style), Paragraph(f"{land.road_width:.0f} ft", value_style)],
        [Paragraph("Soil type", label_style), Paragraph(land.soil_type.value, value_style)],
        [Paragraph("Land use zone", label_style), Paragraph(land.land_type.value, value_style)],
        [Paragraph("Water availability", label_style), Paragraph("Available" if land.water_availability else "Not available", value_style)],
        [Paragraph("Electricity availability", label_style), Paragraph("Available" if land.electricity_availability else "Not available", value_style)],
    ]

    if land.boundary_geojson and land.boundary_geojson.get("coordinates"):
        vertex_count = len(land.boundary_geojson["coordinates"][0])
        land_rows.append(
            [Paragraph("Boundary", label_style), Paragraph(f"Polygon boundary captured ({vertex_count} vertices)", value_style)]
        )
    else:
        land_rows.append([Paragraph("Boundary", label_style), Paragraph("Not available for this land", value_style)])

    land_table = Table(land_rows, colWidths=[5 * cm, 11 * cm])
    land_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, _LINE),
            ]
        )
    )
    story.append(land_table)

    # ---------------- Suitability & Recommendation ----------------
    story.append(Paragraph("Suitability & Recommendation", section_style))
    score_table = Table(
        [
            [
                Paragraph("Suitability Score", label_style),
                Paragraph("Recommended Building Type", label_style),
                Paragraph("Risk Score", label_style),
                Paragraph("Risk Level", label_style),
            ],
            [
                Paragraph(f"<font size=16 color='{_BRAND_GREEN_HEX}'><b>{analysis.suitability_score:.1f}%</b></font>", value_style),
                Paragraph(f"<b>{analysis.recommended_building_type}</b>", value_style),
                Paragraph(f"<font size=16 color='{_risk_color_hex(analysis.risk_level)}'><b>{analysis.risk_score:.1f}%</b></font>", value_style),
                Paragraph(f"<b>{analysis.risk_level}</b>", value_style),
            ],
        ],
        colWidths=[4 * cm, 5 * cm, 3.5 * cm, 3.5 * cm],
    )
    score_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F5F8FC")),
                ("BOX", (0, 0), (-1, -1), 0.5, _LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, _LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(score_table)

    # ---------------- Risk Breakdown ----------------
    story.append(Paragraph("Risk Breakdown", section_style))
    breakdown_header = [
        Paragraph("Factor", label_style),
        Paragraph("Score (0-100, higher = riskier)", label_style),
        Paragraph("Weight", label_style),
    ]
    breakdown_rows = [breakdown_header]
    for factor in (analysis.risk_breakdown or {}).values():
        breakdown_rows.append(
            [
                Paragraph(factor["label"], value_style),
                Paragraph(f"{factor['score']:.1f}%", value_style),
                Paragraph(f"{round(factor['weight'] * 100)}%", value_style),
            ]
        )
    breakdown_table = Table(breakdown_rows, colWidths=[7 * cm, 6 * cm, 3 * cm])
    breakdown_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F5F8FC")),
                ("BOX", (0, 0), (-1, -1), 0.5, _LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, _LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(breakdown_table)

    # ---------------- Flood / Environmental labels ----------------
    story.append(Spacer(1, 8))
    labels_table = Table(
        [
            [Paragraph("Flood Risk", label_style), Paragraph("Environmental Risk", label_style)],
            [Paragraph(f"<b>{analysis.flood_risk}</b>", value_style), Paragraph(f"<b>{analysis.environmental_risk}</b>", value_style)],
        ],
        colWidths=[8 * cm, 8 * cm],
    )
    story.append(labels_table)

    # ---------------- AI Explanation ----------------
    story.append(Paragraph("Analysis Summary", section_style))
    story.append(Paragraph(analysis.ai_explanation, body_style))

    # ---------------- Footer / disclaimer ----------------
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", color=_LINE, thickness=1))
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "Suitability and risk scores are generated by a deterministic, rule-based scoring "
            "engine using the land attributes above (soil type, road width, utility availability). "
            "This is not yet a trained machine-learning model, and does not incorporate live "
            "elevation, traffic, or hydrology data. This report is a decision-support aid, not a "
            "substitute for a licensed civil engineer's site survey.",
            disclaimer_style,
        )
    )
    story.append(
        Paragraph(f"Generated on {datetime.now().strftime('%d %B %Y, %H:%M')}", disclaimer_style)
    )

    doc.build(story)
    return buffer.getvalue()
