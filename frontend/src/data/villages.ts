import { fetchVillages, type BackendVillage } from "../utils/api";

// A village as the UI works with it. The backend's /villages endpoint only
// gives name/coordinates/label — no district, taluka, or Marathi name — so
// those fields are gone rather than faked. Per-site terrain values (elevation,
// slope, etc.) only exist server-side and arrive via /predict's features_used.
export interface Village {
  id: string; // Village_Name is the backend's own identifier
  name: string;
  lat: number;
  lng: number;
  riskSite: boolean; // true = documented risk site (Label 1), false = safe point (Label 0)
}

export interface DatasetMeta {
  total: number;
  riskSites: number;
  safePoints: number;
}

function toVillage(v: BackendVillage): Village {
  return { id: v.Village_Name, name: v.Village_Name, lat: v.Latitude, lng: v.Longitude, riskSite: v.Label === 1 };
}

export async function loadVillages(): Promise<Village[]> {
  const raw = await fetchVillages();
  return raw.map(toVillage);
}

export function computeDatasetMeta(villages: Village[]): DatasetMeta {
  const riskSites = villages.filter((v) => v.riskSite).length;
  return { total: villages.length, riskSites, safePoints: villages.length - riskSites };
}
