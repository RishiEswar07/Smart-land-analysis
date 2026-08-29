# Smart Land Analysis Platform — Backend

AI-Based Decision Support System for Building Planning.
FastAPI + PostgreSQL + SQLAlchemy (async) — see the top-level `README.md`
(one folder up) for the full setup walkthrough covering both backend and frontend.

## Tech Stack

| Layer          | Choice                                   |
|----------------|-------------------------------------------|
| Framework      | FastAPI (async)                          |
| Database       | PostgreSQL                               |
| ORM            | SQLAlchemy 2.0 (async, asyncpg driver)   |
| Migrations     | Alembic (7 migrations)                   |
| Validation     | Pydantic v2 / pydantic-settings          |
| Auth           | JWT (python-jose) + bcrypt password hash |
| PDF            | ReportLab                                |

## What's implemented

**Fully implemented and verified end-to-end (live PostgreSQL + running server test):**
- **Authentication** — register, login (JWT), `/auth/me`, protected-route dependency
- **Land Management** — full CRUD, scoped to the logged-in user, with full
  polygon boundary persistence (`boundary_geojson`, standard GeoJSON Polygon)
- **AI Suitability + Risk Analysis** — `/api/v1/analysis/predict`, `/api/v1/analysis/{id}`.
  A **deterministic, rule-based engine** (not a trained ML model yet) — the
  full formula and weights are documented as comments at the top of
  `app/services/analysis_service.py`.
- **Dashboard** — summary stats, building-type distribution, recent analyses, all per-user
- **PDF Reports** — generate, download (authenticated), list

**Not yet implemented** (intentionally — needs real GIS/hydrology API
integration, not faked with placeholder numbers):
- Nearby Facilities (schools/hospitals/roads) — needs OSM Overpass integration
- Live Flood Risk data — needs Open-Meteo Flood API integration

## Project Structure

```
backend/
├── alembic/                # DB migration scripts (7 migrations, run in order)
│   └── versions/
├── app/
│   ├── core/                # config.py (settings), security.py (JWT + bcrypt hashing)
│   ├── db/                  # engine, session, declarative base
│   ├── models/               # SQLAlchemy ORM models — User, Land, Analysis, Report
│   ├── schemas/               # Pydantic request/response schemas
│   ├── routers/                # auth.py, land.py, analysis.py, dashboard.py, reports.py
│   ├── services/                # Business logic — one file per router
│   ├── dependencies/             # auth.py (get_current_user), pagination.py
│   ├── utils/                     # pdf_generator.py (ReportLab)
│   └── main.py                    # App entrypoint
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
| Analysis | `POST /analysis/predict`, `GET /analysis/{id}` |
| Dashboard | `GET /dashboard/summary`, `GET /dashboard/building-distribution`, `GET /dashboard/recent-analyses` |
| Reports | `POST /reports/{analysis_id}/generate`, `GET /reports/{id}/download`, `GET /reports` |

All endpoints except `/auth/register` and `/auth/login` require a
`Authorization: Bearer <token>` header.

## Roadmap

- [x] Project structure & database configuration
- [x] Land Management (CRUD) + full polygon persistence
- [x] AI Suitability + Risk Analysis (rule-based engine)
- [x] User Authentication (Register / Login / JWT / hashing)
- [x] Dashboard APIs
- [x] PDF Report Generation
- [ ] Nearby Facilities Analysis (live OSM Overpass integration)
- [ ] Flood Risk Analysis (live Open-Meteo Flood API integration)
- [ ] Trained ML model to replace the rule-based engine
