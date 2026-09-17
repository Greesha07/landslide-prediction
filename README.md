# Sahyadri Sentinel

A landslide early-warning dashboard for villages in Maharashtra's Western
Ghats (Raigad/Satara/Pune region). A Random Forest + Extra Trees ensemble,
trained on 480 villages (155 documented landslide sites, 325 safe points),
predicts live landslide risk from real terrain, satellite, and weather data
— no synthetic or placeholder numbers anywhere in the pipeline.

## How it works

- **Model**: Random Forest + Extra Trees ensemble (averaged probability),
  11 features, decision threshold 0.4. AUC-ROC 0.854 (from the saved model
  bundle); Recall 91% / Precision 56% / F1 0.69, from an independent 5-fold
  Stratified Cross-Validation run on the saved architecture (see
  `frontend/src/components/ModelFactors.tsx` for the full writeup and the
  Technical View in the app for the confusion matrix).
- **Features**: elevation, slope, aspect, terrain roughness, curvature,
  distance to river/road (SRTM DEM + OpenStreetMap), CHIRPS satellite
  rainfall (current + 3-day/7-day cumulative), and NDVI vegetation index.
- **Backend** (`/backend`): Flask API that loads the model once at startup
  and runs live inference on every request — nothing is pre-computed or
  cached. Also fetches live current + forecast rainfall from
  OpenWeatherMap, with a documented, tested fallback to each village's own
  historical CHIRPS average if that call fails or is rate-limited.
- **Frontend** (`/frontend`): React + Vite + TypeScript dashboard. Citizen
  View keeps things plain-language with traffic-light risk colors;
  Technical View exposes the full model internals (RF/ET sub-scores,
  feature importances, confusion matrix, etc.).

## Project structure

```
backend/    Flask API (app.py) + requirements.txt
model/      Trained model bundle (.pkl) — RF + ET classifiers, feature
            list, and threshold, loaded once at startup
data/       Village dataset (.csv) the backend serves predictions from
frontend/   React + Vite + TypeScript dashboard
```

## Running locally

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then fill in OPENWEATHER_API_KEY
python app.py
```

Runs on `http://127.0.0.1:5000`. Without `OPENWEATHER_API_KEY` set, live
rainfall lookups fail gracefully and fall back to historical averages —
the app still runs, just without live weather.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # optional — defaults point at localhost:5000
npm run dev
```

Runs on `http://localhost:8443` (or whatever port Vite reports) and talks
to the backend at `VITE_API_BASE_URL` (default `http://127.0.0.1:5000`).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `OPENWEATHER_API_KEY` | backend | Live current/forecast rainfall. Falls back to historical averages if unset. |
| `MODEL_PATH`, `VILLAGE_DATA_PATH` | backend | Optional overrides if you move the model/data files from their default `../model`, `../data` locations. |
| `VITE_API_BASE_URL` | frontend (build-time) | Where the deployed frontend should call the backend. |
| `VITE_NTFY_TOPIC` | frontend (build-time) | ntfy.sh topic for the "Send Phone Notification" demo button. ntfy topics are public — pick something unguessable. |

See `backend/.env.example` and `frontend/.env.example`.

## Known limitations

- The Random Forest + Extra Trees ensemble was intentionally tuned to
  favor recall over precision (missing a real landslide site is far worse
  than a false alarm) — expect a meaningful false-positive rate at the
  0.4 threshold; see the confusion matrix in Technical View.
- Live rainfall depends on OpenWeatherMap's free tier, which is rate
  limited; the backend degrades honestly to historical averages rather
  than failing silently with wrong-looking "live" data.
- Village coverage is limited to the 480-site training dataset in
  `/data` — predictions outside that geographic distribution haven't
  been validated.
