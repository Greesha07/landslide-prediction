"""
=====================================================================
LANDSLIDE PREDICTION FLASK BACKEND
=====================================================================
Loads the trained ensemble model (Random Forest + Extra Trees) and
serves LIVE predictions for any village in the dataset. Every request
runs actual inference - nothing is pre-computed and cached, so the
model genuinely re-evaluates each time (proven by the rainfall slider
changing results live).

UPDATED to use the TRUE_FINAL 11-feature model (AUC 0.854, threshold
0.4): drops SoilMoisture_RootZone in favor of real NDVI_Vegetation
(satellite vegetation index) plus Rainfall_3Day_Cumulative_mm and
Rainfall_7Day_Cumulative_mm (antecedent rainfall), alongside the
original 8 terrain/rainfall features.

Routes are under /api/* so this file can be deployed alongside the
frontend build in a single Vercel project, with /api/* routed here and
everything else served as static frontend files.

ENDPOINTS:
  GET  /api                       - health check
  GET  /api/villages               - list all village names (for dropdown)
  POST /api/predict                - predict risk for a village
       Body: {"village_name": "Irshalwadi"}
       Or:   {"village_name": "Irshalwadi", "rainfall_override_mm": 3500}
       Or:   {"latitude": 18.93, "longitude": 73.23, "elevation_m": 419,
              "slope_deg": 6.73, "aspect_deg": 46.6, "roughness": 5.7,
              "curvature": -6, "distance_to_river_km": 2.99,
              "distance_to_road_km": 1.2, "ndvi": 0.34,
              "rainfall_3day_mm": 18.6, "rainfall_7day_mm": 91.1}

RUN LOCALLY:
  pip install flask flask-cors pandas scikit-learn requests
  python app.py
  Then open http://127.0.0.1:5000 in a browser, or point your
  dashboard's fetch() calls at http://127.0.0.1:5000/api/predict
=====================================================================
"""
import pickle
import os
import requests
import pandas as pd
from flask import Flask, request, jsonify

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads a local .env file for development; no-op if none exists or in production
except ImportError:
    pass

app = Flask(__name__)


@app.after_request
def add_cors_headers(response):
    """Manual CORS headers (avoids needing the flask-cors package) so
    the HTML dashboard, served from a different origin/port, can call
    this API directly from the browser."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

# ---- Configuration ----
# Model/data paths default to the sibling /model and /data folders (this
# repo's layout: backend/app.py, model/*.pkl, data/*.csv) but can be
# overridden via env vars for a different deployment layout.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(_REPO_ROOT, "model", "landslide_ensemble_TRUE_FINAL.pkl"))
VILLAGE_DATA_PATH = os.environ.get("VILLAGE_DATA_PATH", os.path.join(_REPO_ROOT, "data", "Dataset_Merged_11Feature.csv"))

# Required for live rainfall lookups. Set via a local .env file (see
# .env.example) or your hosting platform's environment variables — never
# hardcoded. If unset, get_live_rainfall() below fails gracefully and
# falls back to each village's historical CHIRPS average (see its
# docstring), so the app still runs without it, just without live weather.
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "")
if not OPENWEATHER_API_KEY:
    print("WARNING: OPENWEATHER_API_KEY is not set. Live rainfall lookups will "
          "fail and fall back to historical averages for every prediction.")

# ---- Load model and village data once at startup ----
print("Loading model...")
with open(MODEL_PATH, "rb") as f:
    model_bundle = pickle.load(f)
rf_model = model_bundle["rf_model"]
et_model = model_bundle["et_model"]
# FEATURES and the threshold come straight from the trained bundle rather
# than being hardcoded here, so this file can't silently drift out of sync
# with whatever model was actually saved.
FEATURES = model_bundle["features"]
RECOMMENDED_THRESHOLD = model_bundle.get("recommended_threshold", 0.5)
print(f"Model loaded successfully. AUC: {model_bundle.get('auc')}, "
      f"threshold: {RECOMMENDED_THRESHOLD}, features: {FEATURES}")

print("Loading village dataset...")
village_df = pd.read_csv(VILLAGE_DATA_PATH)
print(f"Loaded {len(village_df)} villages.")

# Dataset-wide averages used as sane defaults for manual/arbitrary-point
# mode, where the user can't supply real road-distance, vegetation, or
# antecedent-rainfall values (those require OSM/GEE/satellite lookups we
# don't run live here).
DEFAULT_DISTANCE_TO_ROAD_KM = float(village_df["Distance_to_Road_km_REAL"].mean())
DEFAULT_NDVI = float(village_df["NDVI_Vegetation"].mean())
DEFAULT_RAIN_3DAY = float(village_df["Rainfall_3Day_Cumulative_mm"].mean())
DEFAULT_RAIN_7DAY = float(village_df["Rainfall_7Day_Cumulative_mm"].mean())


def get_live_rainfall(lat, lon, historical_avg_mm):
    """Fetch current + forecast rainfall from OpenWeatherMap. Returns a
    dict with current_mm and forecast_mm (next 24h max). Falls back to
    THIS VILLAGE'S OWN real historical CHIRPS average (passed in as
    historical_avg_mm) if the API call fails, so a live demo never
    crashes even if the API key is temporarily rate-limited - and the
    fallback is now a real per-village number, not a coastal/inland
    guess."""
    try:
        # Current weather
        url_current = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}"
        resp = requests.get(url_current, timeout=5)
        if resp.status_code != 200:
            raise Exception(f"OpenWeatherMap current-weather call failed: HTTP {resp.status_code}")
        data = resp.json()
        current_mm = data.get("rain", {}).get("1h", 0) * 24  # rough daily estimate from 1hr rate

        # 5-day / 3-hour forecast, take max rainfall in next 24h (8 x 3hr blocks)
        url_forecast = f"https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&appid={OPENWEATHER_API_KEY}"
        resp2 = requests.get(url_forecast, timeout=5)
        if resp2.status_code != 200:
            raise Exception(f"OpenWeatherMap forecast call failed: HTTP {resp2.status_code}")
        data2 = resp2.json()
        forecast_blocks = data2.get("list", [])[:8]
        forecast_mm = max([b.get("rain", {}).get("3h", 0) for b in forecast_blocks], default=0) * 8

        return {
            "current_mm": round(current_mm, 2),
            "forecast_mm": round(forecast_mm, 2),
            "source": "live_api",
            "used_fallback": False
        }
    except Exception as e:
        return {
            "current_mm": historical_avg_mm,
            "forecast_mm": historical_avg_mm,
            "source": "historical_chirps_average_fallback",
            "used_fallback": True,
            "error": str(e)
        }


def run_prediction(feature_row):
    """The actual live inference step. Runs BOTH models fresh and
    averages their probabilities - this is the ensemble decided during
    model development. Nothing here is cached."""
    X = pd.DataFrame([feature_row], columns=FEATURES)
    rf_proba = rf_model.predict_proba(X)[0][1]
    et_proba = et_model.predict_proba(X)[0][1]
    avg_proba = (rf_proba + et_proba) / 2

    risk_label = "HIGH RISK" if avg_proba >= RECOMMENDED_THRESHOLD else "LOWER RISK"

    return {
        "risk_probability": round(float(avg_proba), 4),
        "risk_percentage": round(float(avg_proba) * 100, 1),
        "risk_label": risk_label,
        "threshold_used": RECOMMENDED_THRESHOLD,
        "rf_model_proba": round(float(rf_proba), 4),
        "et_model_proba": round(float(et_proba), 4)
    }


@app.route("/api")
@app.route("/api/")
def health_check():
    return jsonify({
        "status": "running",
        "message": "Landslide Prediction API is live.",
        "villages_loaded": len(village_df),
        "model_auc": model_bundle.get("auc"),
        "endpoints": ["/api/villages", "/api/predict"]
    })


@app.route("/api/villages")
def list_villages():
    """Returns all village names + coordinates for the dashboard's
    map markers and search dropdown."""
    subset = village_df[["Village_Name", "Latitude", "Longitude", "Label"]].copy()
    subset["Latitude"] = subset["Latitude"].astype(float)
    subset["Longitude"] = subset["Longitude"].astype(float)
    subset["Label"] = subset["Label"].astype(int)
    result = subset.to_dict(orient="records")
    return jsonify(result)


@app.route("/api/predict", methods=["POST"])
def predict():
    data = request.get_json()

    if "village_name" in data:
        # ---- Lookup mode: known village, live rainfall applied ----
        village_name = data["village_name"]
        row = village_df[village_df["Village_Name"] == village_name]
        if row.empty:
            return jsonify({"error": f"Village '{village_name}' not found."}), 404
        row = row.iloc[0]

        lat, lon = float(row["Latitude"]), float(row["Longitude"])
        village_historical_rainfall = float(row["Rainfall_CHIRPS_mm"])

        if "rainfall_override_mm" in data:
            # Used by the dashboard's "what-if" slider - skips the live
            # API call and lets the user manually set a rainfall value.
            # An optional separate forecast_override_mm lets a demo
            # simulate "today is calm, but a storm is forecasted" -
            # exactly the scenario the early-warning feature is for.
            override_current = data["rainfall_override_mm"]
            override_forecast = data.get("forecast_override_mm", override_current)
            rainfall_info = {"current_mm": override_current,
                              "forecast_mm": override_forecast,
                              "source": "manual_slider_override", "used_fallback": False}
        else:
            rainfall_info = get_live_rainfall(lat, lon, village_historical_rainfall)

        feature_row = {
            "Elevation_m": float(row["Elevation_m"]),
            "Slope_deg": float(row["Slope_deg"]),
            "Aspect_deg": float(row["Aspect_deg"]),
            "Roughness": float(row["Roughness"]),
            "Curvature": float(row["Curvature"]),
            "Rainfall_CHIRPS_mm": float(rainfall_info["current_mm"]) if rainfall_info["current_mm"] > 0 else village_historical_rainfall,
            "Distance_to_River_km": float(row["Distance_to_River_km"]),
            "Distance_to_Road_km_REAL": float(row["Distance_to_Road_km_REAL"]),
            "NDVI_Vegetation": float(row["NDVI_Vegetation"]),
            "Rainfall_3Day_Cumulative_mm": float(row["Rainfall_3Day_Cumulative_mm"]),
            "Rainfall_7Day_Cumulative_mm": float(row["Rainfall_7Day_Cumulative_mm"])
        }

        prediction = run_prediction(feature_row)

        # ---- EARLY WARNING: run a SECOND prediction using forecasted
        # rainfall (not just current), so we can tell the user whether
        # risk is expected to RISE in the coming days - this is what
        # actually makes it an "early warning" system rather than a
        # current-conditions checker. ----
        forecast_feature_row = dict(feature_row)
        forecast_feature_row["Rainfall_CHIRPS_mm"] = float(rainfall_info["forecast_mm"]) if rainfall_info["forecast_mm"] > 0 else feature_row["Rainfall_CHIRPS_mm"]
        forecast_prediction = run_prediction(forecast_feature_row)

        early_warning = None
        risk_increase = forecast_prediction["risk_percentage"] - prediction["risk_percentage"]
        if risk_increase >= 5:  # meaningful rise threshold
            early_warning = {
                "triggered": True,
                "message": f"Forecasted rainfall may raise risk from {prediction['risk_percentage']}% to {forecast_prediction['risk_percentage']}% over the next 24 hours.",
                "current_risk_pct": prediction["risk_percentage"],
                "forecast_risk_pct": forecast_prediction["risk_percentage"],
                "risk_increase_pct": round(risk_increase, 1)
            }
        else:
            early_warning = {"triggered": False, "message": "No significant risk increase expected from forecasted rainfall."}

        prediction["village_name"] = village_name
        prediction["latitude"] = lat
        prediction["longitude"] = lon
        prediction["rainfall_info"] = rainfall_info
        prediction["historical_rainfall_mm"] = round(village_historical_rainfall, 2)
        prediction["features_used"] = feature_row
        prediction["early_warning"] = early_warning
        return jsonify(prediction)

    elif all(k in data for k in ["latitude", "longitude", "elevation_m", "slope_deg"]):
        # ---- Manual mode: arbitrary point with user-supplied terrain values ----
        lat, lon = float(data["latitude"]), float(data["longitude"])

        # No per-point historical CHIRPS average available for an
        # arbitrary point (that needs a live GEE call, not done here),
        # so fall back to the dataset-wide mean rainfall if the live
        # API also fails.
        dataset_mean_rainfall = float(village_df["Rainfall_CHIRPS_mm"].mean())
        rainfall_info = get_live_rainfall(lat, lon, dataset_mean_rainfall)

        feature_row = {
            "Elevation_m": data["elevation_m"],
            "Slope_deg": data["slope_deg"],
            "Aspect_deg": data.get("aspect_deg", 0),
            "Roughness": data.get("roughness", 0),
            "Curvature": data.get("curvature", 0),
            "Rainfall_CHIRPS_mm": rainfall_info["current_mm"] if rainfall_info["current_mm"] > 0 else dataset_mean_rainfall,
            "Distance_to_River_km": data.get("distance_to_river_km", 5),
            "Distance_to_Road_km_REAL": data.get("distance_to_road_km", DEFAULT_DISTANCE_TO_ROAD_KM),
            "NDVI_Vegetation": data.get("ndvi", DEFAULT_NDVI),
            "Rainfall_3Day_Cumulative_mm": data.get("rainfall_3day_mm", DEFAULT_RAIN_3DAY),
            "Rainfall_7Day_Cumulative_mm": data.get("rainfall_7day_mm", DEFAULT_RAIN_7DAY)
        }
        prediction = run_prediction(feature_row)
        prediction["latitude"] = lat
        prediction["longitude"] = lon
        prediction["rainfall_info"] = rainfall_info
        prediction["features_used"] = feature_row
        return jsonify(prediction)

    else:
        return jsonify({"error": "Provide either 'village_name' or all of latitude/longitude/elevation_m/slope_deg"}), 400


if __name__ == "__main__":
    app.run(debug=False, port=5000)