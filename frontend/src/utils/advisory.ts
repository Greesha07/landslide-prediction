import type { PredictionResult } from "./prediction";
import type { Village } from "../data/villages";

const FACTOR_EN: Record<string, string> = {
  rainfallIntensity: "high rainfall intensity",
  rain3Day:          "heavy rainfall over the past 3 days",
  rain7Day:          "heavy rainfall over the past 7 days",
  elevation:         "high elevation",
  ndvi:              "sparse vegetation cover",
  terrainRoughness:  "high terrain roughness",
  slope:             "steep slope angle",
  distanceToRiver:   "proximity to river channel",
  distanceToRoad:    "road-cut slope exposure",
  curvature:         "concave slope curvature",
  aspect:            "southwest-facing aspect",
};

const FACTOR_MR: Record<string, string> = {
  rainfallIntensity: "अतिवृष्टी",
  rain3Day:          "मागील ३ दिवसांतील मुसळधार पाऊस",
  rain7Day:          "मागील ७ दिवसांतील मुसळधार पाऊस",
  elevation:         "उंची",
  ndvi:              "विरळ वनस्पती आच्छादन",
  terrainRoughness:  "खडबडीत भूप्रदेश",
  slope:             "उंच उतार",
  distanceToRiver:   "नदीजवळील स्थान",
  distanceToRoad:    "रस्त्यालगतचा उतार",
  curvature:         "अवतल वक्रता",
  aspect:            "नैऋत्य दिशेचा उतार",
};

export function generateAdvisory(village: Village, result: PredictionResult, lang: "en" | "mr"): string {
  const { riskScore, riskLevel, factors } = result;
  const top = Object.entries(factors).sort(([, a], [, b]) => b - a)[0][0];
  const second = Object.entries(factors).sort(([, a], [, b]) => b - a)[1][0];

  if (lang === "mr") {
    if (riskLevel === "CRITICAL") return `${village.name} मध्ये भूस्खलनाचा उच्च धोका आहे (${riskScore.toFixed(0)}%). मुख्य कारण: ${FACTOR_MR[top] ?? top} आणि ${FACTOR_MR[second] ?? second}. सतर्क निरीक्षण ठेवा, स्थानिक ग्रामपंचायत व जिल्हा आपत्ती व्यवस्थापन प्राधिकरणाला कळवा, आणि मुसळधार पावसात उंच किंवा नदीजवळील उतारांवर अनावश्यक प्रवास टाळा.`;
    if (riskLevel === "HIGH")     return `${village.name} मध्ये उच्च धोका आहे (${riskScore.toFixed(0)}%). ${FACTOR_MR[top] ?? top} हे प्रमुख घटक आहे. डोंगर उतारापासून दूर राहा.`;
    if (riskLevel === "MEDIUM")   return `${village.name} मध्ये मध्यम धोका आहे (${riskScore.toFixed(0)}%). ${FACTOR_MR[top] ?? top} वर लक्ष ठेवा. पाऊस वाढल्यास सावधगिरी बाळगा.`;
    return `${village.name} मध्ये सध्या धोका कमी आहे (${riskScore.toFixed(0)}%). मान्सून काळात सतर्क राहा.`;
  }

  if (riskLevel === "CRITICAL") return `${village.name} shows elevated landslide risk (${riskScore.toFixed(0)}%), driven primarily by ${FACTOR_EN[top] ?? top} and ${FACTOR_EN[second] ?? second}. Recommend heightened monitoring, alert the local Gram Panchayat and district disaster management authority, and avoid unnecessary travel on steep or river-adjacent slopes during heavy rainfall.`;
  if (riskLevel === "HIGH")     return `High alert for ${village.name} (${riskScore.toFixed(0)}%). The dominant risk factor is ${FACTOR_EN[top] ?? top}. Pre-position response teams and monitor IMD bulletins every 3 hours.`;
  if (riskLevel === "MEDIUM")   return `${village.name} shows elevated landslide potential (${riskScore.toFixed(0)}%), driven primarily by ${FACTOR_EN[top] ?? top}. Residents should avoid hill-facing slopes during heavy rain and stay alert for IMD orange alerts.`;
  return `${village.name} is at low risk (${riskScore.toFixed(0)}%). Standard monsoon precautions apply. Report any unusual ground movement or cracks to the district disaster cell.`;
}
