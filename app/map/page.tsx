'use client';

import { useDeferredValue, useMemo, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type {
  IntensityFilter,
  ConfidenceFilter,
  RegionFilter,
} from '@/components/map/TremorMapView';
import { useTremorData } from '@/hooks/use-tremor-data';
import type { MarketCategory, MarketMovement } from '@/lib/types';
import { TremorDetailPanel } from '@/components/tremor-detail-panel';
import { loadMapPrefs, saveMapPrefs } from '@/lib/storage/map-prefs';

const TremorMapView = dynamic(
  () => import('@/components/map/TremorMapView').then((m) => m.TremorMapView),
  { ssr: false }
);

const ALL_CATEGORIES: MarketCategory[] = [
  'POLITICS',
  'CRYPTO',
  'SPORTS',
  'ECONOMY',
  'TECH',
  'SCIENCE',
  'CULTURE',
];

const QUICK_STATES: Array<{ abbr: string; name: string }> = [
  { abbr: 'CA', name: 'California' },
  { abbr: 'TX', name: 'Texas' },
  { abbr: 'NY', name: 'New York' },
  { abbr: 'FL', name: 'Florida' },
  { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'IL', name: 'Illinois' },
  { abbr: 'OH', name: 'Ohio' },
  { abbr: 'GA', name: 'Georgia' },
  { abbr: 'NC', name: 'North Carolina' },
  { abbr: 'AZ', name: 'Arizona' },
];

export default function MapPage() {
  const [intensity, setIntensity] = useState<IntensityFilter>('all');
  const [confidence, setConfidence] = useState<ConfidenceFilter>('all');
  const [windowSel, setWindowSel] = useState<'5m' | '60m' | '1440m'>('60m');
  const [region, setRegion] = useState<RegionFilter>({
    usOnly: false,
    stateQuery: '',
    countryQuery: '',
  });
  const [selectedCategories, setSelectedCategories] = useState<
    MarketCategory[]
  >([]);
  const [selectedMovement, setSelectedMovement] =
    useState<MarketMovement | null>(null);

  // Load persisted preferences on mount (client-only)
  const initializedRef = useRef(false);
  useEffect(() => {
    const prefs = loadMapPrefs();
    if (prefs) {
      setWindowSel(prefs.windowSel);
      setIntensity(prefs.intensity);
      setConfidence(prefs.confidence);
      setSelectedCategories(prefs.selectedCategories ?? []);
      setRegion(
        prefs.region ?? { usOnly: false, stateQuery: '', countryQuery: '' }
      );
    }
    initializedRef.current = true;
  }, []);

  // Persist preferences whenever they change (after initial load)
  useEffect(() => {
    if (!initializedRef.current) return;
    saveMapPrefs({
      windowSel,
      intensity,
      confidence,
      selectedCategories,
      region,
    });
  }, [windowSel, intensity, confidence, selectedCategories, region]);

  const { movements } = useTremorData(windowSel);
  // Defer movement updates slightly to avoid thrashing the map under high-frequency updates
  const deferredMovements = useDeferredValue(movements);

  const categoryFilter = useMemo(
    () => selectedCategories,
    [selectedCategories]
  );

  const toggleCategory = (c: MarketCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed left-0 right-0 top-0 z-50 flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur-sm">
        <div className="text-xs font-bold tracking-[0.15em]">MAP VIEW</div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <label className="text-zinc-500" htmlFor="map-window">
              Window
            </label>
            <select
              id="map-window"
              aria-label="Window"
              value={windowSel}
              onChange={(e) =>
                setWindowSel(e.target.value as '5m' | '60m' | '1440m')
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="5m">5m</option>
              <option value="60m">1h</option>
              <option value="1440m">24h</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-zinc-500" htmlFor="map-intensity">
              Intensity
            </label>
            <select
              id="map-intensity"
              aria-label="Intensity"
              value={intensity}
              onChange={(e) => setIntensity(e.target.value as IntensityFilter)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All</option>
              <option value="extreme">Extreme</option>
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-zinc-500" htmlFor="map-confidence">
              Confidence
            </label>
            <select
              id="map-confidence"
              aria-label="Confidence"
              value={confidence}
              onChange={(e) =>
                setConfidence(e.target.value as ConfidenceFilter)
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
            >
              <option value="all">All</option>
              <option value="high">High only</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-zinc-500">Region</label>
            <label className="inline-flex items-center gap-1 text-zinc-400">
              <input
                type="checkbox"
                checked={region.usOnly}
                onChange={(e) =>
                  setRegion((r) => ({ ...r, usOnly: e.target.checked }))
                }
              />
              US only
            </label>
            <input
              type="text"
              placeholder="State query (e.g., Texas, CA)"
              value={region.stateQuery}
              onChange={(e) =>
                setRegion((r) => ({ ...r, stateQuery: e.target.value }))
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              style={{ width: 180 }}
            />
            <input
              type="text"
              placeholder="Country query (e.g., Germany, UK)"
              value={region.countryQuery}
              onChange={(e) =>
                setRegion((r) => ({ ...r, countryQuery: e.target.value }))
              }
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              style={{ width: 200 }}
            />
          </div>
        </div>
      </div>
      {/* Secondary toolbar: categories and quick states */}
      <div className="fixed left-0 right-0 top-12 z-40 flex h-10 items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 text-xs backdrop-blur-sm">
        <div className="flex flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <span className="text-zinc-500">Categories</span>
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`rounded border px-2 py-1 ${selectedCategories.includes(cat) ? 'border-tremor-pulse/50 text-tremor-pulse' : 'border-zinc-700 text-zinc-300'} hover:border-zinc-500`}
              title={cat}
              aria-pressed={selectedCategories.includes(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-1 lg:flex">
          <span className="text-zinc-500">States</span>
          {QUICK_STATES.map((s) => (
            <button
              key={s.abbr}
              onClick={() =>
                setRegion({
                  usOnly: true,
                  stateQuery: s.name,
                  countryQuery: '',
                })
              }
              className={`rounded border px-1.5 py-0.5 text-[11px] ${
                region.stateQuery?.toLowerCase() === s.name.toLowerCase()
                  ? 'border-tremor-pulse/50 text-tremor-pulse'
                  : 'border-zinc-700 text-zinc-300'
              } hover:border-zinc-500`}
              title={s.name}
              aria-label={`Filter by ${s.name}`}
            >
              {s.abbr}
            </button>
          ))}
          <button
            onClick={() => setRegion((r) => ({ ...r, stateQuery: '' }))}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:border-zinc-500"
            aria-label="Clear state filter"
            title="Clear"
          >
            Clear
          </button>
        </div>
        <div className="flex items-center gap-2 lg:hidden">
          <label className="text-zinc-500" htmlFor="state-select">
            State
          </label>
          <select
            id="state-select"
            value={region.stateQuery || ''}
            onChange={(e) =>
              setRegion({
                usOnly: true,
                stateQuery: e.target.value,
                countryQuery: '',
              })
            }
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
          >
            <option value="">All</option>
            {QUICK_STATES.map((s) => (
              <option key={s.abbr} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="relative pt-[5.5rem]"
        style={{ height: 'calc(100vh - 5.5rem)' }}
      >
        <TremorMapView
          movements={deferredMovements}
          intensityFilter={intensity}
          confidenceFilter={confidence}
          categoryFilter={categoryFilter}
          regionFilter={region}
          onMarkerClick={(m) => setSelectedMovement(m)}
        />
        {/* Legend overlay */}
        <div className="absolute bottom-3 left-3 z-50 rounded-md border border-zinc-700/70 bg-zinc-900/80 p-3 text-[11px] text-zinc-300 shadow-lg backdrop-blur-sm">
          <div className="mb-1 font-semibold text-zinc-200">Legend</div>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: '#FF3B30' }}
            />
            <span>Extreme (≥ 7.5)</span>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: '#FF9500' }}
            />
            <span>High (5–7.5)</span>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: '#FFCC00' }}
            />
            <span>Moderate (2.5–5)</span>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: '#8e8e93' }}
            />
            <span>Low (&lt; 2.5)</span>
          </div>
          <div className="mt-2 border-t border-zinc-700/60 pt-2">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="inline-block h-2 w-4 border-b-2 border-dashed"
                style={{ borderColor: '#60a5fa' }}
              />
              <span>Global topic (dashed outline)</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-4 border-b-2 border-dashed"
                style={{ borderColor: '#93c5fd' }}
              />
              <span>US Federal topic (dashed outline)</span>
            </div>
          </div>
        </div>
      </div>

      {selectedMovement && (
        <TremorDetailPanel
          movement={selectedMovement}
          onClose={() => setSelectedMovement(null)}
        />
      )}
    </div>
  );
}
