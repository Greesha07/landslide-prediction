import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X, Volume2 } from "../icons";
import type { Village } from "../data/villages";

interface Props {
  village: Village;
  riskScore: number;
  onClose: () => void;
  lang: "en" | "mr";
}

export default function EmergencyAlert({ village, riskScore, onClose, lang }: Props) {
  const [pulse, setPulse] = useState(true);
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const ctx = new AudioContext();
      audioRef.current = ctx;
      let t = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(620, t);
        osc.frequency.linearRampToValueAtTime(940, t + 0.5);
        osc.frequency.linearRampToValueAtTime(620, t + 1.0);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.setValueAtTime(0.25, t + 0.9);
        gain.gain.linearRampToValueAtTime(0, t + 1.0);
        osc.start(t); osc.stop(t + 1.0);
        t += 1.1;
      }
    } catch (_) {}
    const interval = setInterval(() => setPulse((p) => !p), 600);
    return () => { clearInterval(interval); audioRef.current?.close(); };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: pulse ? "rgba(180,0,0,0.94)" : "rgba(140,0,0,0.94)", transition: "background 0.3s" }}
    >
      <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(45deg,transparent,transparent 24px,rgba(0,0,0,0.07) 24px,rgba(0,0,0,0.07) 48px)" }} />

      <div className="relative z-10 text-center max-w-lg w-full px-8 py-6">
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <X size={18} style={{ color: "white" }} />
          </button>
        </div>

        {/* SIMULATION badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded mb-5" style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,213,0,0.5)" }}>
          <span className="text-xs font-mono-data font-bold" style={{ color: "#ffd700", letterSpacing: "0.15em" }}>⚠ SIMULATION ONLY — NOT A REAL ALERT ⚠</span>
        </div>

        <AlertTriangle size={56} style={{ color: "white", margin: "0 auto 16px", filter: "drop-shadow(0 0 18px rgba(255,220,0,0.8))" }} />

        <h1 className="font-display font-black text-4xl text-white mb-1" style={{ letterSpacing: "-0.02em" }}>
          {lang === "mr" ? "आपत्कालीन इशारा" : "EMERGENCY ALERT"}
        </h1>

        <div className="inline-block px-4 py-1 rounded-full mb-4 font-mono-data font-bold text-sm pulse-red" style={{ background: "#cc0000", color: "white", border: "2px solid rgba(255,255,255,0.4)" }}>
          SEVERE LANDSLIDE RISK — {village.name}
        </div>

        <p className="text-white/85 text-sm mb-6 leading-relaxed">
          {lang === "mr"
            ? `जोखीम स्तर: ${riskScore.toFixed(0)}%. सतर्क राहा आणि स्थानिक आपत्ती व्यवस्थापन प्राधिकरणाच्या सूचनांचे पालन करा. NDRF हेल्पलाइन: 011-24363260`
            : `Risk level: ${riskScore.toFixed(0)}%. Stay alert and follow guidance from local disaster management authorities. NDRF Helpline: 011-24363260`
          }
        </p>

        <div className="grid grid-cols-2 gap-2 mb-6">
          {[
            { label: lang === "mr" ? "जिल्हा आपत्ती कक्ष" : "District Disaster Cell", val: "02141-222222" },
            { label: "NDRF Helpline", val: "011-24363260" },
            { label: lang === "mr" ? "पोलीस" : "Police", val: "100" },
            { label: lang === "mr" ? "रुग्णवाहिका" : "Ambulance", val: "108" },
          ].map(({ label, val }) => (
            <div key={val} className="rounded px-3 py-2 text-left" style={{ background: "rgba(0,0,0,0.35)" }}>
              <div className="text-white/55 text-xs mb-0.5">{label}</div>
              <div className="text-white font-mono-data font-bold text-lg">{val}</div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="px-8 py-2.5 rounded-lg font-display font-bold text-sm"
          style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
        >
          {lang === "mr" ? "बंद करा — सिम्युलेशन" : "DISMISS SIMULATION"}
        </button>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-white/40 text-xs">
          <Volume2 size={11} />
          <span>NDMA Alert System · Simulation Mode Only · Not for real emergencies</span>
        </div>
      </div>
    </div>
  );
}
