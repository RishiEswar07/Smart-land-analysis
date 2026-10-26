# Smart Land Analysis Platform — Backend

AI-Based Decision Support System for Building Planning.
FastAPI + PostgreSQL + SQLAlchemy (async) + Scikit-learn + ReportLab + openpyxl — see the top-level `README.md`
for the full setup walkthrough covering both backend and frontend.

## Tech Stack

| Layer             | Choice                                            |
|-------------------|---------------------------------------------------|
| Framework         | FastAPI (Python 3.11+, async)                     |
| Database          | Supabase PostgreSQL                              |
| ORM               | SQLAlchemy 2.0 (async, asyncpg driver)            |
| Migrations        | Alembic                                           |
| Validation        | Pydantic v2 / pydantic-settings                   |
| Scoring & ML      | Rule-based scoring with Scikit-learn Random Forest trained on synthetic data |
| Auth              | python-jose (HS256) + passlib/bcrypt password hashing |
| PDF Generation    | ReportLab                                         |
| Excel Generation  | openpyxl (.xlsx multi-worksheet workbooks)        |
| Geospatial APIs   | OpenStreetMap Overpass, ISRIC SoilGrids, Open-Meteo, ESA WorldCover |

## What's Implemented

- **Authentication & Security** — register, login (JWT), `/auth/me`, protected-route dependencies, and strict per-user resource ownership across all lands, analyses, and reports.
- **Land Management** — CRUD operations strictly scoped to the authenticated user, supporting GeoJSON polygon boundaries or single-point coordinates with direct area input.
- **AI Suitability & Risk Scoring** — Rule-based environmental and infrastructure risk scoring with a machine-learning component trained on synthetic data. Evaluates road access, infrastructure, satellite land-cover, and hydrological flood risk.
- **Geodesic Nearby Facilities** — Live OpenStreetMap Overpass & Nominatim queries computing ellipsoidal straight-line Haversine distances in kilometres (km) across 8 essential categories.
- **Environmental Telemetry & Reliability** — Real-time DEM elevation via Open-Meteo, WRB soil taxonomy via ISRIC SoilGrids, and 10m satellite classification via ESA WorldCover. Missing external telemetry is flagged as "Unavailable" rather than defaulting to fabricated observations.
- **Multi-Format Export Reports** — High-fidelity PDF generation via ReportLab and comprehensive Excel Workbooks via openpyxl.
- **Dashboard APIs** — per-user statistics, building type distribution, and recent analyses.

## Project Structure

```
backend/
├── alembic/                # DB migration scripts
├── app/
│   ├── core/                # config.py (settings), security.py (JWT + bcrypt hashing)
│   ├── db/                  # engine, session, declarative base
│   ├── models/               # SQLAlchemy ORM models — User, Land, Analysis, Report
│   ├── schemas/               # Pydantic request/response schemas
│   ├── routers/                # auth.py, land.py, analysis.py, dashboard.py, reports.py
│   ├── services/                # Business logic — land, analysis, facilities, dashboard
│   ├── dependencies/             # auth.py (get_current_user), pagination.py
│   ├── utils/                     # pdf_generator.py, excel_generator.py, area_units.py
│   └── main.py                    # FastAPI entrypoint
├── data/                   # Baseline training datasets
├── requirements.txt
├── .env.example
└── alembic.ini
```
