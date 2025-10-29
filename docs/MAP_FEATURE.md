# Tremor Map Feature

Overview

- Map rendering powered by Leaflet and OpenStreetMap tiles (no API key).
- Markers represent tremors (MarketMovement) enriched with geographic coordinates.
- Intensity (0–10) influences marker color and size.

Geographic enrichment

- Implemented in lib/geographic-service.ts
- Dictionary-based parsing (MVP):
  - U.S. state names (e.g., "Texas", "New York")
  - U.S. state abbreviations (e.g., "TX", "CA")
  - Heuristics for phrases like "governor of X" and "in X"
- Confidence levels: high (full name), medium (abbreviation), low (reserved for future broader regions)
- Client-only cache per eventId to avoid repeated parsing
- Future: persist to Convex table eventGeo

UI components

- components/map/TremorMapView.tsx
  - Props: movements: MarketMovement[], intensityFilter, confidenceFilter, categoryFilter
  - Filters by intensity, confidence, and categories; renders CircleMarker with Tooltip
  - Colors by threshold: 7.5+ (extreme), 5+ (high), 2.5+ (moderate)

Route

- New route at /map renders the live map with selectors for Window, Intensity, Confidence, and Categories.

Testing

- Vitest + Testing Library configured (happy-dom)
- GeographicService unit tests for parsing and caching
- TremorMapView tests mock react-leaflet to validate marker rendering and filtering

Notes

- Global/Federal topics (e.g., "Fed rate decision") are currently not mapped (no marker).
- Performance-target: ~100 markers render quickly with memoization and simple shapes.

---

Progress Tracker (2025-09-12)

Phase 1: Investigation & Understanding

- [x] Step 1: Understand the current architecture (models, scoring, feed, data pipeline, 0–10 scale)
- [~] Step 2: Examine existing test patterns (no prior tests; established Vitest + Testing Library patterns)
- [~] Step 3: Research geographic data requirements (no native geo; MVP strategy defined and implemented for US states; international TBD)

Phase 2: Design & Planning

- [x] Step 4: Component architecture design (TremorMapView + markers + controls; Leaflet selected)
- [~] Step 5: Data flow planning (client cache implemented; future Convex persistence table eventGeo added but unused)

Phase 3: Test-Driven Development

- [~] Step 6: Write tests first
  - [x] Geo service tests (US state name/abbr, global/federal exclusion, cache)
  - [x] Map component tests (render markers, intensity filtering, confidence filtering, category filtering)
  - [ ] Integration tests for real-time updates and interactions
- [x] Step 7.1: Implement GeographicService (US states heuristics + cache)
- [x] Step 7.2: Extend tremor data model and pipeline with geo fields (lat/lng/region/country/geoConfidence) while keeping backward compatibility
- [x] Step 8.1: Basic map container integrated (Leaflet, OSM tiles, SSR off)
- [~] Step 8.2: Tremor markers (intensity sizing/color; tooltips show score/question/geo/confidence)
  - [x] Marker interaction: open TremorDetailPanel on click (wired; verify in UI)
- [~] Step 8.3: Map controls & filters
  - [x] Intensity filter
  - [x] Confidence filter (all/high)
  - [x] Category filter (multi-select)
  - [~] Zoom/pan (Leaflet defaults; no custom UI)
- [x] Region filter (US-only, state query, and country query)

Phase 4: Integration & Polish

- [~] Step 9: Integrate with existing dashboard
  - [x] Header "Map" link added
- [x] View persistence (remember user’s preferred view and filters)
- [ ] In-UI toggle between feed and map views
- [x] Step 10: Real-time updates polish
  - [x] Efficient updates to markers only; avoid full map re-render (memoized markers, stable handlers, Canvas renderer)
  - [x] Smooth animations for newly added tremors (radius and opacity easing)
  - [~] Performance testing under high-frequency updates (deferred rendering wired; add dedicated perf tests)
- [ ] Step 11: Time replay (optional)

Phase 5: Testing & Optimization

- [ ] Step 12: Comprehensive testing
  - [ ] Full test suite pass across environments
  - [ ] Manual responsive testing (mobile/desktop)
  - [ ] Performance with large datasets (target <2s for ~100 tremors)
  - [ ] Cross-browser checks
  - [ ] Validation with real Polymarket data
- [~] Step 13: Code review preparation
  - [~] Documentation (this doc, plus overview in README)
  - [ ] JSDoc comments for new modules (GeographicService, TremorMapView)
  - [ ] Final cleanup

Decisions & Configuration

- Map library: Leaflet with OpenStreetMap tiles (no API key)
- React/Next integration: dynamic import with SSR disabled for map route
- Dev stability: Strict Mode disabled in dev; map mounts after client hydration to avoid re-init
- Tests: Vitest + @testing-library/react + happy-dom; jest-dom
- Geo persistence: eventGeo table added (future use); client cache used for now

Current Controls

- Window: 5m / 1h / 24h
- Intensity: all / low / moderate / high / extreme
- Confidence: all / high only
- Region: US only toggle, State query, Country query
- Categories: POLITICS, CRYPTO, SPORTS, ECONOMY, TECH, SCIENCE, CULTURE

Known Gaps / TODOs

- International country centroid mapping; “Global/Federal” distinct styling
- Real-time update animations and render optimization
- Increase test coverage to >90%; add interaction and live-update tests
- README update with /map feature and short usage guide
- Add legend and quick state shortcuts

Next Up (proposed)

1. International fallback mapping and legend updates
2. Add legend and quick state shortcuts
3. Integration tests for real-time updates and interactions
