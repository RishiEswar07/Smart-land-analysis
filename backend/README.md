# Smart Land Analysis Platform — Backend

AI-Based Decision Support System for Building Planning.
FastAPI + PostgreSQL + SQLAlchemy (async) + Scikit-learn + ReportLab + openpyxl — see the top-level `README.md`
(one folder up) for the full setup walkthrough covering both backend and frontend.

## Tech Stack

| Layer             | Choice                                            |
|-------------------|---------------------------------------------------|
| Framework         | FastAPI (Python 3.11, async)                      |
| Database          | Supabase PostgreSQL                              |
| ORM               | SQLAlchemy 2.0 (async, asyncpg driver)            |
| Migrations        | Alembic (7 migrations)                            |
| Validation        | Pydantic v2 / pydantic-settings                   |
| Machine Learning  | Scikit-learn (Random Forest Classifier & Regressor)|
| Auth              | PyJWT + bcrypt password hashing                  |
| PDF Generation    | ReportLab                                         |
| Excel Generation  | openpyxl (.xlsx multi-worksheet workbooks)        |
| Geospatial APIs   | OpenStreetMap Overpass, ISRIC SoilGrids, Open-Meteo |

## What's Implemented

**Fully implemented and verified end-to-end:**
- **Authentication** — register, login (JWT), `/auth/me`, protected-route dependency.
- **Land Management** — full CRUD, scoped to the logged-in user, with full
  polygon boundary persistence (`boundary_geojson`, standard GeoJSON Polygon) or single-point coordinates with user-specified area.
- **AI Suitability & ML Inference** — Scikit-learn Random Forest model (`model.pkl`, `scaler.pkl`, `label_encoder.pkl`) evaluating soil load-bearing capacity, slope, flood risk, and road width, combined with deterministic building plot size constraints.
- **Geodesic Nearby Facilities** — Live OpenStreetMap Overpass geospatial queries computing ellipsoidal Haversine distances in kilometres (km) across 8 mandatory categories (Bus Stands, Railway Stations, Airports, Hospitals, Schools/Colleges, Shopping/Commercial, Main Roads, Water Bodies).
- **Flood Risk & Soil Taxonomy** — Hydrological exposure analysis via Open-Meteo and WRB soil classification via ISRIC SoilGrids.
- **Multi-Format Export Reports** — High-fidelity PDF generation via ReportLab and comprehensive Excel Workbooks via openpyxl (featuring land metrics, suitability scores, and an itemized Nearby Facilities worksheet with km distances).
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
├── model/                  # Scikit-learn trained models (model.pkl, scaler.pkl, etc.)
├── requirements.txt
├── .env.example
└── alembic.ini
```

## Local Setup

See the top-level `README.md` for the full step-by-step. Quick reference:

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then edit DB credentials + JWT_SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload
```

- Swagger UI: http://localhost:8000/api/v1/docs
- Health check: http://localhost:8000/api/v1/health

## API Overview

| Module | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Land | `POST /lands`, `GET /lands`, `GET /lands/{id}`, `PUT /lands/{id}`, `DELETE /lands/{id}` |
| Facilities | `GET /lands/{id}/facilities`, `GET /lands/nearby-facilities/search` |
| Analysis | `POST /analysis/predict`, `GET /analysis/{id}`, `GET /analysis/{id}/detailed` |
| Dashboard | `GET /dashboard/summary`, `GET /dashboard/building-distribution`, `GET /dashboard/recent-analyses` |
| Reports | `POST /reports/{analysis_id}/generate`, `GET /reports/{analysis_id}/pdf`, `GET /reports/{analysis_id}/excel` |

All endpoints except `/auth/register`, `/auth/login`, and `/api/v1/health` require an `Authorization: Bearer <token>` header.
