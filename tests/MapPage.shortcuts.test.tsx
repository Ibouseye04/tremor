import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MapPage from '@/app/map/page';

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

vi.mock('@/components/map/TremorMapView', () => ({
  TremorMapView: () => null,
}));

describe('MapPage quick state shortcuts', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('clicking a quick state sets US only and populates state query with full name', async () => {
    render(<MapPage />);

    const txBtn = screen.getByRole('button', { name: /filter by texas/i });
    fireEvent.click(txBtn);

    // US only checkbox should be checked and state input updated to 'Texas'
    const usOnly = screen.getByLabelText(/US only/i) as HTMLInputElement;
    const stateInput = screen.getByPlaceholderText(
      /state query/i
    ) as HTMLInputElement;

    await waitFor(() => {
      expect(usOnly.checked).toBe(true);
      expect(stateInput.value).toBe('Texas');
    });
  });

  it('Clear button clears the state query', async () => {
    render(<MapPage />);
    const caBtn = screen.getByRole('button', { name: /filter by california/i });
    fireEvent.click(caBtn);

    const clearBtn = screen.getByRole('button', {
      name: /clear state filter/i,
    });
    fireEvent.click(clearBtn);

    const stateInput = screen.getByPlaceholderText(
      /state query/i
    ) as HTMLInputElement;

    await waitFor(() => {
      expect(stateInput.value).toBe('');
    });
  });
});
