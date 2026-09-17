import { useEffect, useRef } from "react";
import type { Village } from "../data/villages";
import { getRiskColor } from "../utils/prediction";

interface Props {
  riskScores: Record<string, number>;
  villages: Village[];
  selectedVillage: Village | null;
  onSelectVillage: (village: Village) => void;
  lang: "en" | "mr";
}

export default function LeafletMap({ riskScores, villages, selectedVillage, onSelectVillage, lang }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;

    // cancelled flag aborts the async callback if cleanup fires before import resolves
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;

      // If Leaflet already owns this container (Strict Mode first-run that wasn't
      // cleaned up yet), tear it down before re-initialising.
      const el = containerRef.current as any;
      if (el._leaflet_id != null) {
        // find and remove the existing map stored on the ref
        if (mapInstanceRef.current) {
          mapInstanceRef.current.map.remove();
          mapInstanceRef.current = null;
          markersRef.current.clear();
        }
      }

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        center: [17.9, 73.7],
        zoom: 8,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = { L, map };

      villages.forEach((v) => {
        const score = riskScores[v.id] ?? 30;
        addMarker(L, map, v, score, lang, onSelectVillage, markersRef, selectedVillage?.id === v.id);
      });
    });

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.map.remove();
        mapInstanceRef.current = null;
        markersRef.current.clear();
      }
    };
  }, []);

  // Refresh markers when scores / selection / language change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const { L, map } = mapInstanceRef.current;
    markersRef.current.forEach((marker) => map.removeLayer(marker));
    markersRef.current.clear();
    villages.forEach((v) => {
      const score = riskScores[v.id] ?? 30;
      addMarker(L, map, v, score, lang, onSelectVillage, markersRef, selectedVillage?.id === v.id);
    });
  }, [riskScores, selectedVillage, lang]);

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
      <div ref={containerRef} style={{ height: 420, width: "100%", background: "#e8f5e9" }} />
      <div className="absolute bottom-3 left-3 px-2.5 py-2 z-[1000]" style={{ background: "rgba(255,255,255,0.94)", border: "1px solid var(--color-border)", borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <p className="text-xs mb-1.5" style={{ color: "var(--color-muted)" }}>Classification</p>
        {([["#dc2626","Documented risk site"],["#16a34a","Documented safe point"]] as [string,string][]).map(([c,l]) => (
          <div key={l} className="flex items-center gap-1.5 mb-0.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
            <span style={{ color: "var(--color-text-dim)", fontSize: 11 }}>{l}</span>
          </div>
        ))}
        <p className="text-xs mt-2" style={{ color: "var(--color-muted)", fontStyle: "italic", maxWidth: 160 }}>Click a marker to run live prediction</p>
      </div>
    </div>
  );
}

function addMarker(
  L: any, map: any, v: Village, score: number,
  lang: "en" | "mr", onSelect: (v: Village) => void,
  markersRef: React.MutableRefObject<Map<string, any>>, isSelected: boolean,
) {
  // Red = documented risk site, green = documented safe point
  const color = v.riskSite ? "#dc2626" : "#16a34a";
  const size = isSelected ? 16 : 10;
  const icon = L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${isSelected ? "2px solid white" : "1.5px solid rgba(255,255,255,0.4)"};box-shadow:0 0 ${isSelected ? 12 : 6}px ${color}80;transition:all 0.2s"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  const name = v.name;
  const marker = L.marker([v.lat, v.lng], { icon })
    .addTo(map)
    .bindPopup(
      `<div style="font-family:'Inter',sans-serif;min-width:150px">
        <strong style="font-size:13px;color:#1b2e1f">${name}</strong><br/>
        <span style="font-size:11px;color:#6b9474">${v.lat.toFixed(3)}°N ${v.lng.toFixed(3)}°E</span><br/>
        <span style="display:inline-block;margin-top:4px;font-size:11px;font-family:'JetBrains Mono',monospace;color:${color};background:${color}18;border:1px solid ${color}40;border-radius:3px;padding:1px 6px;font-weight:600">${v.riskSite ? "Documented risk site" : "Documented safe point"}</span><br/>
        <span style="font-size:10px;color:#6b9474;font-style:italic">Click to run live prediction</span>
      </div>`,
      { className: "leaflet-dark-popup" },
    )
    .on("click", () => onSelect(v));

  markersRef.current.set(v.id, marker);
}
