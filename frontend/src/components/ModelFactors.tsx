import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { DatasetMeta } from "../data/villages";

interface Props { lang: "en" | "mr"; meta: DatasetMeta; }

// Real model performance metrics. AUC and the threshold come straight from
// the trained TRUE_FINAL bundle (backend/app.py prints them at startup).
// Recall, Precision, F1, and the confusion matrix below were computed
// independently — the bundle only stores AUC — by running a fresh 5-fold
// Stratified CV with the exact saved hyperparameters (random_state=42) and
// pooling out-of-fold predictions at the bundle's own 0.4 threshold. That
// CV run's own AUC came out to 0.855, matching the bundle's 0.854, which is
// the cross-check that this methodology is a fair stand-in for "the
// model's real performance" even without access to the original held-out
// split.
const METRICS = [
  { label: "AUC-ROC",   value: "0.854", note: "Good discrimination",       color: "#16a34a" },
  { label: "Recall",    value: "91%",   note: "Sensitivity on risk sites",  color: "#16a34a" },
  { label: "Precision", value: "56%",   note: "Of HIGH RISK calls, correct", color: "#d97706" },
  { label: "F1 Score",  value: "0.69",  note: "Precision–recall balance", color: "#d97706" },
  { label: "Threshold", value: "0.40",  note: "Cutoff for HIGH RISK",       color: "#6b9474" },
];

// [[TN, FP], [FN, TP]] from that same out-of-fold CV run, at threshold 0.4
const CONFUSION_MATRIX = { tn: 212, fp: 113, fn: 14, tp: 141 };

// Real averaged RF+ET feature_importances_ from the trained 11-feature model
const IMPORTANCE = [
  { name: "Elevation",   pct: 22.2 },
  { name: "Rainfall",    pct: 21.6 },
  { name: "3-Day Rain",  pct: 15.6 },
  { name: "7-Day Rain",  pct: 11.0 },
  { name: "NDVI",        pct: 5.5  },
  { name: "Roughness",   pct: 5.5  },
  { name: "Road Dist.",  pct: 4.0  },
  { name: "Slope",       pct: 4.0  },
  { name: "River Dist.", pct: 3.9  },
  { name: "Aspect",      pct: 3.4  },
  { name: "Curvature",   pct: 3.3  },
];

const tooltipStyle = {
  contentStyle: { background: "#fff", border: "1px solid var(--color-border)", borderRadius: 4, fontSize: 11, color: "var(--color-text)" },
  cursor: { fill: "rgba(0,0,0,0.03)" },
};

export default function ModelFactors({ lang, meta }: Props) {
  const MODEL_INFO = [
    ["Algorithm",     "Random Forest + Extra Trees ensemble (averaged probability)"],
    ["Training data", "CHIRPS satellite rainfall (current + 3-day/7-day cumulative) + SRTM 30m DEM + OpenStreetMap roads/rivers + satellite NDVI vegetation index"],
    ["Dataset",       `${meta.total} villages · ${meta.riskSites} documented risk sites · ${meta.safePoints} safe points`],
    ["Validation",    "5-fold Stratified Cross-Validation"],
    ["Inference",     "Live on village selection, no caching"],
  ];

  return (
    <div className="space-y-6">
      {/* Performance metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {METRICS.map(({ label, value, note, color }) => (
          <div key={label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "16px" }}>
            <div className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>{label}</div>
            <div className="font-display font-black text-2xl" style={{ color, lineHeight: 1 }}>{value}</div>
            <div className="text-xs mt-1.5 leading-snug" style={{ color: "var(--color-muted)" }}>{note}</div>
          </div>
        ))}
      </div>

      <div className="text-xs p-3" style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 4, color: "var(--color-text-dim)" }}>
        <strong style={{ color: "#d97706" }}>On precision and imbalance: </strong>
        {lang === "mr"
          ? `भूस्खलन घटना दुर्मिळ असल्याने (${meta.riskSites} vs ${meta.safePoints}), recall जास्त ठेवणे अधिक महत्त्वाचे — चुकीचे इशारे, चुकलेल्या घटनांपेक्षा चांगले. यामुळे खोटे इशारे वाढतात (precision 56%) — तो जाणीवपूर्वक tradeoff आहे.`
          : `With ${meta.riskSites} risk sites vs ${meta.safePoints} safe points, maximising recall is deliberate — false positive warnings are far preferable to missed events. That trade costs precision (56%) on purpose.`
        }
      </div>

      {/* Confusion matrix */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "20px" }}>
        <div className="text-sm font-display font-semibold mb-1" style={{ color: "var(--color-text)" }}>
          {lang === "mr" ? "कन्फ्यूजन मॅट्रिक्स" : "Confusion Matrix"}
        </div>
        <div className="text-xs mb-4" style={{ color: "var(--color-muted)" }}>
          {lang === "mr" ? "५-फोल्ड आउट-ऑफ-फोल्ड अंदाज, थ्रेशोल्ड @0.4, एकूण ४८० गावे" : "5-fold out-of-fold predictions, threshold @0.4, all 480 villages"}
        </div>
        <div className="flex gap-3 items-start">
          <div className="flex flex-col items-center justify-center" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            <span className="text-xs font-mono-data font-semibold" style={{ color: "var(--color-muted)" }}>
              {lang === "mr" ? "प्रत्यक्ष" : "ACTUAL"}
            </span>
          </div>
          <div>
            <div className="grid gap-1" style={{ gridTemplateColumns: "90px 100px 100px" }}>
              <div />
              <div className="text-xs font-mono-data text-center" style={{ color: "var(--color-muted)" }}>{lang === "mr" ? "सुरक्षित" : "No Risk"}</div>
              <div className="text-xs font-mono-data text-center" style={{ color: "var(--color-muted)" }}>{lang === "mr" ? "धोका" : "Risk"}</div>

              <div className="text-xs font-mono-data flex items-center" style={{ color: "var(--color-muted)" }}>{lang === "mr" ? "सुरक्षित" : "No Risk"}</div>
              <div className="text-center py-3" style={{ background: "rgba(22,163,74,0.12)", borderRadius: 3 }}>
                <div className="font-display font-black text-xl" style={{ color: "#16a34a" }}>{CONFUSION_MATRIX.tn}</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>TN</div>
              </div>
              <div className="text-center py-3" style={{ background: "rgba(217,119,6,0.10)", borderRadius: 3 }}>
                <div className="font-display font-black text-xl" style={{ color: "#d97706" }}>{CONFUSION_MATRIX.fp}</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>FP</div>
              </div>

              <div className="text-xs font-mono-data flex items-center" style={{ color: "var(--color-muted)" }}>{lang === "mr" ? "धोका" : "Risk"}</div>
              <div className="text-center py-3" style={{ background: "rgba(220,38,38,0.10)", borderRadius: 3 }}>
                <div className="font-display font-black text-xl" style={{ color: "#dc2626" }}>{CONFUSION_MATRIX.fn}</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>FN</div>
              </div>
              <div className="text-center py-3" style={{ background: "rgba(22,163,74,0.12)", borderRadius: 3 }}>
                <div className="font-display font-black text-xl" style={{ color: "#16a34a" }}>{CONFUSION_MATRIX.tp}</div>
                <div className="text-xs" style={{ color: "var(--color-muted)" }}>TP</div>
              </div>
            </div>
            <div className="text-xs font-mono-data text-center mt-2" style={{ color: "var(--color-muted)" }}>
              {lang === "mr" ? "अंदाज →" : "PREDICTED →"}
            </div>
          </div>
        </div>
        <div className="text-xs mt-3 leading-relaxed" style={{ color: "var(--color-text-dim)" }}>
          {lang === "mr"
            ? `${CONFUSION_MATRIX.fn} पैकी १५५ खऱ्या धोक्याच्या घटना चुकल्या (FN) — कमी ठेवण्याचा प्रयत्न, कारण चुकलेली घटना जास्त धोकादायक आहे. त्या बदल्यात ${CONFUSION_MATRIX.fp} खोटे इशारे (FP) आले.`
            : `Only ${CONFUSION_MATRIX.fn} of 155 real risk sites were missed (FN) — kept deliberately low, since a missed event is far worse than a false alarm. The trade-off is ${CONFUSION_MATRIX.fp} false alarms (FP).`
          }
        </div>
      </div>

      {/* Feature importance chart */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "20px" }}>
        <div className="text-sm font-display font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          {lang === "mr" ? "वैशिष्ट्य महत्व" : "Feature importance"}
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={IMPORTANCE} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b9474", fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#6b9474", fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, "Weight"]} />
            <Bar dataKey="pct" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Model information */}
      <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "20px" }}>
        <div className="text-sm font-display font-semibold mb-4" style={{ color: "var(--color-text)" }}>
          {lang === "mr" ? "मॉडेल माहिती" : "Model information"}
        </div>
        <div className="space-y-3">
          {MODEL_INFO.map(([k, v]) => (
            <div key={k} className="grid gap-x-6" style={{ gridTemplateColumns: "140px 1fr" }}>
              <span className="text-xs font-mono-data" style={{ color: "var(--color-muted)" }}>{k}</span>
              <span className="text-xs leading-snug" style={{ color: "var(--color-text-dim)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
