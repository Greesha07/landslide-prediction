import type { Village } from "../data/villages";
import { predictVillage, type BackendFeatures, type RainfallInfo, type EarlyWarning } from "./api";

export interface PredictionResult {
  riskScore: number; // risk_percentage from the live ensemble (0-100)
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; // UI-only bucketing of riskScore
  backendRiskLabel: string; // the model's own call at its trained threshold, e.g. "HIGH RISK"
  thresholdUsed: number;
  rfScore: number; // Random Forest sub-score
  etScore: number; // Extra Trees sub-score
  factors: {
    rainfallIntensity: number;
    rain3Day: number;
    rain7Day: number;
    elevation: number;
    ndvi: number;
    distanceToRoad: number;
    terrainRoughness: number;
    distanceToRiver: number;
    curvature: number;
    aspect: number;
    slope: number;
  };
  rawFeatures: BackendFeatures; // the actual physical values the model was fed
  rainfallInfo: RainfallInfo;
  historicalRainfallMm: number | null; // this village's own CHIRPS baseline ("typical monsoon rainfall")
  earlyWarning: EarlyWarning;
  forecastRisk: number; // forecast_risk_pct when early_warning triggered, else same as riskScore
  modelAgreement: number; // RF/ET ensemble agreement: 100 - |RF - ET| probability gap. Not the risk score, and not a calibrated statistical confidence.
  timestamp: number;
}

// Normalization ranges below come from the actual training data
// (backend/Dataset_Merged_11Feature.csv, 480 rows) — not guesses.
// Elevation_m 2-1390, Slope_deg 0-40, Roughness 0-42, Curvature -24..22,
// Rainfall_CHIRPS_mm 467-3124, Distance_to_River/Road_km 0-11,
// NDVI_Vegetation -0.62..0.87 (standard NDVI scale), Rainfall_3Day_Cumulative_mm
// 0-77, Rainfall_7Day_Cumulative_mm 11-210.
function normalizeFactors(f: BackendFeatures) {
  const r = (v: number) => Math.round(Math.min(100, Math.max(0, v)));
  return {
    rainfallIntensity: r((f.Rainfall_CHIRPS_mm / 3200) * 100),
    rain3Day: r((f.Rainfall_3Day_Cumulative_mm / 80) * 100),
    rain7Day: r((f.Rainfall_7Day_Cumulative_mm / 210) * 100),
    elevation: r((f.Elevation_m / 1400) * 100),
    // NDVI is inverted: sparse vegetation (low NDVI) raises risk, so a HIGH
    // bar here means LOW vegetation — kept consistent with every other
    // factor where bar magnitude tracks risk contribution, not raw value.
    ndvi: r(100 - ((f.NDVI_Vegetation - -0.62) / (0.87 - -0.62)) * 100),
    distanceToRoad: r(100 - f.Distance_to_Road_km_REAL * 9),
    terrainRoughness: r((f.Roughness / 45) * 100),
    distanceToRiver: r(100 - f.Distance_to_River_km * 9),
    curvature: r((Math.abs(f.Curvature) / 24) * 100),
    aspect: r(Math.abs(Math.sin((f.Aspect_deg * Math.PI) / 180)) * 65 + 20),
    slope: r((f.Slope_deg / 45) * 100),
  };
}

function riskLevelFor(score: number): PredictionResult["riskLevel"] {
  return score >= 72 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 28 ? "MEDIUM" : "LOW";
}

export async function runPrediction(
  village: Village,
  opts?: { rainfallOverrideMm?: number; forecastOverrideMm?: number },
): Promise<PredictionResult> {
  const res = await predictVillage(village.name, opts);

  const forecastRisk = res.early_warning.triggered ? (res.early_warning.forecast_risk_pct ?? res.risk_percentage) : res.risk_percentage;

  return {
    riskScore: res.risk_percentage,
    riskLevel: riskLevelFor(res.risk_percentage),
    backendRiskLabel: res.risk_label,
    thresholdUsed: res.threshold_used,
    rfScore: Math.round(res.rf_model_proba * 1000) / 10,
    etScore: Math.round(res.et_model_proba * 1000) / 10,
    factors: normalizeFactors(res.features_used),
    rawFeatures: res.features_used,
    rainfallInfo: res.rainfall_info,
    historicalRainfallMm: res.historical_rainfall_mm ?? null,
    earlyWarning: res.early_warning,
    forecastRisk,
    modelAgreement: Math.round(Math.max(40, 100 - Math.abs(res.rf_model_proba - res.et_model_proba) * 100)),
    timestamp: Date.now(),
  };
}

export function getRiskColor(score: number): string {
  if (score >= 72) return "#dc2626";
  if (score >= 50) return "#d97706";
  if (score >= 28) return "#ca8a04";
  return "#16a34a";
}

export function getRiskBorderColor(score: number): string {
  if (score >= 72) return "rgba(220,38,38,0.3)";
  if (score >= 50) return "rgba(217,119,6,0.3)";
  if (score >= 28) return "rgba(202,138,4,0.25)";
  return "rgba(22,163,74,0.25)";
}

export function getRiskBg(score: number): string {
  if (score >= 72) return "rgba(220,38,38,0.05)";
  if (score >= 50) return "rgba(217,119,6,0.05)";
  if (score >= 28) return "rgba(202,138,4,0.04)";
  return "rgba(22,163,74,0.05)";
}

export function getRiskLabel(score: number, lang: "en" | "mr"): string {
  if (lang === "mr") {
    if (score >= 72) return "अत्यंत धोका";
    if (score >= 50) return "उच्च धोका";
    if (score >= 28) return "मध्यम धोका";
    return "कमी धोका";
  }
  if (score >= 72) return "Critical risk";
  if (score >= 50) return "High risk";
  if (score >= 28) return "Medium risk";
  return "Low risk";
}
