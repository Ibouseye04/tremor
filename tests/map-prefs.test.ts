import { describe, it, expect, beforeEach } from 'vitest';
import { loadMapPrefs, saveMapPrefs } from '@/lib/storage/map-prefs';

function setRaw(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

describe('map-prefs storage util', () => {
  const KEY = 'TREMOR_MAP_PREFS_V1';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads preferences round-trip', () => {
    saveMapPrefs({
      windowSel: '1440m',
      intensity: 'high',
      confidence: 'high',
      selectedCategories: ['CRYPTO', 'POLITICS'],
      region: { usOnly: true, stateQuery: 'tx', countryQuery: 'us' },
    });
    const loaded = loadMapPrefs();
    expect(loaded).not.toBeNull();
    expect(loaded!.windowSel).toBe('1440m');
    expect(loaded!.intensity).toBe('high');
    expect(loaded!.confidence).toBe('high');
    expect(loaded!.selectedCategories).toEqual(['CRYPTO', 'POLITICS']);
    expect(loaded!.region).toEqual({
      usOnly: true,
      stateQuery: 'tx',
      countryQuery: 'us',
    });
  });

  it('handles invalid JSON gracefully', () => {
    window.localStorage.setItem(KEY, '{not-json');
    const loaded = loadMapPrefs();
    expect(loaded).toBeNull();
  });

  it('sanitizes invalid fields to defaults', () => {
    setRaw(KEY, {
      v: 1,
      prefs: {
        windowSel: 'bogus',
        intensity: 'nope',
        confidence: 'xxx',
        selectedCategories: ['CRYPTO', 'BOGUS'],
        region: { usOnly: 'yes', stateQuery: 123, countryQuery: null },
      },
    });
    const loaded = loadMapPrefs();
    expect(loaded).not.toBeNull();
    expect(loaded!.windowSel).toBe('60m');
    expect(loaded!.intensity).toBe('all');
    expect(loaded!.confidence).toBe('all');
    expect(loaded!.selectedCategories).toEqual(['CRYPTO']);
    expect(loaded!.region).toEqual({
      usOnly: true,
      stateQuery: '123',
      countryQuery: '',
    });
  });
});
