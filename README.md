# Smart Land Analysis Platform

**AI-Based Decision Support System for Building Planning** — Final Year Project

Register, log in, draw a plot boundary on a satellite map, and get an
AI-based suitability score, a recommended building type, and an
explainable, multi-factor Risk Score — with a downloadable PDF report and
a personal dashboard of every land you've analyzed.

```
Smart-Land-Analysis-Platform/
├── backend/     — FastAPI + PostgreSQL API
├── frontend/    — React (Vite) web app
└── README.md    — you are here
```

---

## 1. What's working right now

| Feature | Status |
|---|---|
| Register / Login (JWT) | ✅ Working, verified end-to-end |
| Protected routes (Land Analysis, Dashboard, Reports redirect to Login if signed out) | ✅ Working |
| Draw land boundary on satellite map (unlimited polygon points) | ✅ Working |
| Place-name search (Madurai, KLN College, etc.) | ✅ Working |
| Auto-capture area, latitude/longitude, address (reverse geocoding) | ✅ Working |
| **Full polygon boundary persisted in the database** (not just centroid) | ✅ Working |
| Land Management CRUD (scoped to the logged-in user) | ✅ Working |
| AI Suitability score + recommended building type | ✅ Working (rule-based engine — see below) |
| Risk Score (dynamic, explainable, weighted breakdown) | ✅ Working (rule-based engine) |
| Dashboard (summary stats, charts, recent analyses — per user) | ✅ Working, connected to real backend |
| PDF report — Generate & Download | ✅ Working, verified — real PDF with all required fields |
| Live nearby-facilities / flood-risk data | ⏳ Not implemented — needs real GIS API integration (Overpass, Open-Meteo), intentionally not faked |

**On the AI/Risk engine:** both the suitability score and the Risk Score are
computed by a **deterministic, rule-based formula** — documented in full
(weights and all) as comments at the top of
`backend/app/services/analysis_service.py`. It is not a trained ML model
yet. Given the same land, it always returns the same score; different
lands produce genuinely different scores (verified: two contrasting test
lands scored 26.6% Low risk and 77.8% High risk in the same test run).

---

## 2. Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- PostgreSQL 14+ (running locally, or a connection string to a hosted instance)

---

## 3. Backend setup (`backend/`)

```bash
cd backend
```

### 3.1 Create and activate a virtual environment
```bash
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

### 3.2 Install backend requirements
```bash
pip install -r requirements.txt
```

### 3.3 Create the PostgreSQL database
```sql
CREATE DATABASE smart_land_db;
CREATE USER sla_user WITH PASSWORD 'sla_password';
GRANT ALL PRIVILEGES ON DATABASE smart_land_db TO sla_user;
```
If you're on PostgreSQL 15+, also run (as a superuser, connected to `smart_land_db`):
```sql
GRANT ALL ON SCHEMA public TO sla_user;
```

### 3.4 Configure environment variables
```bash
cp .env.example .env
```
Then edit `.env`:

| Variable | Required? | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Async connection string (asyncpg driver) |
| `DATABASE_URL_SYNC` | Yes | Sync connection string (psycopg2, used only by Alembic) |
| `JWT_SECRET_KEY` | Yes | Set to a long random string — e.g. `openssl rand -hex 32` |
| `BACKEND_CORS_ORIGINS` | Yes | Must include `http://localhost:5173` for the frontend dev server |
| `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` | No | Sensible defaults already set — used by the now-working Auth module |
| `APP_ENV`, `DEBUG`, `API_V1_PREFIX` | No | Sensible defaults already set |
| `REPORTS_DIR` | No | Folder where generated PDFs are saved (created automatically) |

### 3.5 Run database migrations
```bash
alembic upgrade head
```
This applies all **7 migrations** in order — creates `lands`, adds
water/electricity columns, creates `analyses`, adds risk score fields,
creates `users`, adds `user_id` + `boundary_geojson` to `lands`, and
creates `reports`. Verified against a fresh database before packaging.

### 3.6 Start the backend
```bash
uvicorn app.main:app --reload
```
- API base: `http://localhost:8000/api/v1`
- Swagger docs: `http://localhost:8000/api/v1/docs`
- Health check: `http://localhost:8000/api/v1/health`

---

## 4. Frontend setup (`frontend/`)

Open a **second terminal** (keep the backend running in the first one):

```bash
cd frontend
```

### 4.1 Install frontend packages
```bash
npm install
```

### 4.2 Configure environment variables
```bash
cp .env.example .env
```

| Variable | Required? | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | Must match the backend's address + API prefix — defaults to `http://127.0.0.1:8000/api/v1`, matching step 3.6 above |

### 4.3 Start the frontend
```bash
npm run dev
```
Opens at `http://localhost:5173`.

---

## 5. Using the app

1. Go to `http://localhost:5173` → **Sign up** (or **Log in** if you already have an account)
2. Go to **Land Analysis** (you'll be redirected here automatically after signing up)
3. Search a place (e.g. "Madurai") or scroll the satellite map to your area
4. Click the polygon tool (top-right of the map) and click each corner of
   the plot — click the first point again to close the shape (any number
   of points, no limit)
5. Area, coordinates, and address are captured automatically — click **Continue**
6. Fill in land name, road width, soil type, land use type, and
   water/electricity availability → **Analyze Land**
7. View the suitability score, risk score, itemized risk breakdown, and AI explanation
8. Click **Generate & Download PDF** to get a full report
9. Check **Dashboard** for your stats, charts, and history; **Reports** to re-download any past PDF

---

## 6. Verification actually performed before packaging

This was tested against a **real PostgreSQL database and a running server**, not just read through:

- ✅ All backend Python files compile; `pip install -r requirements.txt` succeeds cleanly
- ✅ FastAPI app imports successfully; all 15 routes register correctly
- ✅ **All 7 Alembic migrations applied cleanly to a fresh database**, in the correct order
- ✅ Registration, login (correct + wrong password), and protected-route rejection without a token — tested via live HTTP requests, all returned correct status codes
- ✅ Created a land with a 7-vertex polygon boundary and confirmed the full `boundary_geojson` round-tripped through the database intact
- ✅ Ran analysis on two deliberately different lands — confirmed genuinely different risk scores (26.6% vs 77.8%), and confirmed the same land re-analyzed produces the identical score (deterministic)
- ✅ Dashboard summary/building-distribution/recent-analyses endpoints tested live, returning correct per-user data
- ✅ Generated a real PDF, downloaded it, and **extracted its text to confirm** every required field is actually present (address, coordinates, area, boundary vertex count, suitability score, recommended building, risk score, full risk breakdown, AI explanation summary)
- ✅ Registered a second user and confirmed they see **zero** of the first user's data (data isolation)
- ✅ Fixed a real CORS bug found during testing: `Content-Disposition` wasn't exposed cross-origin, which would have broken the frontend's PDF filename detection — fixed and re-verified
- ✅ Fixed a real auth bug found during implementation: the original plan to open the PDF via a plain link/`window.open()` can't send a JWT header, so protected downloads would have 401'd — fixed with an authenticated blob download instead
- ✅ `npm install` and `npm run build` succeed; confirmed via the production bundle that all new auth/dashboard/report endpoint calls are correctly wired

---

## 7. Known limitations (by design, not oversights)

- Risk/suitability scoring uses **soil type + road width + utility availability only** — real elevation, live nearby-infrastructure distances, and live traffic data are not yet integrated (would require GIS API modules not built yet), and were deliberately not faked with placeholder numbers.
- The PDF report lists the boundary as coordinates/vertex count, not a rendered map image (no map-tile-to-image service is wired up).
- User roles exist in the data model (`role` column) but no role-based access control is built on top yet — every logged-in user has the same permissions today.

## 8. Roadmap

- [ ] Nearby Facilities (live OpenStreetMap Overpass API integration)
- [ ] Flood Risk (live Open-Meteo Flood API integration)
- [ ] Trained ML model to replace the current rule-based scoring engine
- [ ] Render the polygon boundary as a static map image in the PDF report
- [ ] Role-based access control (admin / civil engineer / customer views)
