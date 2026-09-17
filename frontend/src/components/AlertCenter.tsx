import { useState } from "react";
import type { Village, DatasetMeta } from "../data/villages";
import { runPrediction, getRiskColor, getRiskLabel } from "../utils/prediction";

interface Props {
  villages: Village[];
  meta: DatasetMeta;
  riskScores: Record<string, number>;
  onScoresUpdate: (updates: Record<string, number>) => void;
  onSelectVillage: (id: string) => void;
  lang: "en" | "mr";
}

// Each prediction can trigger up to 2 OpenWeatherMap calls server-side
// (current + forecast) when no rainfall override is supplied — which is
// always true here. OpenWeatherMap's free tier caps out around 60 calls/
// minute, so this batch size and pacing keeps a full click safely under
// that (2 concurrent x 2 calls, one batch every 4.5s ≈ ~53 calls/min) and
// bounds worst-case latency instead of firing all 480 at once.
const BATCH_SIZE = 50;
const CONCURRENCY = 2;
const BATCH_DELAY_MS = 4500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AlertCenter({ villages, meta, riskScores, onScoresUpdate, onSelectVillage, lang }: Props) {
  const [bulkState, setBulkState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTarget, setBulkTarget] = useState(0);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const sorted = [...villages].sort((a, b) => (riskScores[b.id] ?? -1) - (riskScores[a.id] ?? -1));
  const scored = sorted.filter((v) => riskScores[v.id] != null);
  const remaining = villages.length - scored.length;
  const critical = scored.filter((v) => (riskScores[v.id] ?? 0) >= 72);
  const high     = scored.filter((v) => { const s = riskScores[v.id] ?? 0; return s >= 50 && s < 72; });
  const medium   = scored.filter((v) => { const s = riskScores[v.id] ?? 0; return s >= 28 && s < 50; });

  async function loadNextBatch() {
    setBulkState("loading");
    setBulkError(null);
    setBulkProgress(0);
    const pending = villages.filter((v) => riskScores[v.id] == null).slice(0, BATCH_SIZE);
    setBulkTarget(pending.length);
    let done = 0;
    let succeeded = 0;

    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map((v) => runPrediction(v)));
      const updates: Record<string, number> = {};
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") updates[batch[idx].id] = r.value.riskScore;
      });
      succeeded += Object.keys(updates).length;
      if (Object.keys(updates).length) onScoresUpdate(updates);
      done += batch.length;
      setBulkProgress(done);
      if (i + CONCURRENCY < pending.length) await sleep(BATCH_DELAY_MS);
    }

    if (succeeded === 0 && pending.length > 0) {
      setBulkError(lang === "mr" ? "बॅकएंडशी संपर्क साधता आला नाही." : "Could not reach the backend for one or more predictions.");
      setBulkState("error");
    } else {
      setBulkState("done");
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs" style={{ color: "var(--color-muted)", fontStyle: "italic" }}>
        {lang === "mr"
          ? `${meta.total} गावांपैकी ${scored.length} साठी लाइव्ह अंदाज मोजले`
          : `Live predictions computed for ${scored.length} of ${meta.total} villages`
        }
      </p>

      {/* Four stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: lang === "mr" ? "अत्यंत धोका"  : "Critical",      count: critical.length, color: "#dc2626" },
          { label: lang === "mr" ? "उच्च धोका"    : "High risk",     count: high.length,     color: "#d97706" },
          { label: lang === "mr" ? "मध्यम धोका"   : "Medium risk",   count: medium.length,   color: "#ca8a04" },
          { label: lang === "mr" ? "मोजलेली गावे" : "Scored",        count: scored.length,   color: "var(--color-accent)" },
        ].map(({ label, count, color }) => (
          <div key={label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "16px" }}>
            <div className="font-display font-black text-3xl" style={{ color, lineHeight: 1 }}>{count}</div>
            <div className="text-xs mt-1.5" style={{ color: "var(--color-muted)" }}>{label}</div>
            {color === "#dc2626" && count > 0 && (
              <div className="mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full pulse-red inline-block" style={{ background: "#dc2626" }} />
                <span className="text-xs font-mono-data" style={{ color: "#dc2626" }}>Active</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Load rankings, bounded to BATCH_SIZE villages per click */}
      {remaining > 0 && (
        <div>
          <button
            className="px-4 py-2 text-sm font-display font-semibold flex items-center gap-2"
            style={{ background: "var(--color-accent)", color: "#fff", borderRadius: 4, border: "none", opacity: bulkState === "loading" ? 0.7 : 1 }}
            onMouseOver={(e) => (e.currentTarget.style.background = "var(--color-accent-dark)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "var(--color-accent)")}
            onClick={loadNextBatch}
            disabled={bulkState === "loading"}
          >
            {bulkState === "loading"
              ? (lang === "mr" ? `लोड होत आहे… ${bulkProgress}/${bulkTarget}` : `Loading… ${bulkProgress}/${bulkTarget}`)
              : scored.length === 0
                ? (lang === "mr" ? `क्रमवारी लोड करा (पुढील ${Math.min(BATCH_SIZE, remaining)} गावे)` : `Load rankings (next ${Math.min(BATCH_SIZE, remaining)} villages)`)
                : (lang === "mr" ? `आणखी ${Math.min(BATCH_SIZE, remaining)} गावे लोड करा (${remaining} बाकी)` : `Load ${Math.min(BATCH_SIZE, remaining)} more villages (${remaining} remaining)`)
            }
          </button>
          {bulkState === "loading" && (
            <div className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
              {lang === "mr"
                ? "प्रत्येक अंदाज बॅकएंडवर लाइव्ह चालतो (हवामान तपासणीसह) — OpenWeatherMap च्या मोफत मर्यादेत राहण्यासाठी वेगावर नियंत्रण ठेवले आहे."
                : "Each prediction runs live on the backend, including a weather lookup — paced to stay within OpenWeatherMap's free-tier rate limit, so this takes a couple of minutes per batch."
              }
            </div>
          )}
          {bulkState === "error" && bulkError && (
            <div className="mt-2 text-xs" style={{ color: "#dc2626" }}>{bulkError}</div>
          )}
        </div>
      )}

      {/* Rankings table */}
      {scored.length > 0 && (
        <div>
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 20 }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-display font-semibold" style={{ color: "var(--color-text)" }}>
                {lang === "mr" ? "जोखीम क्रमवारी" : "Risk ranking"}
              </span>
              <span className="text-xs font-mono-data" style={{ color: "var(--color-muted)" }}>
                {scored.length} {lang === "mr" ? "गावे" : "villages ranked"}
              </span>
            </div>
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden" }}>
              <table className="w-full" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--color-panel)", borderBottom: "1px solid var(--color-border)" }}>
                    {["#", lang === "mr" ? "गाव" : "Village", "Lat", "Lng", "Risk %", lang === "mr" ? "पातळी" : "Level"].map((h, i) => (
                      <th key={i} className={`px-3 py-2 text-left font-mono-data`} style={{ color: "var(--color-muted)", fontWeight: 500, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scored.map((v, i) => {
                    const score = riskScores[v.id] ?? 0;
                    const color = getRiskColor(score);
                    return (
                      <tr
                        key={v.id}
                        className="cursor-pointer"
                        style={{ borderBottom: "1px solid var(--color-border-light)", background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-panel)" }}
                        onMouseOver={(e) => (e.currentTarget.style.background = "var(--color-accent-light)")}
                        onMouseOut={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "var(--color-surface)" : "var(--color-panel)")}
                        onClick={() => onSelectVillage(v.id)}
                      >
                        <td className="px-3 py-2 font-mono-data" style={{ color: "var(--color-muted)", fontSize: 11 }}>{i + 1}</td>
                        <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{v.name}</td>
                        <td className="px-3 py-2 font-mono-data" style={{ color: "var(--color-muted)", fontSize: 11 }}>{v.lat.toFixed(3)}</td>
                        <td className="px-3 py-2 font-mono-data" style={{ color: "var(--color-muted)", fontSize: 11 }}>{v.lng.toFixed(3)}</td>
                        <td className="px-3 py-2 font-mono-data font-semibold" style={{ color }}>{score.toFixed(0)}%</td>
                        <td className="px-3 py-2">
                          <span className="font-mono-data" style={{ fontSize: 11, color, background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 3, padding: "1px 6px" }}>
                            {getRiskLabel(score, lang)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
