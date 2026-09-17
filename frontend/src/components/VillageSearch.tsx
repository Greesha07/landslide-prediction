import { useState, useRef, useEffect } from "react";
import { Search, MapPin } from "../icons";
import type { Village, DatasetMeta } from "../data/villages";

interface Props {
  villages: Village[];
  meta: DatasetMeta;
  selected: Village | null;
  onSelect: (village: Village) => void;
  lang: "en" | "mr";
}

export default function VillageSearch({ villages, meta, selected, onSelect, lang }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = villages.filter((v) => v.name.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const riskSites = filtered.filter((v) => v.riskSite);
  const safePoints = filtered.filter((v) => !v.riskSite);

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-text"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 4 }}
        onClick={() => setOpen(true)}
      >
        <Search size={13} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
        <input
          type="text"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--color-text)", fontFamily: "var(--font-body)" }}
          placeholder={lang === "mr" ? "गाव शोधा…" : "Search village…"}
          value={query || (selected && !open ? selected.name : query)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(""); setOpen(true); }}
        />
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>
        {lang === "mr"
          ? `${meta.total} गावांचा डेटासेट · ${meta.riskSites} जोखीम स्थळे · ${meta.safePoints} सुरक्षित`
          : `${meta.total}-village dataset · ${meta.riskSites} documented risk sites · ${meta.safePoints} safe points`
        }
      </div>

      {open && (
        <div
          className="absolute z-50 w-full mt-1"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 4, maxHeight: 280, overflowY: "auto", boxShadow: "0 6px 20px rgba(0,0,0,0.1)" }}
        >
          {([["risk", riskSites, lang === "mr" ? "जोखीम स्थळे" : "Documented risk sites"], ["safe", safePoints, lang === "mr" ? "सुरक्षित बिंदू" : "Safe points"]] as [string, Village[], string][]).map(([key, group, label]) => {
            if (!group.length) return null;
            return (
              <div key={key}>
                <div className="px-3 py-1.5 text-xs font-mono-data" style={{ color: "var(--color-muted)", background: "var(--color-panel)", borderBottom: "1px solid var(--color-border)" }}>
                  {label}
                </div>
                {group.map((v) => (
                  <button
                    key={v.id}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm"
                    style={{ borderBottom: "1px solid var(--color-border-light)", color: "var(--color-text)" }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "var(--color-panel)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={() => { onSelect(v); setQuery(""); setOpen(false); }}
                  >
                    <MapPin size={11} style={{ color: v.riskSite ? "#dc2626" : "#16a34a", flexShrink: 0 }} />
                    <span className="flex-1">{v.name}</span>
                    <span className="font-mono-data text-xs" style={{ color: "var(--color-muted)" }}>{v.lat.toFixed(3)}°N {v.lng.toFixed(3)}°E</span>
                  </button>
                ))}
              </div>
            );
          })}
          {!filtered.length && (
            <div className="px-3 py-4 text-sm text-center" style={{ color: "var(--color-muted)" }}>No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
