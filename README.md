# Smart Land Analysis Platform

**Decision Support System for Land Feasibility & Building Planning** — Final Year Engineering Project

Register, log in, draw a plot boundary or enter direct area measurements on a satellite map, and get suitability scoring, recommended building types, and explainable multi-factor Risk Scores — enriched with live OpenStreetMap geospatial infrastructure, ISRIC SoilGrids taxonomy, ESA WorldCover satellite imagery, and downloadable PDF & Excel reports.

```
Smart-Land-Analysis-Platform/
├── backend/     — FastAPI (Python) + Supabase PostgreSQL + Scikit-Learn
├── frontend/    — React 18 (Vite) + MapLibre GL + Turf.js + Tailwind CSS
└── README.md    — Project documentation & setup guide
```

---

## 1. Technology Stack

| Layer | Technology | Role & Purpose |
|---|---|---|
| **Frontend Framework** | React 18, Vite | Component-driven UI, state management, fast client builds |
| **Geospatial Mapping** | MapLibre GL, Turf.js | Satellite basemaps, polygon vector drawing, geodesic ellipsoidal area math |
| **Styling & Visualization** | Tailwind CSS, Recharts | Responsive layout, metric gauges, building distribution charts |
| **Backend Framework** | FastAPI (Python) | High-performance asynchronous REST API with Pydantic validation |
| **Database & ORM** | Supabase PostgreSQL, SQLAlchemy 2.0 | Async connection pool, schema migrations (Alembic), GeoJSON boundary storage |
| **Scoring & Machine Learning** | Rule-Based Scoring + Scikit-Learn (Random Forest) | Rule-based environmental and infrastructure risk scoring with a machine-learning component trained on synthetic data |
| **Authentication** | python-jose[cryptography], passlib[bcrypt] | Cryptographically signed JWT tokens (HS256) and salted bcrypt password hashing |
| **Export Reporting** | ReportLab, openpyxl | Programmatic PDF document generation & multi-worksheet Excel workbooks (.xlsx) |
| **External Geospatial APIs** | OpenStreetMap Overpass & Nominatim | Live queries for 8 essential nearby facility categories with geodesic Haversine km distances |
| **Environmental Telemetry** | ISRIC SoilGrids, Open-Meteo, ESA WorldCover | WRB soil classification, Copernicus DEM elevation, and 10m satellite land cover |

---

## 2. Implemented Features & Modules

| Feature | Implementation Details | Status |
|---|---|---|
| **Authentication & Ownership Isolation** | JWT token authentication, bcrypt password hashing, strict ownership enforcement across lands, analyses, and reports | ✅ Verified |
| **Accurate Land Delineation** | True geodesic polygon area calculation via Turf.js + Direct Area User Input (sq.ft, m², cents, acres) | ✅ Verified |
| **Environmental Reliability** | Real telemetry from Copernicus DEM and ESA WorldCover; missing measurements marked as unavailable rather than assigned fake low risks | ✅ Verified |
| **Plot Size Validation** | Minimum required plot area checks per building type (House: 400 sq.ft, Apartment: 2k, School: 5k, etc.) | ✅ Verified |
| **Nearby Facilities (8 Categories)** | Live Overpass query with straight-line geodesic distance (km) across 8 categories; distinct empty and unavailable states | ✅ Verified |
| **Multi-Format Exports** | Professional PDF reports (ReportLab) and comprehensive Excel workbooks (openpyxl) reflecting true data availability | ✅ Verified |
| **User Dashboard** | User-isolated parcel metrics, building distribution charts, and recent analyses table | ✅ Verified |

---

## 3. Methodology & Architecture Transparency

1. **Scoring Engine**: Rule-based environmental and infrastructure risk scoring with a machine-learning component trained on synthetic baseline data. Machine-learning models (RandomForestRegressor and RandomForestClassifier) provide baseline multi-factor weighting and building classification probabilities, while deterministic physical models govern flood risk, ESA WorldCover satellite constraints, and plot footprint minimums.
2. **Environmental Telemetry**: Real-time DEM elevation and river discharge are retrieved from Open-Meteo. If external telemetry is unreachable, the system explicitly reports the factor as "Unavailable" rather than substituting an arbitrary default or presenting an inaccurate "Low Risk" rating.
3. **Geodesic Distance Proximity**: All facility distances represent straight-line geodesic distance calculated via the Haversine formula on the WGS84 Earth sphere ($R = 6,371.0\text{ km}$) directly from the parcel centroid or representative coordinates. Driving routes and navigation distances may vary based on street networks.
4. **Data Limitations**: OpenStreetMap facility queries identify mapped records within the searched radius. The absence of mapped records indicates lack of data in OpenStreetMap rather than guaranteed physical absence of real-world infrastructure.

---

## 4. Local Development Setup

### 4.1 Backend Setup (`backend/`)

```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Configure JWT_SECRET_KEY and DATABASE_URL in .env

# Run migrations
alembic upgrade head

# Start backend server
uvicorn app.main:app --reload --port 8000
```

### 4.2 Frontend Setup (`frontend/`)

```bash
cd frontend
npm install
npm run dev
```
