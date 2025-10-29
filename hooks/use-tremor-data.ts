'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import {
  MarketMovement,
  SuddenMove,
  MarketCategory,
  MarketSource,
} from '@/lib/types';
import { GeographicService } from '@/lib/geographic-service';
import { useEffect, useState } from 'react';

// Types matching getTopTremors result shape
export type TopMarketMovement = {
  conditionId: string;
  question: string;
  prevPrice: number;
  currPrice: number;
  change: number; // signed pp change
  volume: number;
};
export type TremorEventDoc = {
  title?: string;
  category?: string;
  slug?: string;
  image?: string;
  volume?: number;
};
export type TremorTopMarketDoc = {
  lastTradePrice?: number;
  question?: string;
};
export type TremorGeo = {
  lat: number;
  lng: number;
  country?: string;
  region?: string;
  confidence: 'high' | 'medium' | 'low';
};
export interface TremorScore {
  eventId: string;
  timestampMs: number;
  seismoScore: number;
  topMarketChange?: number;
  topMarketPrevPrice01?: number;
  topMarketCurrPrice01?: number;
  topMarketQuestion?: string;
  marketMovements?: TopMarketMovement[];
  totalVolume?: number;
  event?: TremorEventDoc;
  topMarket?: TremorTopMarketDoc;
  geo?: TremorGeo;
}

export function mapTremorToMarketMovement(
  tremor: TremorScore
): MarketMovement | null {
  // Prefer bucket-derived prices from score, fallback to market lastTradePrice
  const curr =
    tremor.topMarketCurrPrice01 ?? tremor.topMarket?.lastTradePrice ?? 0;
  const prev =
    tremor.topMarketPrevPrice01 ||
    curr / (1 + (tremor.topMarketChange || 0) / 100);
  const currentPrice = curr;
  const previousPrice = prev;
  const priceChangePercent = tremor.topMarketChange || 0;

  if (currentPrice <= 0) return null;

  // Calculate multi-market stats
  const marketMoves: TopMarketMovement[] = tremor.marketMovements || [];
  const activeMarkets = marketMoves.filter((m) => Math.abs(m.change) > 0.1);
  const marketsUp = marketMoves.filter((m) => m.change > 0).length;
  const marketsDown = marketMoves.filter((m) => m.change < 0).length;
  const avgChange =
    marketMoves.length > 0
      ? marketMoves.reduce(
          (sum: number, m: TopMarketMovement) => sum + Math.abs(m.change),
          0
        ) / marketMoves.length
      : 0;
  const correlatedMovement =
    (marketsUp > 0 && marketsDown === 0) ||
    (marketsDown > 0 && marketsUp === 0);

  const movement: MarketMovement = {
    id: tremor.eventId,
    eventId: tremor.eventId, // Include for AI analysis
    title: tremor.event?.title || 'Unknown Event',
    category: categorizeMarket(
      tremor.event?.category ||
        tremor.event?.title ||
        tremor.topMarketQuestion ||
        ''
    ) as MarketCategory,
    source: 'Polymarket' as MarketSource,
    previousValue: Math.round(previousPrice * 100),
    currentValue: Math.round(currentPrice * 100),
    change: priceChangePercent,
    timestamp: new Date(tremor.timestampMs),
    totalVolume: tremor.totalVolume || tremor.event?.volume || 0,
    url: tremor.event?.slug
      ? `https://polymarket.com/event/${tremor.event.slug}`
      : '#',
    image: tremor.event?.image,
    seismoScore: tremor.seismoScore,
    marketMovements: marketMoves,
    multiMarketStats:
      marketMoves.length > 1
        ? {
            totalMarkets: marketMoves.length,
            activeMarkets: activeMarkets.length,
            marketsUp,
            marketsDown,
            averageChange: avgChange,
            correlatedMovement,
          }
        : undefined,
  };

  // Attach server-provided geo if present
  if (
    tremor.geo &&
    typeof tremor.geo.lat === 'number' &&
    typeof tremor.geo.lng === 'number'
  ) {
    movement.lat = tremor.geo.lat;
    movement.lng = tremor.geo.lng;
    movement.country = tremor.geo.country;
    movement.region = tremor.geo.region;
    movement.geoConfidence =
      (tremor.geo.confidence as 'high' | 'medium' | 'low') || 'high';
  }

  return movement;
}

export type UseTremorDataReturn = {
  markets: unknown; // from Convex query
  movements: MarketMovement[];
  suddenMoves: SuddenMove[];
  loading: boolean;
  connected: boolean;
  lastUpdateTime: number;
  isPaused: boolean;
  togglePause: () => void;
  refresh: () => void;
};

export function useTremorData(
  window: '5m' | '60m' | '1440m' = '60m'
): UseTremorDataReturn {
  // Get top tremors from Convex
  const topTremors = useQuery(api.scoring.getTopTremors, {
    window,
    limit: 50,
  });

  // Get active markets
  const activeMarkets = useQuery(api.markets.getActiveMarkets, {
    limit: 100,
  });

  // Track pause and last update time
  const [isPaused, setIsPaused] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  useEffect(() => {
    if (topTremors) setLastUpdateTime(Date.now());
  }, [topTremors]);

  // Convert to frontend format and enrich with geo once (service fallback)
  const baseMovements: MarketMovement[] = (
    (topTremors || []) as unknown as TremorScore[]
  )
    .map(mapTremorToMarketMovement)
    .filter((m): m is MarketMovement => Boolean(m));

  const movements: MarketMovement[] = baseMovements.map((m) => {
    if (typeof m.lat === 'number' && typeof m.lng === 'number') return m;
    const geo = GeographicService.mapMovementToGeo(m);
    if (!geo) return m;
    return {
      ...m,
      lat: geo.lat,
      lng: geo.lng,
      region: geo.region,
      country: geo.country,
      geoConfidence: geo.confidence,
    };
  });

  // Filter for sudden moves (Seismo score > 7.5)
  const suddenMoves: SuddenMove[] = movements
    .filter((m) => m.seismoScore && m.seismoScore > 7.5)
    .slice(0, 5)
    .map((m) => ({
      ...m,
      alertLevel: m.seismoScore && m.seismoScore > 9 ? 'extreme' : 'high',
      timeToChange: calculateTimeToChange(m.timestamp),
    }));

  return {
    markets: activeMarkets || [],
    movements,
    suddenMoves,
    loading: !topTremors && !activeMarkets,
    connected: true,
    lastUpdateTime,
    isPaused,
    togglePause: () => setIsPaused((p: boolean) => !p),
    refresh: () => setLastUpdateTime(Date.now()),
  };
}

function categorizeMarket(text: string): string {
  const lower = text.toLowerCase();
  if (
    lower.includes('trump') ||
    lower.includes('biden') ||
    lower.includes('election')
  ) {
    return 'POLITICS';
  }
  if (
    lower.includes('bitcoin') ||
    lower.includes('btc') ||
    lower.includes('eth') ||
    lower.includes('crypto')
  ) {
    return 'CRYPTO';
  }
  if (
    lower.includes('fed') ||
    lower.includes('inflation') ||
    lower.includes('gdp')
  ) {
    return 'ECONOMY';
  }
  if (
    lower.includes('nfl') ||
    lower.includes('nba') ||
    lower.includes('sports')
  ) {
    return 'SPORTS';
  }
  if (lower.includes('ai') || lower.includes('tech')) {
    return 'TECH';
  }
  return 'ECONOMY';
}

function calculateTimeToChange(timestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}min`;
  }
  return `${minutes}min`;
}
