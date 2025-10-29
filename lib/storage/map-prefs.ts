import type { MarketCategory } from '@/lib/types';
import type {
  IntensityFilter,
  ConfidenceFilter,
  RegionFilter,
} from '@/components/map/TremorMapView';

export type WindowSel = '5m' | '60m' | '1440m';

export interface MapPrefs {
  windowSel: WindowSel;
  intensity: IntensityFilter;
  confidence: ConfidenceFilter;
  selectedCategories: MarketCategory[];
  region: RegionFilter;
}

const KEY = 'TREMOR_MAP_PREFS_V1';

const ALLOWED_WINDOWS: WindowSel[] = ['5m', '60m', '1440m'];
const ALLOWED_INTENSITY: IntensityFilter[] = [
  'all',
  'extreme',
  'high',
  'moderate',
  'low',
];
const ALLOWED_CONFIDENCE: ConfidenceFilter[] = ['all', 'high'];
const ALLOWED_CATEGORIES: MarketCategory[] = [
  'POLITICS',
  'CRYPTO',
  'SPORTS',
  'ECONOMY',
  'TECH',
  'SCIENCE',
  'CULTURE',
];

function sanitizePrefs(input: Partial<MapPrefs>): MapPrefs | null {
  const windowSel = ALLOWED_WINDOWS.includes(
    (input.windowSel as WindowSel) || '60m'
  )
    ? (input.windowSel as WindowSel) || '60m'
    : '60m';
  const intensity = ALLOWED_INTENSITY.includes(
    (input.intensity as IntensityFilter) || 'all'
  )
    ? (input.intensity as IntensityFilter) || 'all'
    : 'all';
  const confidence = ALLOWED_CONFIDENCE.includes(
    (input.confidence as ConfidenceFilter) || 'all'
  )
    ? (input.confidence as ConfidenceFilter) || 'all'
    : 'all';
  const selectedCategories = Array.isArray(input.selectedCategories)
    ? (input.selectedCategories as MarketCategory[]).filter((c) =>
        ALLOWED_CATEGORIES.includes(c)
      )
    : [];
  const region: RegionFilter = {
    usOnly: Boolean((input.region as RegionFilter)?.usOnly) || false,
    stateQuery: String((input.region as RegionFilter)?.stateQuery ?? ''),
    countryQuery: String((input.region as RegionFilter)?.countryQuery ?? ''),
  };
  return {
    windowSel,
    intensity,
    confidence,
    selectedCategories,
    region,
  };
}

export function loadMapPrefs(): MapPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Support versioned payloads
    const payload = 'prefs' in parsed ? parsed.prefs : parsed;
    const sanitized = sanitizePrefs(payload);
    return sanitized;
  } catch {
    return null;
  }
}

export function saveMapPrefs(prefs: MapPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = sanitizePrefs(prefs);
    if (!sanitized) return;
    const payload = { v: 1, prefs: sanitized };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore write errors
  }
}
