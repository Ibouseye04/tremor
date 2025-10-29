import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { enrichGeoFromText } from './geo';

// Compute baselines for a market (run nightly)
export const computeBaselines = internalMutation({
  args: {
    conditionId: v.string(),
    lookbackDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const lookbackDays = args.lookbackDays || 14;
    const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

    // Get price snapshots for the lookback period
    const snapshots = await ctx.db
      .query('priceSnapshots')
      .withIndex('by_market_time', (q) =>
        q.eq('conditionId', args.conditionId).gte('timestampMs', cutoff)
      )
      .collect();

    if (snapshots.length < 10) {
      // Not enough data for reliable baselines
      return { error: 'Insufficient data' };
    }

    // Calculate price returns between consecutive snapshots
    const returns: number[] = [];
    const volumes: number[] = [];

    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1];
      const curr = snapshots[i];

      if (prev.price01 > 0) {
        const ret = (curr.price01 - prev.price01) / prev.price01;
        returns.push(ret);
      }

      volumes.push(curr.volumeSince || 0);
    }

    if (returns.length === 0) {
      return { error: 'No valid returns' };
    }

    const p95TradeSize = 1000; // Default whale threshold

    const meanRet1m = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdRet1m = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - meanRet1m, 2), 0) /
        returns.length
    );
    const avgVol1m = volumes.reduce((a, b) => a + b, 0) / volumes.length;

    // Upsert baseline
    const existing = await ctx.db
      .query('baselines')
      .withIndex('by_condition', (q) => q.eq('conditionId', args.conditionId))
      .first();

    const baseline = {
      conditionId: args.conditionId,
      computedAt: Date.now(),
      meanRet1m,
      stdRet1m: stdRet1m || 0.001, // Avoid division by zero
      p95TradeSize,
      avgVol1m,
      dayCount: lookbackDays,
    };

    if (existing) {
      await ctx.db.patch(existing._id, baseline);
    } else {
      await ctx.db.insert('baselines', baseline);
    }

    return baseline;
  },
});

// Compute Seismo score on read (no writes)
export const computeEventScore = query({
  args: {
    eventId: v.string(),
    windowMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowMs = args.windowMinutes * 60000;
    const cutoff = now - windowMs;

    const markets = await ctx.db
      .query('markets')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .query('markets')
      .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
      .collect();

    if (markets.length === 0) {
      return { error: 'No markets in event' };
    }

    // Get price snapshots for ALL markets in the event
    const snapshots = await ctx.db
      .query('priceSnapshots')
      .withIndex('by_event_time', (q) =>
        q.eq('eventId', args.eventId).gte('timestampMs', cutoff)
      )
      .collect();

    if (snapshots.length < 2) {
      return { error: 'Insufficient data' };
    }

    // Group snapshots by market to find the biggest mover
    const marketSnapshots = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      if (!marketSnapshots.has(snapshot.conditionId)) {
        marketSnapshots.set(snapshot.conditionId, []);
      }

      marketSnapshots.set(m.conditionId, { start, end });
    }

    // Find the market with biggest price change AND track all movements
    let maxChange = 0;
    let topMarketId = '';
    let topMarketQuestion = '';
    let totalVolume = 0;
    let topMarketVolume = 0;
    let activeMarkets = 0;
    let topPrev: number | undefined = undefined;
    let topCurr: number | undefined = undefined;

    // Track ALL market movements
    const allMovements: Array<{
      conditionId: string;
      question: string;
      prevPrice: number;
      currPrice: number;
      change: number;
      volume: number;
    }> = [];

    for (const [conditionId, mSnapshots] of marketSnapshots) {
      if (mSnapshots.length < 1) continue;
      // Ensure chronological order
      mSnapshots.sort((a, b) => a.timestampMs - b.timestampMs);

      // Get first and last prices in window
      const first = mSnapshots[0];
      const last = mSnapshots[mSnapshots.length - 1];
      const prev = first.price01;
      const curr = last.price01;

      // Calculate probability change in percentage points
      // Also track if this is a reversal (more significant)
      const absoluteChange = (curr - prev) * 100; // Signed change in pp
      const absoluteChangeMagnitude = Math.abs(absoluteChange);

      // Check if this is a reversal (crossing 0.5)
      const _isReversal =
        (prev < 0.5 && curr > 0.5) || (prev > 0.5 && curr < 0.5);

      // Sum volume across all snapshots
      const marketVolume = mSnapshots.reduce(
        (sum, s) => sum + (s.volumeSince || 0),
        0
      );
      totalVolume += marketVolume;

      if (marketVolume > 0) activeMarkets++;

      // Find the market info
      const market = markets.find((m) => m.conditionId === conditionId);
      const marketQuestion = market?.question || 'Unknown';

      // Track ALL markets in the event (not just ones that moved)
      allMovements.push({
        conditionId,
        question: marketQuestion,
        prevPrice: prev,
        currPrice: curr,
        change: signedChange, // Store signed change
        volume: marketVolume,
      });

      // Track the biggest mover
      if (absoluteChangeMagnitude > Math.abs(maxChange)) {
        maxChange = absoluteChangeMagnitude; // Keep unsigned for scoring
        topMarketId = conditionId;
        topMarketQuestion = marketQuestion;
        topMarketVolume = marketVolume;
        topPrev = prev;
        topCurr = curr;
      }
    }

    // Persist event geo (best-effort): compute once when scoring and cache to eventGeo
    try {
      const eventDoc = await ctx.db
        .query('events')
        .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
        .first();
      if (eventDoc) {
        const existingGeo = await ctx.db
          .query('eventGeo')
          .withIndex('by_event', (q) => q.eq('eventId', args.eventId))
          .first();

        if (!existingGeo && topMarketQuestion) {
          const enriched = enrichGeoFromText(
            eventDoc.title || '',
            topMarketQuestion
          );
          if (enriched) {
            await ctx.db.insert('eventGeo', {
              eventId: args.eventId,
              lat: enriched.lat,
              lng: enriched.lng,
              region: enriched.region,
              country: enriched.country,
              geoConfidence: enriched.confidence,
              derivedFrom: 'inferred',
              updatedAt: Date.now(),
            });
          }
        }
      }
    } catch {
      // Best-effort: ignore enrichment persistence errors during scoring
    }

    // Sort movements by absolute change magnitude
    allMovements.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    // IMPROVED SCORING ALGORITHM
    // Use logarithmic scale for more intuitive scores
    // Also consider USD volume, not just shares

    // Convert share volume to approximate USD (assume avg price ~0.5)
    const avgPrice = 0.5; // Could be improved with actual price data
    const usdVolume = topMarketVolume * avgPrice;

    // Volume thresholds in USD
    const minVolume = 1000; // $1k minimum for any score
    const fullVolume = 10000; // $10k for full score

    // Volume multiplier (0 to 1)
    const volumeMultiplier =
      usdVolume < minVolume
        ? 0
        : Math.min(
            1,
            Math.sqrt((usdVolume - minVolume) / (fullVolume - minVolume))
          );

    // Logarithmic scoring for price changes (more intuitive)
    // 1pp = 1.0, 2pp = 2.5, 5pp = 5.0, 10pp = 7.5, 20pp+ = 10
    let baseScore: number;
    const absChange = Math.abs(maxChange);

    if (absChange < 1) {
      baseScore = absChange; // Linear for small changes
    } else if (absChange < 5) {
      baseScore = 1 + (absChange - 1) * 0.875; // Gradual increase
    } else if (absChange < 10) {
      baseScore = 4.5 + (absChange - 5) * 0.5; // Slower increase
    } else if (absChange < 20) {
      baseScore = 7 + (absChange - 10) * 0.3; // Asymptotic approach
    } else {
      baseScore = 10; // Max score
    }

    const seismoScore = Math.max(
      0,
      Math.min(10, Math.round(baseScore * volumeMultiplier * 10) / 10)
    );

    // Store the score with ALL market movements
    const windowStr = `${args.windowMinutes}m`;
    await ctx.db.insert('scores', {
      eventId: args.eventId,
      window: windowStr,
      seismoScore,
      topMarketId,
      topMarketChange: maxChange, // Return signed change for display
      topMarketQuestion,
      topMarketPrevPrice01: topPrev,
      topMarketCurrPrice01: topCurr,
      marketMovements: allMovements,
      totalVolume,
      topMarketVolume,
      activeMarkets,
    });

    return {
      eventId: args.eventId,
      window: windowStr,
      seismoScore,
      topMarketId,
      topMarketChange: maxChange,
    };
  },
});

// Backfill eventGeo for recent events (best-effort)
export const backfillEventGeo = internalMutation({
  args: {
    window: v.optional(v.string()),
    sinceHours: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const window = args.window || '60m';
    const sinceHours = args.sinceHours ?? 24;
    const limit = args.limit || 200;
    const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;

    // Get recent scores in the window
    const scores = await ctx.db
      .query('scores')
      .withIndex('by_time_score', (q) => q.gte('timestampMs', cutoff))
      .filter((q) => q.eq(q.field('window'), window))
      .collect();

    // Deduplicate by eventId keeping latest
    const latestByEvent = new Map<string, (typeof scores)[0]>();
    for (const s of scores) {
      const existing = latestByEvent.get(s.eventId);
      if (!existing || s.timestampMs > existing.timestampMs) {
        latestByEvent.set(s.eventId, s);
      }
    }

    const candidates = Array.from(latestByEvent.values()).slice(0, limit);

    let inserted = 0;
    let skipped = 0;

    for (const s of candidates) {
      // Skip if geo already exists
      const existingGeo = await ctx.db
        .query('eventGeo')
        .withIndex('by_event', (q) => q.eq('eventId', s.eventId))
        .first();
      if (existingGeo) {
        skipped++;
        continue;
      }

      const event = await ctx.db
        .query('events')
        .withIndex('by_event', (q) => q.eq('eventId', s.eventId))
        .first();
      if (!event) {
        skipped++;
        continue;
      }

      const enriched = enrichGeoFromText(
        event.title || '',
        s.topMarketQuestion || ''
      );
      if (!enriched) {
        skipped++;
        continue;
      }

      await ctx.db.insert('eventGeo', {
        eventId: s.eventId,
        lat: enriched.lat,
        lng: enriched.lng,
        region: enriched.region,
        country: enriched.country,
        geoConfidence: enriched.confidence,
        derivedFrom: 'inferred',
        updatedAt: Date.now(),
      });
      inserted++;
    }

    return { considered: candidates.length, inserted, skipped };
  },
});

// Get top tremors (highest scoring events)
export const getTopTremors = query({
  args: {
    window: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const window = args.window || '60m';
    const window = args.window || '60m';
    const limit = args.limit || 20;
    const cutoff = Date.now() - 5 * 60000; // Last 5 minutes of scores

    // Get recent EVENT scores
    const scores = await ctx.db
      .query('scores')
      .withIndex('by_time_score', (q) => q.gte('timestampMs', cutoff))
      .filter((q) => q.eq(q.field('window'), window))
      .collect();

    // Deduplicate by eventId - keep only the most recent score per event
    const latestScores = new Map<string, (typeof scores)[0]>();
    for (const score of scores) {
      const existing = latestScores.get(score.eventId);
      if (!existing || score.timestampMs > existing.timestampMs) {
        latestScores.set(score.eventId, score);
      }
    }

    // Sort by seismo score and take limit
    const sortedScores = Array.from(latestScores.values())
      .sort((a, b) => b.seismoScore - a.seismoScore)
      .slice(0, limit);

    // Join with event data
    const results = await Promise.all(
      sortedScores.map(async (score) => {
        const event = await ctx.db
          .query('events')
          .withIndex('by_event', (q) => q.eq('eventId', score.eventId))
          .first();

        if (event) {
          // Get the top market that moved
          const topMarket = await ctx.db
            .query('markets')
            .withIndex('by_condition', (q) =>
              q.eq('conditionId', score.topMarketId)
            )
            .first();

          // Server-side geo enrichment: prefer cached eventGeo, otherwise heuristic
          let geo: {
            lat: number;
            lng: number;
            region?: string;
            country?: string;
            confidence: string;
          } | null = null;
          const cached = await ctx.db
            .query('eventGeo')
            .withIndex('by_event', (q) => q.eq('eventId', score.eventId))
            .first();
          if (cached) {
            geo = {
              lat: cached.lat,
              lng: cached.lng,
              region: cached.region || undefined,
              country: cached.country || undefined,
              confidence: cached.geoConfidence,
            };
          } else {
            const enriched = enrichGeoFromText(
              event.title || '',
              score.topMarketQuestion || topMarket?.question || ''
            );
            if (enriched) {
              geo = enriched;
            }
          }

          return {
            ...score,
            event,
            topMarket,
            priceChange: score.topMarketChange,
            geo: geo || undefined,
          };
        }
        return null;
      })
    );

    return results.filter((r) => r !== null);
  },
});
