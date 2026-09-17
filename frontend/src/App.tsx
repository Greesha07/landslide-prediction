import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, Map, Eye, EyeOff, Volume2, VolumeX, Globe, Loader2, Send, ChevronRight, Droplets, RefreshCw, PeakSignalLogo } from "./icons";
import "leaflet/dist/leaflet.css";

import { loadVillages, computeDatasetMeta, type Village, type DatasetMeta } from "./data/villages";
import { runPrediction, getRiskColor, getRiskBorderColor, getRiskBg, getRiskLabel, type PredictionResult } from "./utils/prediction";
import { generateAdvisory } from "./utils/advisory";
import { ApiError } from "./utils/api";

import VillageSearch from "./components/VillageSearch";
import RiskGauge from "./components/RiskGauge";
import RainfallTimeline from "./components/RainfallTimeline";
import FactorBars from "./components/FactorBars";
import LeafletMap from "./components/LeafletMap";
import EmergencyAlert from "./components/EmergencyAlert";
import AlertCenter from "./components/AlertCenter";
import ModelFactors from "./components/ModelFactors";

type Page = "dashboard" | "map" | "alerts" | "model";
type ViewMode = "public" | "admin";

// ── Label strings ────────────────────────────────────────────────────────────
const LABELS = {
  en: {
    title: "Sahyadri Sentinel",
    subtitle: "Landslide / Early Warning System",
    dashboard: "Dashboard", map: "Risk Map", alerts: "Alert Center", model: "Model Factors",
    rainfallLabel: "Rainfall what-if (CHIRPS, mm)",
    rainfallLabelPlain: "What if it rains more or less?",
    predict: "Run Prediction", predicting: "Analyzing…",
    advisoryTitle: "AI Advisory",
    earlyWarning: "24-hour forecast warning",
    alertSim: "Simulate Emergency Alert",
    notify: "Send Phone Notification",
    tts: "Read Aloud",
    forecast: "Forecast", modelAgreement: "RF/ET agreement",
    elevation: "Elevation", slope: "Slope", vegetation: "Vegetation Cover",
    publicView: "Citizen View", adminView: "Technical View",
    whyTitle: "Why this prediction — Feature Importance",
    noVillage: "Select a village to run a live prediction",
  },
  mr: {
    title: "सह्याद्री सेंटिनल",
    subtitle: "भूस्खलन / पूर्व चेतावणी प्रणाली",
    dashboard: "डॅशबोर्ड", map: "जोखीम नकाशा", alerts: "अलर्ट केंद्र", model: "मॉडेल घटक",
    rainfallLabel: "पाऊस (CHIRPS, मि.मी.)",
    rainfallLabelPlain: "जास्त किंवा कमी पाऊस झाला तर?",
    predict: "अंदाज चालवा", predicting: "विश्लेषण…",
    advisoryTitle: "AI सल्लागार",
    earlyWarning: "२४ तास पूर्व इशारा",
    alertSim: "आपत्कालीन अलर्ट सिम्युलेशन",
    notify: "फोन सूचना पाठवा",
    tts: "मोठ्याने वाचा",
    forecast: "पूर्वानुमान", modelAgreement: "RF/ET सहमती",
    elevation: "उंची", slope: "उतार", vegetation: "वनस्पती आच्छादन",
    publicView: "नागरिक दृश्य", adminView: "तांत्रिक दृश्य",
    whyTitle: "हा अंदाज का — वैशिष्ट्य महत्व",
    noVillage: "जोखीम अंदाजासाठी गाव निवडा",
  },
} as const;

type Lang = "en" | "mr";
const RAINFALL_SLIDER_MAX = 3500;

// getVoices() can return [] before the browser has finished loading its
// voice list — wait for voiceschanged (with a timeout fallback) instead of
// trusting an empty first read.
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) { resolve(existing); return; }
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    }, 1000);
  });
}

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return t;
}

// ── Thin section header ───────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-sm font-display font-semibold" style={{ color: "var(--color-text)" }}>{children}</span>
      <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
    </div>
  );
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "16px", ...style }}>
      {children}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [page, setPage] = useState<Page>("dashboard");
  const [viewMode, setViewMode] = useState<ViewMode>("public");

  const [villages, setVillages] = useState<Village[]>([]);
  const [backendState, setBackendState] = useState<"loading" | "ready" | "error">("loading");
  const [backendError, setBackendError] = useState<string | null>(null);

  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rainfall, setRainfall] = useState(0);
  const [rainfallDirty, setRainfallDirty] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [ttsActive, setTtsActive] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [notifyStatus, setNotifyStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [riskScores, setRiskScores] = useState<Record<string, number>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clock = useClock();
  const t = LABELS[lang];
  const meta: DatasetMeta = computeDatasetMeta(villages);

  const fetchVillageList = useCallback(async () => {
    setBackendState("loading");
    setBackendError(null);
    try {
      const list = await loadVillages();
      setVillages(list);
      setBackendState("ready");
    } catch (e) {
      setBackendError(e instanceof ApiError ? e.message : "Failed to load villages.");
      setBackendState("error");
    }
  }, []);

  useEffect(() => { fetchVillageList(); }, [fetchVillageList]);
  useEffect(() => { setTtsError(null); }, [lang, selectedVillage]);

  const doPrediction = useCallback(async (village: Village, override?: number) => {
    setLoading(true);
    setPredictionError(null);
    try {
      const result = await runPrediction(village, override != null ? { rainfallOverrideMm: override } : undefined);
      setPrediction(result);
      setRiskScores((prev) => ({ ...prev, [village.id]: result.riskScore }));
      if (override == null) setRainfall(result.rawFeatures.Rainfall_CHIRPS_mm);
    } catch (e) {
      setPrediction(null);
      setPredictionError(e instanceof ApiError ? e.message : "Prediction failed.");
    }
    setLoading(false);
  }, []);

  const handleSelectVillage = useCallback((village: Village) => {
    setSelectedVillage(village);
    setRainfallDirty(false);
    setPrediction(null);
    doPrediction(village);
  }, [doPrediction]);

  const handleSelectById = (id: string) => {
    const v = villages.find((x) => x.id === id);
    if (v) { handleSelectVillage(v); setPage("dashboard"); }
  };

  const handleRainfallChange = (val: number) => {
    setRainfall(val);
    setRainfallDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (selectedVillage) doPrediction(selectedVillage, val);
    }, 350);
  };

  const handleScoresUpdate = useCallback((updates: Record<string, number>) => {
    setRiskScores((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleTTS = async () => {
    if (!prediction || !selectedVillage) return;
    if (ttsActive) { window.speechSynthesis.cancel(); setTtsActive(false); return; }
    setTtsError(null);

    const text = generateAdvisory(selectedVillage, prediction, lang);
    const utt = new SpeechSynthesisUtterance(text);

    if (lang === "mr") {
      const voices = await loadVoices();
      const mrVoice = voices.find((v) => v.lang.toLowerCase().startsWith("mr"));
      if (!mrVoice) {
        setTtsError("या डिव्हाइसवर मराठी आवाज उपलब्ध नाही. / No Marathi voice available on this device.");
        return;
      }
      utt.voice = mrVoice;
      utt.lang = mrVoice.lang;
    } else {
      utt.lang = "en-IN";
    }

    utt.onend = () => setTtsActive(false);
    window.speechSynthesis.speak(utt);
    setTtsActive(true);
  };

  const handleNotify = async () => {
    if (!selectedVillage || !prediction) return;
    setNotifyStatus("sending");
    const msg = `Sahyadri Sentinel: ${selectedVillage.name} — Live risk ${prediction.riskScore.toFixed(0)}% [${prediction.riskLevel}]. ${generateAdvisory(selectedVillage, prediction, "en").slice(0, 180)}`;
    try {
      const ntfyTopic = import.meta.env.VITE_NTFY_TOPIC || "sahyadri-sentinel-demo";
      const res = await fetch(`https://ntfy.sh/${ntfyTopic}`, {
        method: "POST", body: msg,
        headers: { Title: `Sahyadri Sentinel: ${selectedVillage.name}`, Priority: prediction.riskScore >= 72 ? "urgent" : "high", Tags: "warning,landslide" },
      });
      setNotifyStatus(res.ok ? "sent" : "error");
    } catch (_) { setNotifyStatus("error"); }
    setTimeout(() => setNotifyStatus("idle"), 4000);
  };

  const advisory        = prediction && selectedVillage ? generateAdvisory(selectedVillage, prediction, lang) : null;
  const forecastRising  = prediction?.earlyWarning.triggered ?? false;
  const sliderPct        = Math.round((rainfall / RAINFALL_SLIDER_MAX) * 100);

  // ── Backend not reachable — honest fallback state, no fake data ─────────────
  if (backendState !== "ready") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5 text-center" style={{ background: "var(--color-bg)" }}>
        <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: "var(--color-accent)", borderRadius: 3 }}>
          <AlertTriangle size={20} style={{ color: "#fff" }} />
        </div>
        {backendState === "loading" ? (
          <>
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
            <div className="text-sm" style={{ color: "var(--color-text-dim)" }}>Connecting to prediction backend…</div>
          </>
        ) : (
          <>
            <div className="font-display font-semibold" style={{ color: "var(--color-text)" }}>Backend not reachable</div>
            <div className="text-sm max-w-md" style={{ color: "var(--color-text-dim)" }}>{backendError}</div>
            <div className="text-xs font-mono-data max-w-md" style={{ color: "var(--color-muted)" }}>
              Start it with: <code>python app.py</code> in the backend folder, then retry.
            </div>
            <button
              className="mt-2 px-4 py-2 text-sm font-display font-semibold flex items-center gap-2 btn-lime"
              style={{ borderRadius: 4 }}
              onClick={fetchVillageList}
            >
              <RefreshCw size={13} /> Retry
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-bg)" }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header style={{ background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" }}>
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <PeakSignalLogo size={46} style={{ flexShrink: 0 }} />
            <div>
              <div className="font-display font-bold text-sm leading-none" style={{ color: "var(--color-text)" }}>{t.title}</div>
              <div className="text-xs mt-0.5 hidden sm:block" style={{ color: "var(--color-muted)" }}>{t.subtitle}</div>
            </div>
            {/* Live indicator */}
            <div className="hidden sm:flex items-center gap-1.5 ml-3">
              <span className="w-1.5 h-1.5 rounded-full blink" style={{ background: "#16a34a" }} />
              <span className="text-xs font-mono-data" style={{ color: "#16a34a" }}>Live</span>
              <span className="text-xs font-mono-data ml-1" style={{ color: "var(--color-muted)" }}>
                {clock.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} IST
              </span>
            </div>
          </div>
          {/* Controls */}
          <div className="flex items-center gap-2">
            <HeaderBtn onClick={() => setViewMode((m) => m === "public" ? "admin" : "public")}>
              {viewMode === "public" ? <><Eye size={12} /> <span className="hidden sm:inline">{t.adminView}</span></> : <><EyeOff size={12} /> <span className="hidden sm:inline">{t.publicView}</span></>}
            </HeaderBtn>
            <HeaderBtn onClick={() => setLang((l) => l === "en" ? "mr" : "en")}>
              <Globe size={12} /> {lang === "en" ? "मराठी" : "English"}
            </HeaderBtn>
          </div>
        </div>

        {/* Nav */}
        <div className="max-w-7xl mx-auto px-5 flex">
          {([
            { id: "dashboard", label: t.dashboard },
            { id: "map",       label: t.map },
            { id: "alerts",    label: t.alerts },
            ...(viewMode === "admin" ? [{ id: "model", label: t.model }] : []),
          ] as { id: Page; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPage(tab.id)}
              className="px-4 py-2.5 text-sm transition-colors"
              style={{
                color: page === tab.id ? "var(--color-accent)" : "var(--color-muted)",
                borderBottom: page === tab.id ? "2px solid var(--color-accent)" : "2px solid transparent",
                fontFamily: "var(--font-body)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-5">

        {/* DASHBOARD */}
        {page === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-5">

            {/* Left column */}
            <div className="space-y-4">
              {/* Village search */}
              <Card>
                <SectionLabel>{lang === "mr" ? "गाव निवडा" : "Village"}</SectionLabel>
                <VillageSearch villages={villages} meta={meta} selected={selectedVillage} onSelect={handleSelectVillage} lang={lang} />
              </Card>

              {/* Stat boxes — real terrain values from the backend's features_used, once a prediction has run */}
              {selectedVillage && prediction && (
                <Card>
                  <SectionLabel>{lang === "mr" ? "गाव माहिती" : "Site characteristics"}</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: t.elevation,    val: `${prediction.rawFeatures.Elevation_m} m` },
                      { label: t.slope,        val: `${prediction.rawFeatures.Slope_deg}°` },
                      { label: t.vegetation,   val: prediction.rawFeatures.NDVI_Vegetation.toFixed(2) },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ background: "var(--color-panel)", borderRadius: 3, padding: "10px 12px" }}>
                        <div className="text-xs" style={{ color: "var(--color-muted)" }}>{label}</div>
                        <div className="font-mono-data font-semibold mt-0.5" style={{ fontSize: 15, color: "var(--color-text)" }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Rainfall slider */}
              {selectedVillage && (
                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <Droplets size={12} style={{ color: "#3b82f6" }} />
                      <span className="text-sm font-display font-semibold" style={{ color: "var(--color-text)" }}>{viewMode === "admin" ? t.rainfallLabel : t.rainfallLabelPlain}</span>
                    </div>
                    <span className="font-mono-data font-semibold" style={{ fontSize: 15, color: rainfallDirty ? "var(--color-accent)" : "#3b82f6" }}>
                      {Math.round(rainfall)} mm
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={RAINFALL_SLIDER_MAX} value={rainfall}
                    onChange={(e) => handleRainfallChange(Number(e.target.value))}
                    className="w-full"
                    style={{ "--pct": `${sliderPct}%` } as React.CSSProperties}
                  />
                  <div className="flex justify-between mt-1" style={{ fontSize: 11, color: "var(--color-muted)", fontFamily: "var(--font-mono)" }}>
                    <span>0</span><span>{RAINFALL_SLIDER_MAX / 2}</span><span>{RAINFALL_SLIDER_MAX} mm</span>
                  </div>
                </Card>
              )}

              {/* Run Prediction */}
              {selectedVillage && (
                <button
                  className="w-full py-2.5 text-sm font-display font-semibold flex items-center justify-center gap-2 btn-lime"
                  style={{ borderRadius: 4 }}
                  onClick={() => selectedVillage && doPrediction(selectedVillage, rainfallDirty ? rainfall : undefined)}
                  disabled={loading}
                >
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" /> {t.predicting}</>
                    : <>{t.predict} <ChevronRight size={14} /></>
                  }
                </button>
              )}

              {/* Actions */}
              {prediction && selectedVillage && (
                <Card>
                  <SectionLabel>Actions</SectionLabel>
                  <div className="space-y-2">
                    <OutlineBtn icon={ttsActive ? <VolumeX size={13} /> : <Volume2 size={13} />} onClick={handleTTS} active={ttsActive}>
                      {t.tts}{ttsActive ? " — playing" : ""}
                    </OutlineBtn>
                    {ttsError && (
                      <div className="text-xs px-1" style={{ color: "#dc2626" }}>{ttsError}</div>
                    )}
                    <OutlineBtn icon={<Send size={13} />} onClick={handleNotify} disabled={notifyStatus === "sending"}>
                      {notifyStatus === "sending" ? "Sending…" : notifyStatus === "sent" ? "✓ Sent via ntfy.sh" : notifyStatus === "error" ? "✗ Failed" : t.notify}
                    </OutlineBtn>
                    <button
                      className="w-full py-2 px-3 text-sm flex items-center gap-2 transition-colors"
                      style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", color: "#dc2626", borderRadius: 3, fontFamily: "var(--font-body)" }}
                      onMouseOver={(e) => (e.currentTarget.style.background = "rgba(220,38,38,0.11)")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "rgba(220,38,38,0.06)")}
                      onClick={() => setShowAlert(true)}
                    >
                      <AlertTriangle size={13} /> {t.alertSim}
                    </button>
                  </div>
                </Card>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {selectedVillage ? (
                <>
                  {/* Prediction error — honest fallback instead of crashing or faking a score */}
                  {predictionError && (
                    <div className="flex items-start gap-3 px-4 py-3" style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 4 }}>
                      <AlertTriangle size={14} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
                      <div className="text-sm" style={{ color: "#dc2626" }}>{predictionError}</div>
                    </div>
                  )}

                  {/* Risk result card */}
                  <div
                    style={{
                      background: prediction ? getRiskBg(prediction.riskScore) : "var(--color-surface)",
                      border: `1px solid ${prediction ? getRiskBorderColor(prediction.riskScore) : "var(--color-border)"}`,
                      borderRadius: 4,
                      padding: "20px",
                      transition: "all 0.3s ease",
                    }}
                  >
                    <div className="flex flex-col sm:flex-row items-start gap-5">
                      <RiskGauge
                        score={prediction?.riskScore ?? 0}
                        rfScore={prediction?.rfScore ?? 0}
                        etScore={prediction?.etScore ?? 0}
                        loading={loading}
                        showBreakdown={viewMode === "admin"}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold text-xl leading-tight" style={{ color: "var(--color-text)" }}>
                          {selectedVillage.name}
                        </div>
                        <div className="text-xs font-mono-data mt-0.5" style={{ color: "var(--color-muted)" }}>
                          {selectedVillage.lat.toFixed(3)}°N {selectedVillage.lng.toFixed(3)}°E
                        </div>
                        {prediction && !loading && (
                          <>
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                              <span
                                className="font-mono-data font-semibold"
                                style={{ fontSize: 13, color: getRiskColor(prediction.riskScore), background: `${getRiskColor(prediction.riskScore)}18`, border: `1px solid ${getRiskColor(prediction.riskScore)}40`, borderRadius: 3, padding: "2px 8px" }}
                              >
                                {getRiskLabel(prediction.riskScore, lang).toUpperCase()}
                              </span>
                              {viewMode === "admin" && (
                                <>
                                  <span className="text-xs font-mono-data" style={{ color: "var(--color-muted)" }}>
                                    {t.modelAgreement}: {prediction.modelAgreement}%
                                  </span>
                                  <span className="text-xs font-mono-data" style={{ color: "var(--color-muted)" }}>
                                    Model call: <span style={{ color: prediction.backendRiskLabel === "HIGH RISK" ? "#dc2626" : "#16a34a" }}>{prediction.backendRiskLabel}</span> (@{prediction.thresholdUsed})
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="mt-2 text-xs" style={{ color: "var(--color-muted)", fontStyle: "italic" }}>
                              {viewMode === "admin"
                                ? <>Live prediction · {prediction.rainfallInfo.source === "live_api" ? "live rainfall" : prediction.rainfallInfo.source === "manual_slider_override" ? "manual rainfall override" : "historical rainfall fallback"}</>
                                : <>{prediction.rainfallInfo.used_fallback
                                    ? (lang === "mr" ? "अंदाजे पावसाची आकडेवारी वापरली" : "Using estimated rainfall data")
                                    : prediction.rainfallInfo.source === "manual_slider_override"
                                      ? (lang === "mr" ? "तुम्ही ठरवलेल्या पावसावर आधारित" : "Based on your what-if rainfall value")
                                      : (lang === "mr" ? "लाइव्ह हवामान डेटावर आधारित" : "Based on live weather data")}
                                  </>
                              }
                            </div>
                          </>
                        )}
                        {selectedVillage.riskSite && (
                          <div className="mt-2 text-xs font-mono-data" style={{ color: "#dc2626" }}>
                            {viewMode === "admin"
                              ? "● Documented risk site in training dataset"
                              : (lang === "mr" ? "● या भागात याआधी भूस्खलन घडले आहे" : "● A landslide has happened here before")
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rainfall timeline — historical baseline vs today's live rainfall vs next-24h forecast, front and center */}
                  {prediction && (
                    <RainfallTimeline
                      historicalMm={prediction.historicalRainfallMm}
                      currentMm={prediction.rainfallInfo.current_mm}
                      forecastMm={prediction.rainfallInfo.forecast_mm}
                      currentSource={prediction.rainfallInfo.source}
                      rising={forecastRising}
                      lang={lang}
                    />
                  )}

                  {/* 24h forecast warning — always shown once a prediction lands, styled by the backend's own early-warning check */}
                  {prediction && (
                    <div
                      className="flex items-start gap-3 px-4 py-3"
                      style={forecastRising
                        ? { background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 4 }
                        : { background: "rgba(22,163,74,0.05)", border: "1px solid rgba(22,163,74,0.2)", borderRadius: 4 }
                      }
                    >
                      <AlertTriangle size={14} style={{ color: forecastRising ? "#dc2626" : "#16a34a", flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <div className="text-sm font-display font-semibold" style={{ color: forecastRising ? "#dc2626" : "#16a34a" }}>
                          {t.earlyWarning}
                        </div>
                        <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
                          {prediction.earlyWarning.message}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Feature importance — technical detail, hidden in Citizen View (AI Advisory below already gives the plain-language reason) */}
                  {prediction && viewMode === "admin" && (
                    <Card>
                      <SectionLabel>{t.whyTitle}</SectionLabel>
                      <FactorBars factors={prediction.factors} lang={lang} />
                    </Card>
                  )}

                  {/* AI Advisory */}
                  {advisory && prediction && (
                    <Card>
                      <SectionLabel>{t.advisoryTitle}</SectionLabel>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-dim)" }}>{advisory}</p>
                      <div
                        className="mt-3 pt-3 text-xs font-mono-data"
                        style={{ color: "var(--color-muted)", borderTop: "1px solid var(--color-border-light)" }}
                      >
                        {viewMode === "admin"
                          ? <>{new Date(prediction.timestamp).toLocaleTimeString("en-IN")} · RF/ET agreement {prediction.modelAgreement}% · AUC-ROC 0.854</>
                          : new Date(prediction.timestamp).toLocaleTimeString("en-IN")
                        }
                      </div>
                    </Card>
                  )}
                </>
              ) : (
                <div
                  className="flex flex-col items-center justify-center text-center"
                  style={{ minHeight: 320, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4 }}
                >
                  <Map size={32} style={{ color: "var(--color-border)", marginBottom: 12 }} />
                  <div className="text-sm font-display font-semibold" style={{ color: "var(--color-text-dim)" }}>{t.noVillage}</div>
                  <div className="text-xs mt-1.5 font-mono-data" style={{ color: "var(--color-muted)" }}>
                    {meta.total} {lang === "mr" ? "गावे · महाराष्ट्र" : "villages · Maharashtra"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RISK MAP */}
        {page === "map" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-display font-semibold" style={{ color: "var(--color-text)" }}>
                {lang === "mr" ? "जोखीम नकाशा" : "Risk map"}
              </div>
              <div className="text-xs font-mono-data" style={{ color: "var(--color-muted)" }}>
                {lang === "mr" ? "मार्कर क्लिक करा = अंदाज चालवा" : "Click a marker to run a live prediction"}
              </div>
            </div>
            <LeafletMap
              riskScores={riskScores}
              villages={villages}
              selectedVillage={selectedVillage}
              onSelectVillage={(v) => { handleSelectVillage(v); setPage("dashboard"); }}
              lang={lang}
            />
          </div>
        )}

        {/* ALERT CENTER */}
        {page === "alerts" && (
          <AlertCenter villages={villages} meta={meta} riskScores={riskScores} onScoresUpdate={handleScoresUpdate} onSelectVillage={handleSelectById} lang={lang} />
        )}

        {/* MODEL FACTORS — admin only */}
        {page === "model" && viewMode === "admin" && (
          <ModelFactors lang={lang} meta={meta} />
        )}
      </main>

      {showAlert && selectedVillage && prediction && (
        <EmergencyAlert village={selectedVillage} riskScore={prediction.riskScore} onClose={() => setShowAlert(false)} lang={lang} />
      )}
    </div>
  );
}

// ── Small shared button primitives ───────────────────────────────────────────
function HeaderBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors"
      style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", color: "var(--color-text-dim)", borderRadius: 3, fontFamily: "var(--font-body)" }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--color-accent)")}
      onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--color-border)")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function OutlineBtn({ icon, onClick, active, disabled, children }: {
  icon: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      className="w-full py-2 px-3 text-sm flex items-center gap-2 transition-all"
      style={{
        background: active ? "rgba(45,140,68,0.08)" : "var(--color-panel)",
        border: `1px solid ${active ? "rgba(45,140,68,0.3)" : "var(--color-border)"}`,
        color: active ? "var(--color-accent)" : "var(--color-text-dim)",
        borderRadius: 3,
        fontFamily: "var(--font-body)",
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {icon} {children}
    </button>
  );
}
