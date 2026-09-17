import { ChevronRight } from "../icons";

interface Props {
  historicalMm: number | null;
  currentMm: number;
  forecastMm: number;
  currentSource: string; // rainfall_info.source — "live_api" | "manual_slider_override" | "historical_chirps_average_fallback"
  rising: boolean; // early_warning.triggered from the backend
  lang: "en" | "mr";
}

function ArrowIcon({ direction, color }: { direction: "up" | "down" | "flat"; color: string }) {
  const rotation = direction === "up" ? -90 : direction === "down" ? 90 : 0;
  return (
    <span style={{ display: "inline-flex", transform: `rotate(${rotation}deg)`, color }}>
      <ChevronRight size={14} />
    </span>
  );
}

const CURRENT_SUB: Record<string, { en: string; mr: string }> = {
  live_api: { en: "Live, last hour", mr: "लाइव्ह, मागील तास" },
  manual_slider_override: { en: "What-if value", mr: "जर-तर मूल्य" },
  historical_chirps_average_fallback: { en: "Estimated (live data unavailable)", mr: "अंदाजे (लाइव्ह डेटा अनुपलब्ध)" },
};

export default function RainfallTimeline({ historicalMm, currentMm, forecastMm, currentSource, rising, lang }: Props) {
  const diff = forecastMm - currentMm;
  const direction: "up" | "down" | "flat" = diff > 2 ? "up" : diff < -2 ? "down" : "flat";
  const forecastColor = direction === "up" ? (rising ? "#dc2626" : "#d97706") : direction === "down" ? "#16a34a" : "var(--color-muted)";
  const currentSub = CURRENT_SUB[currentSource] ?? CURRENT_SUB.live_api;

  const cards = [
    {
      key: "historical",
      label: lang === "mr" ? "सर्वसाधारण" : "HISTORICAL",
      sub: lang === "mr" ? "सर्वसाधारण पावसाळी पाऊस" : "Typical monsoon rainfall",
      value: historicalMm != null ? Math.round(historicalMm) : null,
      color: "var(--color-text)",
    },
    {
      key: "current",
      label: lang === "mr" ? "सद्य" : "CURRENT",
      sub: lang === "mr" ? currentSub.mr : currentSub.en,
      value: Math.round(currentMm),
      color: "var(--color-text)",
    },
    {
      key: "forecast",
      label: lang === "mr" ? "पुढील २४ तास" : "FORECAST",
      sub: lang === "mr" ? "पुढील २४ तासांचा अंदाज" : "Next 24 hours",
      value: Math.round(forecastMm),
      color: forecastColor,
    },
  ];

  return (
    <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "16px" }}>
      <div className="text-sm font-display font-semibold mb-3" style={{ color: "var(--color-text)" }}>
        {lang === "mr" ? "पावसाची टाइमलाइन" : "Rainfall Timeline"}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.key} style={{ background: "var(--color-panel)", borderRadius: 3, padding: "12px 14px" }}>
            <div className="text-xs font-mono-data font-semibold" style={{ color: "var(--color-muted)", letterSpacing: "0.05em" }}>
              {c.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-display font-black" style={{ fontSize: 24, color: c.color, lineHeight: 1 }}>
                {c.value != null ? c.value : "—"}
              </span>
              <span className="text-xs font-mono-data" style={{ color: "var(--color-muted)" }}>mm</span>
              {c.key === "forecast" && c.value != null && (
                <ArrowIcon direction={direction} color={forecastColor} />
              )}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--color-text-dim)" }}>{c.sub}</div>
          </div>
        ))}
      </div>
      {direction === "up" && (
        <div className="mt-3 text-xs" style={{ color: forecastColor }}>
          {rising
            ? (lang === "mr" ? "⚠ पाऊस वाढण्याची शक्यता — धोका वाढू शकतो." : "⚠ Rain is expected to increase — risk may rise.")
            : (lang === "mr" ? "पाऊस वाढण्याची शक्यता, पण धोक्यावर मोठा परिणाम नाही." : "Rain is expected to increase, but not enough to meaningfully raise risk.")
          }
        </div>
      )}
    </div>
  );
}
