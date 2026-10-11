# Smart Land Analysis Platform

**AI & GIS-Based Decision Support System for Land Feasibility & Building Planning** — Final Year Engineering Project

Register, log in, draw a plot boundary or enter direct area measurements on a satellite map, and get a Scikit-Learn ML suitability prediction, recommended building type, and explainable multi-factor Risk Score — enriched with live OpenStreetMap geospatial infrastructure, ISRIC SoilGrids taxonomy, and downloadable PDF & Excel reports.

\Smart-Land-Analysis-Platform/
├── backend/     — FastAPI (Python 3.11) + Supabase PostgreSQL + Scikit-Learn
├── frontend/    — React 18 (Vite) + MapLibre GL + Turf.js + Tailwind CSS
└── README.md    — Project documentation & setup guide
\
---

## 1. Verified Technology Stack

| Layer | Technology | Role & Purpose |
|---|---|---|
| **Frontend Framework** | React 18, Vite | Component-driven UI, state management, fast client builds |
| **Geospatial Mapping** | MapLibre GL, Turf.js | Satellite basemaps, polygon vector drawing, geodesic ellipsoidal area math |
| **Styling & Visualization** | Tailwind CSS, Recharts | Responsive layout, metric gauges, building distribution charts |
| **Backend Framework** | FastAPI (Python 3.11) | High-performance asynchronous REST API with Pydantic validation |
| **Database & ORM** | Supabase PostgreSQL, SQLAlchemy 2.0 | Async connection pool, schema migrations (Alembic), GeoJSON boundary storage |
| **Machine Learning** | Scikit-Learn (Random Forest) | Offline-trained classifier & regressor for suitability and building classification |
| **Export Reporting** | ReportLab, openpyxl | Programmatic PDF document generation & multi-worksheet Excel workbooks (.xlsx) |
| **External Geospatial APIs** | OpenStreetMap Overpass | Live queries for 8 essential nearby facility categories with Haversine km distances |
| **Environmental Telemetry** | ISRIC SoilGrids, Open-Meteo | WRB soil classification & hydrological flood risk exposure |

---

## 2. Implemented Features & Modules

| Feature | Implementation Details | Status |
|---|---|---|
| **Authentication & RBAC** | JWT token authentication (PyJWT), bcrypt salted password hashing, route guards | ✅ Fully Verified |
| **Accurate Land Delineation** | True geodesic polygon area calculation via Turf.js + Direct Area User Input (sq.ft, m², cents, acres) | ✅ Fully Verified |
| **No Fixed 2400 sq.ft Bug** | Removed all synthetic 15m boxes and hardcoded defaults; dynamic fallback to user-specified dimensions | ✅ Fully Verified |
| **ML Feasibility Assessment** | Scikit-Learn Random Forest evaluating geotechnical & environmental feature vectors | ✅ Fully Verified |
| **Plot Size Validation** | Minimum required plot area checks per building type (House: 400 sq.ft, Apartment: 2k, School: 5k, etc.) | ✅ Fully Verified |
| **Nearby Facilities (8 Categories)** | Live Overpass query with geodesic straight-line distance (km) for Bus, Train, Airport, Hospital, School, Shops, Roads, Water | ✅ Fully Verified |
| **Construction Cost Removed** | Construction cost estimates cleanly removed across schemas, UI, PDF, and Excel | ✅ Fully Verified |
| **Multi-Format Exports** | Professional PDF reports (ReportLab) and comprehensive Excel workbooks (openpyxl) | ✅ Fully Verified |
| **User Dashboard** | Aggregate parcel metrics, building distribution charts, and recent analyses table | ✅ Fully Verified |

---

## 3. Machine Learning & Geospatial Architecture

1. **Suitability Model**: A trained Scikit-learn Random Forest model (\model.pkl\, \scaler.pkl\, \label_encoder.pkl\) ingests normalized feature vectors representing soil bearing capacity, slope gradient, flood vulnerability, and road access.
2. **Deterministic Constraint Layer**: Enforces zoning compliance and minimum land footprint requirements. If a parcel is under the required threshold for a hospital or school, the engine flags it as unsuitable regardless of raw soil score.
3. **Geodesic Distance Proximity**: All facility distances are computed using the Haversine formula on the WGS84 Earth sphere ( = 6,371.0	ext{ km}$) directly from the parcel centroid.

---

## 4. Local Development Setup

### 4.1 Backend Setup (\ackend/\)
\\ash
cd backend
python -m venv venv

# macOS / Linux: source venv/bin/activate
# Windows: venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
# Configure DATABASE_URL (PostgreSQL) and JWT_SECRET_KEY
alembic upgrade head
uvicorn app.main:app --reload
\- API base: \http://localhost:8000/api/v1- Swagger documentation: \http://localhost:8000/api/v1/docs- Health endpoint: \http://localhost:8000/api/v1/health
### 4.2 Frontend Setup (\rontend/\)
\\ash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_BASE_URL=http://localhost:8000/api/v1
npm run dev
\- Web application: \http://localhost:5173
---

## 5. Regulatory Notice & Academic Disclaimer

This application is an engineering decision-support tool developed for academic research and site-feasibility pre-screening. It does not replace on-site physical geotechnical borehole testing, structural engineering designs, or certified land cadastral title surveys.
