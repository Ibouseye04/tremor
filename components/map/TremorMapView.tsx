'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
/* eslint-disable @typescript-eslint/no-explicit-any */
const MC = MapContainer as any;
const TL = TileLayer as any;
const CM = CircleMarker as any;
/* eslint-enable @typescript-eslint/no-explicit-any */
import type { MarketMovement, MarketCategory } from '@/lib/types';
import { GeographicService } from '@/lib/geographic-service';

export type IntensityFilter = 'all' | 'extreme' | 'high' | 'moderate' | 'low';
export type ConfidenceFilter = 'all' | 'high';
export type RegionFilter = {
  usOnly?: boolean;
  stateQuery?: string;
  countryQuery?: string;
};

interface TremorMapViewProps {
  movements: MarketMovement[];
  intensityFilter?: IntensityFilter;
  confidenceFilter?: ConfidenceFilter;
  categoryFilter?: MarketCategory[]; // empty or undefined means all
  regionFilter?: RegionFilter;
  onMarkerClick?: (movement: MarketMovement) => void;
}

function passesIntensityFilter(
  score: number | undefined,
  filter: IntensityFilter
): boolean {
  if (score == null) return filter === 'all' || filter === 'low';
  switch (filter) {
    case 'extreme':
      return score >= 7.5;
    case 'high':
      return score >= 5 && score < 7.5;
    case 'moderate':
      return score >= 2.5 && score < 5;
    case 'low':
      return score < 2.5;
    case 'all':
    default:
      return true;
  }
}

function colorForScore(score: number | undefined): string {
  if (score == null) return '#8e8e93';
  if (score >= 7.5) return '#FF3B30'; // extreme
  if (score >= 5) return '#FF9500'; // high
  if (score >= 2.5) return '#FFCC00'; // moderate
  return '#8e8e93'; // low
}

function radiusForScore(score: number | undefined): number {
  if (score == null) return 6;
  return Math.max(6, Math.min(18, 6 + score * 1.2));
}

// Lightweight interpolation helper for animations
function animateValue(
  from: number,
  to: number,
  durationMs: number,
  onStep: (v: number) => void,
  onDone?: () => void
) {
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const v = from + (to - from) * t;
    onStep(v);
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

interface MarkerDatum {
  id: string;
  lat: number;
  lng: number;
  color: string;
  radius: number;
  title: string;
  score?: number;
  region?: string;
  country?: string;
  confidence: 'high' | 'medium' | 'low';
  question?: string;
}

function MarkerTooltip({ d }: { d: MarkerDatum }) {
  return (
    <Tooltip>
      <div>
        <div style={{ fontWeight: 700 }}>{d.title}</div>
        <div style={{ fontSize: 12 }}>
          Score: {d.score?.toFixed(1) ?? '0.0'}
        </div>
        {(d.region || d.country) && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {d.region ? `${d.region}, ` : ''}
            {d.country ?? ''} • {d.confidence.toUpperCase()} confidence
          </div>
        )}
        {d.question && (
          <div style={{ fontSize: 12, marginTop: 4 }}>{d.question}</div>
        )}
      </div>
    </Tooltip>
  );
}

function AnimatedCircleMarker({
  d,
  onClickId,
  onClick,
  isNew,
}: {
  d: MarkerDatum;
  onClickId: string;
  onClick: (id: string) => void;
  isNew: boolean;
}) {
  const [r, setR] = useState(isNew ? 0 : d.radius);
  const [fill, setFill] = useState(isNew ? 0 : 0.5);
  const prevRadiusRef = useRef(d.radius);

  // Animate on mount if new
  useEffect(() => {
    if (!isNew) return;
    const stop1 = animateValue(0, d.radius, 250, (v) => setR(v));
    const stop2 = animateValue(0, 0.5, 250, (v) => setFill(v));
    return () => {
      stop1();
      stop2();
    };
  }, [isNew, d.radius]);

  // Animate radius updates (e.g., score changes)
  useEffect(() => {
    const from = prevRadiusRef.current;
    const to = d.radius;
    if (from === to) return;
    prevRadiusRef.current = to;
    const stop = animateValue(from, to, 250, (v) => setR(v));
    return () => stop();
  }, [d.radius]);

  const isGlobal = (d.country || '').toLowerCase() === 'global';
  const isFederal =
    d.country === 'US' && (d.region || '').toLowerCase() === 'federal';
  const dashArray = isGlobal ? '4 4' : isFederal ? '2 2' : undefined;
  const weight = isGlobal || isFederal ? 2 : 1;

  return (
    <CM
      key={d.id}
      center={[d.lat, d.lng]}
      radius={r}
      pathOptions={{
        color: d.color,
        fillColor: d.color,
        fillOpacity: fill,
        dashArray,
        weight,
      }}
      eventHandlers={{ click: () => onClick(onClickId) }}
      data-testid="marker"
    >
      <MarkerTooltip d={d} />
    </CM>
  );
}

// Wrap with memo to avoid rerenders when props unchanged
const MemoizedMarker = memo(AnimatedCircleMarker, (prev, next) => {
  const a = prev.d;
  const b = next.d;
  return (
    a.id === b.id &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.radius === b.radius &&
    a.color === b.color &&
    prev.isNew === next.isNew
  );
});

export function TremorMapView({
  movements,
  intensityFilter = 'all',
  confidenceFilter = 'all',
  categoryFilter = [],
  regionFilter,
  onMarkerClick,
}: TremorMapViewProps) {
  // Avoid SSR and dev-mode double mount issues by mounting map after client hydration
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Map of id -> movement for stable onClick handler without recreating functions per marker
  const movementMapRef = useRef<Map<string, MarketMovement>>(new Map());
  useEffect(() => {
    const m = new Map<string, MarketMovement>();
    for (const mv of movements) m.set(mv.id, mv);
    movementMapRef.current = m;
  }, [movements]);

  const hasCategoryFilter = useMemo(
    () => Array.isArray(categoryFilter) && categoryFilter.length > 0,
    [categoryFilter]
  );
  const hasRegionFilter = useMemo(
    () =>
      !!regionFilter?.usOnly ||
      !!regionFilter?.stateQuery ||
      !!regionFilter?.countryQuery,
    [regionFilter]
  );

  const stateQuery = regionFilter?.stateQuery?.trim().toLowerCase();
  const countryQuery = regionFilter?.countryQuery?.trim().toLowerCase();
  const resolvedCountry = countryQuery
    ? (GeographicService.resolveCountryName?.(regionFilter!.countryQuery!) ??
      null)
    : null;

  const features = useMemo(() => {
    const toGeo = (m: MarketMovement) => {
      if (typeof m.lat === 'number' && typeof m.lng === 'number') {
        return {
          lat: m.lat,
          lng: m.lng,
          region: m.region,
          country: m.country,
          confidence: (m.geoConfidence || 'high') as 'high' | 'medium' | 'low',
          source: 'inferred' as const,
        };
      }
      return GeographicService.mapMovementToGeo(m);
    };

    return movements
      .filter((m) => passesIntensityFilter(m.seismoScore, intensityFilter))
      .filter((m) =>
        hasCategoryFilter ? categoryFilter.includes(m.category) : true
      )
      .map((m) => ({ movement: m, geo: toGeo(m) }))
      .filter((x) => x.geo !== null)
      .filter((x) =>
        confidenceFilter === 'high' ? x.geo!.confidence === 'high' : true
      )
      .filter((x) => {
        if (!hasRegionFilter) return true;
        const isUS = x.geo!.country === 'US';
        if (regionFilter?.usOnly && !isUS) return false;
        if (stateQuery) {
          const region = (x.geo!.region || '').toLowerCase();
          if (!region.includes(stateQuery)) return false;
        }
        if (countryQuery) {
          const country = (x.geo!.country || '').toLowerCase();
          if (resolvedCountry) {
            if (x.geo!.country !== resolvedCountry) return false;
          } else if (!country.includes(countryQuery)) {
            return false;
          }
        }
        return true;
      }) as Array<{
      movement: MarketMovement;
      geo: NonNullable<ReturnType<typeof GeographicService.mapMovementToGeo>>;
    }>;
  }, [
    movements,
    intensityFilter,
    confidenceFilter,
    categoryFilter,
    hasCategoryFilter,
    hasRegionFilter,
    regionFilter,
    stateQuery,
    countryQuery,
    resolvedCountry,
  ]);

  // Prepare minimal marker props to enable React.memo on markers
  const markerData: MarkerDatum[] = useMemo(() => {
    return features.map(({ movement, geo }) => ({
      id: movement.id,
      lat: geo.lat,
      lng: geo.lng,
      color: colorForScore(movement.seismoScore),
      radius: radiusForScore(movement.seismoScore),
      title: movement.title,
      score: movement.seismoScore,
      region: geo.region,
      country: geo.country,
      confidence: geo.confidence,
      question: movement.marketMovements?.[0]?.question,
    }));
  }, [features]);

  // Track first time we see an id to add entry animation
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isNewId = useCallback((id: string) => !seenIdsRef.current.has(id), []);
  useEffect(() => {
    for (const d of markerData) seenIdsRef.current.add(d.id);
  }, [markerData]);

  const center = useMemo<[number, number]>(() => {
    // Default to continental US; if we have features, center around first
    if (markerData.length > 0) return [markerData[0].lat, markerData[0].lng];
    return [39.8283, -98.5795];
  }, [markerData]);

  const handleClick = useCallback(
    (id: string) => {
      const mv = movementMapRef.current.get(id);
      if (mv) onMarkerClick?.(mv);
    },
    [onMarkerClick]
  );

  if (!mounted) {
    return <div style={{ height: '100%', width: '100%' }} />;
  }

  return (
    <MC
      key="tremor-map"
      center={center}
      zoom={4}
      preferCanvas={true}
      style={{ height: '100%', width: '100%' }}
    >
      <TL
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markerData.map((d) => (
        <MemoizedMarker
          key={d.id}
          d={d}
          onClickId={d.id}
          onClick={handleClick}
          isNew={isNewId(d.id)}
        />
      ))}
    </MC>
  );
}
