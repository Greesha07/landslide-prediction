import { getRiskColor } from "../utils/prediction";

interface Props {
  score: number;
  rfScore: number;
  etScore: number;
  loading: boolean;
  showBreakdown?: boolean;
}

export default function RiskGauge({ score, rfScore, etScore, loading, showBreakdown = true }: Props) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = getRiskColor(score);

  return (
    <div className="flex items-center gap-4">
      {/* Gauge */}
      <div className="relative flex-shrink-0" style={{ width: 108, height: 108 }}>
        <svg width="108" height="108" viewBox="0 0 108 108" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="54" cy="54" r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
          <circle
            cx="54" cy="54" r={r} fill="none"
            stroke={loading ? "var(--color-border)" : color}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={loading ? circ * 0.75 : offset}
            style={{ transition: "stroke-dashoffset 0.55s ease, stroke 0.25s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {loading
            ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-accent)" }} />
            : <>
                <span className="font-display font-black leading-none" style={{ fontSize: 26, color }}>{score.toFixed(0)}</span>
                <span className="font-mono-data" style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 1 }}>%</span>
              </>
          }
        </div>
      </div>

      {/* RF / ET sub-scores — technical detail, hidden in Citizen View */}
      {showBreakdown && !loading && (rfScore > 0 || etScore > 0) && (
        <div className="space-y-2">
          {[["RF", rfScore], ["ET", etScore]].map(([label, val]) => (
            <div key={label as string}>
              <div className="flex items-center justify-between mb-0.5 gap-3">
                <span className="font-mono-data text-xs" style={{ color: "var(--color-muted)" }}>{label as string}</span>
                <span className="font-mono-data text-xs font-medium" style={{ color: getRiskColor(val as number) }}>{(val as number).toFixed(0)}%</span>
              </div>
              <div style={{ width: 80, height: 3, background: "var(--color-border)", borderRadius: 2 }}>
                <div style={{ width: `${val}%`, height: "100%", background: getRiskColor(val as number), borderRadius: 2, transition: "width 0.5s ease" }} />
              </div>
            </div>
          ))}
          <div className="text-xs" style={{ color: "var(--color-muted)", fontSize: 10, marginTop: 2 }}>
            Ensemble avg.
          </div>
        </div>
      )}
    </div>
  );
}
