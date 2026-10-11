# Smart Land Analysis Platform - Frontend

React 18 (Vite) + MapLibre GL + Tailwind CSS frontend. See the top-level \README.md\ (one
folder up) for the full setup walkthrough covering both backend and frontend.

## Tech Stack

- **React 18** + **Vite** — component lifecycle & lightning-fast dev server
- **MapLibre GL & Turf.js** — high-performance vector/satellite map rendering and true geodesic area calculation (sq.ft, m², cents, acres)
- **Tailwind CSS** — responsive styling, custom design tokens in \	ailwind.config.js- **React Router v6** — client-side routing & JWT-protected routes (\src/App.jsx\)
- **Recharts** — dashboard analytics, building distribution charts, and suitability gauges
- **Axios** — API client with JWT authorization interceptors (\src/services/api.js\)

## What's Implemented

**Fully working and connected to the FastAPI backend:**
- **Authentication** — Login / Register pages, \AuthContext\ (global auth state),
  \ProtectedRoute\ guarding Land Analysis / Dashboard / Reports (redirects
  to \/login\ if signed out, and returns to the requested page upon successful sign-in).
- **Land Analysis Flow**:
  1. **Geocoding & Location Search**: Search places by name (OSM Nominatim) or pan/zoom the satellite map.
  2. **Boundary Delineation**:
     - *Polygon Mode*: Draw closed boundary polygons with real-time geodesic area calculation using Turf.js.
     - *Direct Area Input Mode*: Pin a point on the map and directly enter land area in chosen units (sq.ft, m², cents, acres) with immediate conversion.
  3. **Live GIS Data Enrichment**: Automatic retrieval of WRB soil taxonomy (ISRIC SoilGrids), elevation & slope (Open-Elevation), road network widths (OSM Overpass), and ESA WorldCover land use classification.
  4. **Proximity Infrastructure Analysis**: Live Overpass query returning 8 essential facility categories (Bus Stands, Railway Stations, Airports, Hospitals, Schools, Commercial Hubs, Roads, Water Bodies) with straight-line geodesic distance badges in kilometres (km).
  5. **Building Plot Feasibility**: Validation of minimum plot requirements (Individual House: 400 sq.ft, Apartment: 2,000 sq.ft, Commercial: 1,500 sq.ft, School: 5,000 sq.ft, Hospital: 10,000 sq.ft).
  6. **Interactive Breakdown Modal**: Factor weights, calculation formulas, data provenance metadata, historical change status, and multi-format report exports.
  7. **Multi-Format Export Downloads**: Instant download of official PDF reports and comprehensive Excel workbooks (.xlsx).
- **Dashboard** — Aggregate statistics, building distribution bar charts, latest parcel telemetry, and recent analyses table.
- **Reports Management** — History of generated analysis reports with one-click re-download.

## Project Structure

\frontend/
├── public/            # static assets (favicon)
├── src/
│   ├── components/     # DetailedLandAnalysisModal, FacilityCard, MapPicker, ScoreGauge, etc.
│   ├── context/          # AuthContext (global authentication state)
│   ├── hooks/             # useFetch, useGeolocation, useDebounce
│   ├── layouts/            # MainLayout (Navbar + Outlet + Footer)
│   ├── pages/               # Home, Login, Register, LandAnalysis, Dashboard, Reports, About
│   ├── services/              # api.js, authService, landService, analysisService, gisService, reportService
│   ├── utils/                  # areaUnits.js (geodesic math & unit conversion)
│   ├── App.jsx                 # Route definitions & protected route guards
│   ├── main.jsx                 # Application entrypoint
│   └── index.css                 # Tailwind directives & typography
├── index.html
├── package.json
├── vite.config.js
└── .env.example
\
## Setup

\\ash
npm install
cp .env.example .env      # defaults point to http://127.0.0.1:8000/api/v1
npm run dev
\Opens at **http://localhost:5173**.

## Production Build

\\ash
npm run build
npm run preview
\
