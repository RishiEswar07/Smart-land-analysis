# Smart Land Analysis Platform — Frontend

React (Vite) + Tailwind CSS frontend. See the top-level `README.md` (one
folder up) for the full setup walkthrough covering both backend and frontend.

## Tech Stack

- **React 18** + **Vite** — app shell & dev server
- **Tailwind CSS** — styling, custom design tokens in `tailwind.config.js`
- **React Router v6** — routing + protected routes (`src/App.jsx`)
- **React Leaflet** + **react-leaflet-draw** — satellite basemap with
  unlimited-vertex polygon boundary drawing
- **Recharts** — dashboard charts, suitability/risk gauges
- **Axios** — API client with JWT interceptor (`src/services/api.js`)

## What's implemented

**Fully working, connected to the backend:**
- **Auth** — Login / Register pages, `AuthContext` (global auth state),
  `ProtectedRoute` guarding Land Analysis / Dashboard / Reports (redirects
  to `/login` if signed out, and back to the intended page after signing in)
- **Land Analysis** — the complete flow:
  1. Search a place by name (OSM Nominatim) or scroll the map
  2. Satellite imagery basemap (Esri World Imagery + labels overlay), with a Streets layer toggle
  3. Draw a polygon boundary directly on the map — unlimited vertices
  4. Area, centroid latitude/longitude, and address (reverse geocoding)
     captured automatically — not manually typed
  5. Fill in the remaining land details
  6. Analyze Land → Result page shows suitability score, recommended
     building type, a dedicated Risk Score gauge + explainable risk
     breakdown, and an AI-generated explanation
  7. **Generate & Download PDF** — actually generates and downloads a real PDF
- **Dashboard** — stat cards, latest analysis, charts (building-type
  distribution, suitability trend), recent-analyses table — all real data
  from the backend, scoped to the logged-in user
- **Reports** — lists every generated PDF, with a working download button

**UI/service scaffolding present but not backend-connected** (renders fine,
degrades gracefully — won't crash the page):
- Nearby facilities / flood-risk cards on the Dashboard (no backend data
  source yet — see backend README's roadmap)

## Project Structure

```
frontend/
├── public/            # static assets (favicon)
├── src/
│   ├── components/     # Navbar, Footer, MapPicker, LocationSearch, ScoreGauge,
│   │                     RiskGauge, RiskBreakdownList, RiskCard, ProtectedRoute, etc.
│   ├── context/          # AuthContext (global auth state)
│   ├── hooks/             # useFetch, useGeolocation, useDebounce
│   ├── layouts/            # MainLayout (Navbar + Outlet + Footer)
│   ├── pages/               # Home, Login, Register, LandAnalysis, Dashboard, Reports, About
│   ├── services/              # api.js (axios instance) + one service per backend module
│   ├── App.jsx                 # route definitions + ProtectedRoute wiring
│   ├── main.jsx                 # app entrypoint
│   └── index.css                 # Tailwind directives + design-token utility classes
├── index.html
├── package.json
├── vite.config.js
└── .env.example
```

## Setup

```bash
npm install
cp .env.example .env      # defaults already point at http://127.0.0.1:8000/api/v1
npm run dev
```
Opens at **http://localhost:5173**.

> Make sure your FastAPI backend is running first, and that its
> `BACKEND_CORS_ORIGINS` includes `http://localhost:5173` (already set in
> the backend's `.env.example`).

## Build for production

```bash
npm run build
npm run preview
```

Note: you may see a build-time warning `"default" is not exported by
"leaflet-draw"` — this is a known, harmless quirk of `leaflet-draw`'s UMD
bundle (it only mutates the global `L` object, it has no real exports) and
does not affect the app at runtime. Verified working in a production build.
