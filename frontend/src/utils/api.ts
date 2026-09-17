// Live backend client — Flask API at API_BASE serving the real
// Random Forest + Extra Trees ensemble (AUC 0.854, threshold 0.4).
// See backend/app.py for the source of truth on these shapes.

// Routes live under /api/* (see backend/app.py). Default assumes the Flask
// dev server is running standalone on :5000; in the merged single-project
// deployment VITE_API_BASE_URL is set to "/api" (same origin, no CORS).
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000/api";

export interface BackendVillage {
  Village_Name: string;
  Latitude: number;
  Longitude: number;
  Label: number; // 1 = documented risk site, 0 = safe point
}

export interface BackendFeatures {
  Elevation_m: number;
  Slope_deg: number;
  Aspect_deg: number;
  Roughness: number;
  Curvature: number;
  Rainfall_CHIRPS_mm: number;
  Distance_to_River_km: number;
  Distance_to_Road_km_REAL: number;
  NDVI_Vegetation: number;
  Rainfall_3Day_Cumulative_mm: number;
  Rainfall_7Day_Cumulative_mm: number;
}

export interface RainfallInfo {
  current_mm: number;
  forecast_mm: number;
  source: string;
  used_fallback: boolean;
  error?: string;
}

export interface EarlyWarning {
  triggered: boolean;
  message: string;
  current_risk_pct?: number;
  forecast_risk_pct?: number;
  risk_increase_pct?: number;
}

export interface BackendPredictResponse {
  village_name?: string;
  latitude: number;
  longitude: number;
  risk_probability: number;
  risk_percentage: number;
  risk_label: string; // "HIGH RISK" | "LOWER RISK" at the model's own 0.4 threshold
  threshold_used: number;
  rf_model_proba: number;
  et_model_proba: number;
  features_used: BackendFeatures;
  rainfall_info: RainfallInfo;
  early_warning: EarlyWarning;
  historical_rainfall_mm?: number; // this village's own CHIRPS baseline; absent in arbitrary-point mode
}

export class ApiError extends Error {}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const msg = typeof body.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new ApiError(msg);
  }
  return res.json();
}

export async function fetchVillages(): Promise<BackendVillage[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/villages`);
  } catch {
    throw new ApiError(`Cannot reach backend at ${API_BASE}. Is app.py running (python app.py)?`);
  }
  return handle<BackendVillage[]>(res);
}

export async function predictVillage(
  villageName: string,
  opts?: { rainfallOverrideMm?: number; forecastOverrideMm?: number },
): Promise<BackendPredictResponse> {
  const body: Record<string, unknown> = { village_name: villageName };
  if (opts?.rainfallOverrideMm != null) body.rainfall_override_mm = opts.rainfallOverrideMm;
  if (opts?.forecastOverrideMm != null) body.forecast_override_mm = opts.forecastOverrideMm;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(`Cannot reach backend at ${API_BASE}. Is app.py running (python app.py)?`);
  }
  return handle<BackendPredictResponse>(res);
}
