import { describe, it, expect } from 'vitest';
import {
  mapTremorToMarketMovement,
  TremorScore,
} from '@/hooks/use-tremor-data';

function tremor(overrides: Partial<TremorScore> = {}) {
  return {
    eventId: 'evt-1',
    timestampMs: Date.now(),
    seismoScore: 6.2,
    topMarketChange: 10,
    topMarketPrevPrice01: 0.5,
    topMarketCurrPrice01: 0.6,
    event: {
      title: 'Election in Germany',
      category: 'POLITICS',
      slug: 'election-de',
      image: '',
    },
    marketMovements: [],
    ...overrides,
  };
}

describe('mapTremorToMarketMovement', () => {
  it('attaches server-provided geo when present', () => {
    const t = tremor({
      geo: {
        lat: 51.1657,
        lng: 10.4515,
        country: 'Germany',
        confidence: 'high',
      },
    });
    const m = mapTremorToMarketMovement(t)!;
    expect(m.lat).toBe(51.1657);
    expect(m.lng).toBe(10.4515);
    expect(m.country).toBe('Germany');
    expect(m.geoConfidence).toBe('high');
  });

  it('omits geo when server does not provide it', () => {
    const t = tremor();
    const m = mapTremorToMarketMovement(t)!;
    expect(m.lat).toBeUndefined();
    expect(m.lng).toBeUndefined();
  });
});
