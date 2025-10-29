import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MapPage from '@/app/map/page';
import { loadMapPrefs } from '@/lib/storage/map-prefs';

// Mock data hook to avoid Convex dependencies
vi.mock('@/hooks/use-tremor-data', () => ({
  useTremorData: () => ({
    movements: [],
    markets: [],
    suddenMoves: [],
    loading: false,
    connected: true,
    refresh: () => {},
  }),
}));

// Stub out TremorMapView to avoid loading Leaflet in tests
vi.mock('@/components/map/TremorMapView', () => ({
  TremorMapView: () => null,
}));

const KEY = 'TREMOR_MAP_PREFS_V1';

describe('MapPage preference persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('initializes controls from saved preferences and writes back on change', async () => {
    // Seed stored preferences
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        prefs: {
          windowSel: '1440m',
          intensity: 'high',
          confidence: 'high',
          selectedCategories: ['CRYPTO', 'POLITICS'],
          region: { usOnly: true, stateQuery: 'tx', countryQuery: 'us' },
        },
      })
    );

    render(<MapPage />);

    // Check loaded values
    const winSel = screen.getByRole('combobox', {
      name: /window/i,
    }) as HTMLSelectElement;
    const intSel = screen.getByRole('combobox', {
      name: /intensity/i,
    }) as HTMLSelectElement;
    const confSel = screen.getByRole('combobox', {
      name: /confidence/i,
    }) as HTMLSelectElement;

    await waitFor(() => {
      expect(winSel.value).toBe('1440m');
      expect(intSel.value).toBe('high');
      expect(confSel.value).toBe('high');
    });

    // Change a value and verify it writes back
    fireEvent.change(intSel, { target: { value: 'extreme' } });

    await waitFor(() => {
      const prefs = loadMapPrefs();
      expect(prefs).not.toBeNull();
      expect(prefs!.intensity).toBe('extreme');
      // ensure other values preserved
      expect(prefs!.windowSel).toBe('1440m');
      expect(prefs!.confidence).toBe('high');
    });
  });
});
