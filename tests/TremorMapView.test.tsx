import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TremorMapView } from '@/components/map/TremorMapView';
import type { MarketMovement } from '@/lib/types';

// Mock react-leaflet to avoid DOM/Map dependencies
vi.mock('react-leaflet', () => {
  const MapContainer: React.FC<{ children?: React.ReactNode }> = ({
    children,
  }) => <div data-testid="map">{children}</div>;
  const TileLayer: React.FC = () => null;
  const CircleMarker: React.FC<{
    children?: React.ReactNode;
    eventHandlers?: { click?: () => void };
  }> = ({ children, eventHandlers }) => (
    <div data-testid="marker" onClick={eventHandlers?.click} role="button">
      {children}
    </div>
  );
  const Tooltip: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
    <div>{children}</div>
  );
  return { MapContainer, TileLayer, CircleMarker, Tooltip };
});

it('filters by region: US-only', () => {
  const items: MarketMovement[] = [
    { ...movement('10', 'Senate in Texas', 6.0), category: 'POLITICS' },
    // Simulate non-US by hacking geo: our service won’t map non-US text, so use a movement with global text
    {
      ...movement('11', 'Global Bitcoin', 6.0, 'BTC hits 100k?'),
      category: 'CRYPTO',
    },
  ];
  // With US-only, only the Texas item should appear (since Global Bitcoin won’t map to US)
  render(
    <TremorMapView
      movements={items}
      intensityFilter="all"
      regionFilter={{ usOnly: true }}
    />
  );
  const markers = screen.getAllByTestId('marker');
  expect(markers.length).toBe(1);
});

it('filters by region: state query', () => {
  const items: MarketMovement[] = [
    movement('12', 'Governor in Texas', 6.0),
    movement('13', 'Senate in Florida', 6.0),
  ];
  render(
    <TremorMapView
      movements={items}
      intensityFilter="all"
      regionFilter={{ stateQuery: 'tex' }}
    />
  );
  const markers = screen.getAllByTestId('marker');
  expect(markers.length).toBe(1);
});

it('filters by region: country query', () => {
  const items: MarketMovement[] = [
    movement('21', 'Election in Germany', 6.0),
    movement('22', 'Senate in Texas', 6.0),
  ];
  render(
    <TremorMapView
      movements={items}
      intensityFilter="all"
      regionFilter={{ countryQuery: 'germ' }}
    />
  );
  const markers = screen.getAllByTestId('marker');
  expect(markers.length).toBe(1);
});

it('calls onMarkerClick when a marker is clicked', () => {
  const items = [movement('9', 'Senate in Texas', 7.0)];
  const onMarkerClick = vi.fn();
  render(<TremorMapView movements={items} onMarkerClick={onMarkerClick} />);
  const marker = screen.getByTestId('marker');
  fireEvent.click(marker);
  expect(onMarkerClick).toHaveBeenCalledTimes(1);
  expect(onMarkerClick.mock.calls[0][0].id).toBe('9');
});

function movement(
  id: string,
  title: string,
  score: number,
  question?: string
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
    marketMovements: question
      ? [
          {
            conditionId: `cond-${id}`,
            question,
            prevPrice: 0.5,
            currPrice: 0.6,
            change: 10,
            volume: 1000,
          },
        ]
      : [],
  } as MarketMovement;
}

describe('TremorMapView', () => {
  it('renders markers for movements with geographic data', () => {
    const items = [
      movement('1', 'Senate in Texas', 8.1),
      movement('2', 'Governor race', 3.2, 'Will CA governor be X?'),
    ];

    render(<TremorMapView movements={items} intensityFilter="all" />);
    const markers = screen.getAllByTestId('marker');
    expect(markers.length).toBe(2);
  });

  it('filters markers by intensity', () => {
    const items = [
      movement('3', 'Senate in Texas', 6.1), // high
      movement('4', 'Governor race', 2.0, 'Who will win in CA?'), // low
    ];

    render(<TremorMapView movements={items} intensityFilter="high" />);
    const markers = screen.getAllByTestId('marker');
    expect(markers.length).toBe(1);
  });

  it('filters by high confidence only', () => {
    const items = [
      movement('5', 'Governor race in Texas', 5.5), // high confidence (full name)
      movement('6', 'Governor race', 5.5, 'Who will win in CA?'), // medium confidence (abbr)
    ];

    render(
      <TremorMapView
        movements={items}
        intensityFilter="all"
        confidenceFilter="high"
      />
    );
    const markers = screen.getAllByTestId('marker');
    expect(markers.length).toBe(1);
  });

  it('filters by category', () => {
    const a = movement('7', 'Politics race in Texas', 6.0); // POLITICS default in helper
    const b: MarketMovement = {
      ...movement('8', 'Bitcoin in CA', 6.0, 'BTC in CA?'),
      category: 'CRYPTO',
    };
    const filter: Array<MarketMovement['category']> = ['CRYPTO'];

    render(
      <TremorMapView
        movements={[a, b]}
        intensityFilter="all"
        confidenceFilter="all"
        categoryFilter={filter}
      />
    );
    const markers = screen.getAllByTestId('marker');
    expect(markers.length).toBe(1);
  });

  it('renders markers for international country movements', () => {
    const items = [movement('20', 'Election in Germany', 6.0)];
    render(<TremorMapView movements={items} intensityFilter="all" />);
    const markers = screen.getAllByTestId('marker');
    expect(markers.length).toBe(1);
  });

  it('uses server-provided geo when available (even if text is ambiguous)', () => {
    const withServerGeo = movement(
      '30',
      'Global topic: rates and world news',
      6.0
    ) as MarketMovement & {
      lat: number;
      lng: number;
      country: string;
      geoConfidence: 'high' | 'medium' | 'low';
    };
    withServerGeo.lat = 51.1657;
    withServerGeo.lng = 10.4515;
    withServerGeo.country = 'Germany';
    withServerGeo.geoConfidence = 'high';

    render(<TremorMapView movements={[withServerGeo]} intensityFilter="all" />);
    const markers = screen.getAllByTestId('marker');
    expect(markers.length).toBe(1);
  });
});
