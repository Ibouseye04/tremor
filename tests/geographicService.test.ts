import { describe, it, expect, beforeEach } from 'vitest';
import { GeographicService } from '@/lib/geographic-service';
import type { MarketMovement } from '@/lib/types';

function makeMovement(overrides: Partial<MarketMovement> = {}): MarketMovement {
  return {
    id: overrides.id || 'evt-1',
    eventId: overrides.eventId,
    title: overrides.title || 'Texas Governor Race',
    category: overrides.category || 'POLITICS',
    source: overrides.source || 'Polymarket',
    previousValue: overrides.previousValue ?? 50,
    currentValue: overrides.currentValue ?? 55,
    change: overrides.change ?? 5,
    timestamp: overrides.timestamp || new Date(),
    seismoScore: overrides.seismoScore ?? 6.2,
    marketMovements: overrides.marketMovements,
    totalVolume: overrides.totalVolume,
    url: overrides.url,
    image: overrides.image,
    volume: overrides.volume,
    multiMarketStats: overrides.multiMarketStats,
    components: overrides.components,
  } as MarketMovement;
}

describe('GeographicService', () => {
  beforeEach(() => {
    GeographicService.clearCache();
  });

  it('maps US state by full name from title', () => {
    const m = makeMovement({ title: 'Senate in Texas 2024' });
    const geo = GeographicService.mapMovementToGeo(m);
    expect(geo).not.toBeNull();
    expect(geo?.region).toBe('Texas');
  });

  it('maps US state by abbreviation from question', () => {
    const m = makeMovement({
      id: 'evt-2',
      title: 'Governor race',
      marketMovements: [
        {
          conditionId: 'cond-1',
          question: 'Who will win the governor race in CA?',
          prevPrice: 0.4,
          currPrice: 0.6,
          change: 20,
          volume: 10000,
        },
      ],
    });
    const geo = GeographicService.mapMovementToGeo(m);
    expect(geo).not.toBeNull();
    expect(geo?.region).toBe('California');
  });

  it('maps US federal topics to Washington, D.C. with medium confidence', () => {
    const m = makeMovement({ title: 'Will the Fed raise rates this month?' });
    const geo = GeographicService.mapMovementToGeo(m);
    expect(geo).not.toBeNull();
    expect(geo?.country).toBe('US');
    expect(geo?.region).toBe('Federal');
    expect(geo?.confidence).toBe('medium');
  });

  it('maps global topics to neutral world coordinates with low confidence', () => {
    const m = makeMovement({ title: 'Global markets rally worldwide' });
    const geo = GeographicService.mapMovementToGeo(m);
    expect(geo).not.toBeNull();
    expect(geo?.country).toBe('Global');
    expect(geo?.confidence).toBe('low');
  });

  it('caches results per eventId', () => {
    const m = makeMovement({
      id: 'evt-3',
      eventId: 'event-xyz',
      title: 'Senate in Florida',
    });
    const a = GeographicService.mapMovementToGeo(m);
    const b = GeographicService.mapMovementToGeo(m);
    expect(a?.region).toBe('Florida');
    expect(b?.region).toBe('Florida');
  });

  it('maps international country by name from title', () => {
    const m = makeMovement({ title: 'Election in Germany 2025' });
    const geo = GeographicService.mapMovementToGeo(m);
    expect(geo).not.toBeNull();
    expect(geo?.country).toBe('Germany');
  });

  it('maps United Kingdom from common alias', () => {
    const m = makeMovement({ title: 'UK election: vote forecast' });
    const geo = GeographicService.mapMovementToGeo(m);
    expect(geo).not.toBeNull();
    expect(geo?.country).toBe('United Kingdom');
  });

  it('maps United States from common aliases', () => {
    const aliases = [
      'USA votes 2024',
      'U.S. election',
      'U.S.A. turnout',
      'United States midterms',
    ];
    for (const title of aliases) {
      const m = makeMovement({ title });
      const geo = GeographicService.mapMovementToGeo(m);
      expect(geo).not.toBeNull();
      expect(geo?.country).toBe('US');
    }
  });
});
