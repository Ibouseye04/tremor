import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TremorMapView } from '@/components/map/TremorMapView';
import type { MarketMovement } from '@/lib/types';

// Per-file mock of react-leaflet exposing props for assertions
let mapContainerRenderCount = 0;
vi.mock('react-leaflet', () => {
  const MapContainer: React.FC<{ children?: React.ReactNode }> = ({
    children,
  }) => {
    mapContainerRenderCount += 1;
    return <div data-testid="map">{children}</div>;
  };
  const TileLayer: React.FC = () => null;
  const CircleMarker: React.FC<{
    children?: React.ReactNode;
    center?: [number, number];
    radius?: number;
    pathOptions?: {
      color?: string;
      fillColor?: string;
      fillOpacity?: number;
      dashArray?: string;
      weight?: number;
    };
    eventHandlers?: { click?: () => void };
    key?: string;
  }> = ({ children, radius, pathOptions, eventHandlers }) => (
    <div
      data-testid="marker"
      data-radius={radius}
      data-color={pathOptions?.color}
      data-dasharray={pathOptions?.dashArray ?? ''}
      onClick={eventHandlers?.click}
      role="button"
    >
      {children}
    </div>
  );
  const Tooltip: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <div>{children}</div>
  );
  return { MapContainer, TileLayer, CircleMarker, Tooltip };
});

function mv(
  id: string,
  title: string,
  score: number,
  overrides: Partial<MarketMovement> = {}
): MarketMovement {
  return {
    id,
    title,
    category: 'POLITICS',
    source: 'Polymarket',
    previousValue: 50,
    currentValue: 60,
    change: 10,
    timestamp: new Date(),
    seismoScore: score,
    ...overrides,
  } as MarketMovement;
}

let setItemsRef: React.Dispatch<React.SetStateAction<MarketMovement[]>> | null =
  null;
function Harness({ initial }: { initial: MarketMovement[] }) {
  const [items, setItems] = useState<MarketMovement[]>(initial);
  setItemsRef = setItems;
  return <TremorMapView movements={items} intensityFilter="all" />;
}

beforeEach(() => {
  mapContainerRenderCount = 0;
  setItemsRef = null;
});

it('adds a new marker on live update without remounting the existing marker', () => {
  render(<Harness initial={[mv('a', 'Senate in Texas', 6.0)]} />);
  const first = screen.getAllByTestId('marker')[0];

  act(() => {
    setItemsRef?.((prev: MarketMovement[]) => [
      ...prev,
      mv('b', 'Governor in Florida', 6.0),
    ]);
  });

  const markers = screen.getAllByTestId('marker');
  expect(markers.length).toBe(2);
  expect(markers[0].isSameNode(first)).toBe(true); // first marker not remounted
});

it("updates an existing marker's style on score change without remount", () => {
  render(
    <Harness
      initial={[mv('a', 'Senate in Texas', 2.0), mv('b', 'Gov in FL', 6.0)]}
    />
  );
  const [firstBefore] = screen.getAllByTestId('marker');
  const colorBefore = firstBefore.getAttribute('data-color');

  act(() => {
    setItemsRef?.((prev: MarketMovement[]) =>
      prev.map((m) => (m.id === 'a' ? { ...m, seismoScore: 8.0 } : m))
    );
  });

  const [firstAfter, secondAfter] = screen.getAllByTestId('marker');
  expect(firstAfter.isSameNode(firstBefore)).toBe(true);
  const colorAfter = firstAfter.getAttribute('data-color');
  expect(colorAfter).not.toBe(colorBefore); // color threshold changed
  expect(secondAfter).toBeTruthy();
});

it('handles burst additions without remounting the map container excessively', () => {
  render(<Harness initial={[mv('a', 'Senate in Texas', 6.0)]} />);

  act(() => {
    setItemsRef?.((prev: MarketMovement[]) => {
      const next = [...prev];
      for (let i = 0; i < 20; i++)
        next.push(mv(`z${i}`, `Senate in Texas ${i}`, 5.5));
      return next;
    });
  });

  const markers = screen.getAllByTestId('marker');
  expect(markers.length).toBe(21);
  // Expect only the initial render + some updates, not exploding
  expect(mapContainerRenderCount).toBeLessThanOrEqual(3);
});

it('applies dashed outline styling for Global and US Federal topics', () => {
  // Global
  render(
    <Harness initial={[mv('g', 'Global markets rally worldwide', 6.0)]} />
  );
  const globalMarker = screen.getAllByTestId('marker')[0];
  // dashArray '4 4' from TremorMapView
  expect(globalMarker.getAttribute('data-dasharray')).toBe('4 4');

  // US Federal
  act(() => {
    setItemsRef?.((prev: MarketMovement[]) => [
      ...prev,
      mv('f', 'Will the Fed raise rates this month?', 6.0),
    ]);
  });
  const markers = screen.getAllByTestId('marker');
  const fedMarker = markers.find((el) => el !== globalMarker)!;
  // dashArray '2 2' from TremorMapView
  expect(fedMarker.getAttribute('data-dasharray')).toBe('2 2');
});
