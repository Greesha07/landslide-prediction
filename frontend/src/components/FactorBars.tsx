interface Factors {
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
}

interface Props {
  factors: Factors;
  lang: "en" | "mr";
}

// Weights are the real averaged RF+ET feature_importances_ from the trained
// 11-feature TRUE_FINAL model bundle, not estimates.
const META: Record<keyof Factors, { en: string; mr: string; weight: number }> = {
  elevation:         { en: "Elevation",              mr: "उंची",               weight: 22.2 },
  rainfallIntensity: { en: "Rainfall (CHIRPS)",       mr: "पर्जन्यमान (CHIRPS)", weight: 21.6 },
  rain3Day:          { en: "3-Day Rainfall",          mr: "३ दिवसांचा पाऊस",    weight: 15.6 },
  rain7Day:          { en: "7-Day Rainfall",          mr: "७ दिवसांचा पाऊस",    weight: 11.0 },
  ndvi:              { en: "Vegetation (NDVI)",       mr: "वनस्पती (NDVI)",     weight: 5.5  },
  terrainRoughness:  { en: "Terrain Roughness",       mr: "भूप्रदेश खडबडीतपणा", weight: 5.5  },
  distanceToRoad:    { en: "Distance to Road",        mr: "रस्त्यापासून अंतर",   weight: 4.0  },
  slope:             { en: "Slope Angle",             mr: "उताराचा कोन",        weight: 4.0  },
  distanceToRiver:   { en: "Distance to River",       mr: "नदीपासून अंतर",      weight: 3.9  },
  aspect:            { en: "Slope Direction (Aspect)",mr: "उताराची दिशा",       weight: 3.4  },
  curvature:         { en: "Curvature",               mr: "वक्रता",             weight: 3.3  },
};

function barColor(v: number): string {
  if (v >= 72) return "#dc2626";
  if (v >= 48) return "#d97706";
  return "#16a34a";
}

export default function FactorBars({ factors, lang }: Props) {
  // Sort by real model weight (highest first)
  const order: (keyof Factors)[] = [
    "elevation", "rainfallIntensity", "rain3Day", "rain7Day", "ndvi",
    "terrainRoughness", "distanceToRoad", "slope", "distanceToRiver", "aspect", "curvature",
  ];

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: "var(--color-muted)", fontStyle: "italic" }}>
        {lang === "mr"
          ? "बार लांबी = या गावासाठी वैशिष्ट्याचे सापेक्ष प्रमाण (प्रशिक्षण डेटाच्या श्रेणीनुसार सामान्यीकृत). % = मॉडेलचे वास्तविक महत्व."
          : "Bar length = this site's relative magnitude for that feature (normalized against the training data's range). % = the model's actual feature importance."
        }
      </p>
      <div className="space-y-2">
        {order.map((key) => {
          const m = META[key];
          const v = factors[key];
          const c = barColor(v);
          return (
            <div key={key} className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr auto 48px" }}>
              <div>
                <div className="text-xs mb-0.5" style={{ color: "var(--color-text)" }}>
                  {lang === "mr" ? m.mr : m.en}
                </div>
                <div style={{ height: 4, background: "var(--color-border)", borderRadius: 1 }}>
                  <div style={{ width: `${v}%`, height: "100%", background: c, borderRadius: 1, transition: "width 0.5s ease" }} />
                </div>
              </div>
              <span className="font-mono-data text-xs text-right" style={{ color: "var(--color-muted)", width: 32 }}>{m.weight}%</span>
              <span className="font-mono-data text-xs font-semibold text-right" style={{ color: c }}>{v}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
