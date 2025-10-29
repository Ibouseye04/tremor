import { v } from 'convex/values';
import { internalAction, internalMutation, query } from './_generated/server';
import { api, internal } from './_generated/api';
import { enrichGeoFromText } from './geo';

type SnapshotDoc = {
  price01: number;
  timestampMs: number;
  volumeSince?: number;
};

// Compute Seismo score and persist to 'scores'
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
      .collect();

    if (markets.length === 0)
      return { error: 'No markets found for this event.' };

    const marketSnapshots = new Map<
      string,
      { start?: SnapshotDoc; end?: SnapshotDoc }
    >();

    for (const m of markets) {
      const endDoc = await ctx.db
        .query('priceSnapshots')
        .withIndex('by_market_time', (q) =>
          q.eq('conditionId', m.conditionId).lte('timestampMs', now)
        )
        .order('desc')
        .first();
      const end = endDoc || undefined;

      const startBeforeDoc = await ctx.db
        .query('priceSnapshots')
        .withIndex('by_market_time', (q) =>
          q.eq('conditionId', m.conditionId).lte('timestampMs', cutoff)
        )
        .order('desc')
        .first();

      const startAfterDoc = await ctx.db
        .query('priceSnapshots')
        .withIndex('by_market_time', (q) =>
          q.eq('conditionId', m.conditionId).gte('timestampMs', cutoff)
        )
        .order('asc')
        .first();

      let start = startBeforeDoc || undefined;
      if (
        startAfterDoc &&
        (!startBeforeDoc ||
          Math.abs(startAfterDoc.timestampMs - cutoff) <
            Math.abs(startBeforeDoc.timestampMs - cutoff))
      ) {
        start = startAfterDoc;
      }

      marketSnapshots.set(m.conditionId, { start, end });
    }

    let maxChange = 0;
    let maxChangeAbs = 0;
    let topMarketId = '';
    let topMarketQuestion = '';
    let totalVolume = 0;
    let topMarketVolume = 0;
    let activeMarkets = 0;
    let topPrev: number | undefined = undefined;
    let topCurr: number | undefined = undefined;
    let highestVolumeMarketId = '';
    let highestVolumeMarketQuestion = '';
    let highestVolumeMarketVolume = 0;

    const allMovements: Array<{
      conditionId: string;
      question: string;
      prevPrice: number;
      currPrice: number;
      change: number;
      volume: number;
    }> = [];

    for (const [conditionId, pair] of marketSnapshots) {
      const end = pair.end;
      if (!end) continue;
      const start = pair.start;

      const prev =
        typeof start?.price01 === 'number' ? start.price01 : end.price01;
      const curr = typeof end.price01 === 'number' ? end.price01 : prev;
      if (!Number.isFinite(prev) || !Number.isFinite(curr)) continue;

      const signedChange = (curr - prev) * 100;
      const absoluteChangeMagnitude = Math.abs(signedChange);

      const vols = await ctx.db
        .query('priceSnapshots')
        .withIndex('by_market_time', (q) =>
          q.eq('conditionId', conditionId).gte('timestampMs', cutoff)
        )
        .filter((q) => q.lte(q.field('timestampMs'), now))
        .collect();
      const marketVolume = vols.reduce(
        (sum, s) => sum + (s.volumeSince || 0),
        0
      );
      totalVolume += marketVolume;
      if (marketVolume > 0) activeMarkets++;

      const market = markets.find((m) => m.conditionId === conditionId);
      const marketQuestion = market?.question || 'Unknown';

      allMovements.push({
        conditionId,
        question: marketQuestion,
        prevPrice: prev,
        currPrice: curr,
        change: signedChange,
        volume: marketVolume,
      });

      if (marketVolume > highestVolumeMarketVolume) {
        highestVolumeMarketId = conditionId;
        highestVolumeMarketQuestion = marketQuestion;
        highestVolumeMarketVolume = marketVolume;
      }

      if (absoluteChangeMagnitude > maxChangeAbs) {
        maxChangeAbs = absoluteChangeMagnitude;
        maxChange = signedChange;
        topMarketId = conditionId;
        topMarketQuestion = marketQuestion;
        topMarketVolume = marketVolume;
        topPrev = prev;
        topCurr = curr;
      }
    }

    allMovements.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    if (topMarketId === '' && highestVolumeMarketId !== '') {
      topMarketId = highestVolumeMarketId;
      topMarketQuestion = highestVolumeMarketQuestion;
      topMarketVolume = highestVolumeMarketVolume;
      const hvmMovement = allMovements.find(
        (m) => m.conditionId === highestVolumeMarketId
      );
      if (hvmMovement) {
        topPrev = hvmMovement.prevPrice;
        topCurr = hvmMovement.currPrice;
        maxChange = hvmMovement.change;
        maxChangeAbs = Math.abs(hvmMovement.change);
      }
    }

    const avgPrice = 0.5;
    const usdVolume = totalVolume * avgPrice;

    const minVolume = 1000;
    const fullVolume = 10000;

    const volumeMultiplier =
      usdVolume < minVolume
        ? 0
        : Math.min(
            1,
            Math.sqrt((usdVolume - minVolume) / (fullVolume - minVolume))
          );

    let baseScore: number;
    const absChange = maxChangeAbs;

    if (absChange < 1) baseScore = absChange;
    else if (absChange < 5) baseScore = 1 + (absChange - 1) * 0.875;
    else if (absChange < 10) baseScore = 4.5 + (absChange - 5) * 0.5;
    else if (absChange < 20) baseScore = 7 + (absChange - 10) * 0.3;
    else baseScore = 10;

    const seismoScore = Math.max(
      0,
      Math.min(10, Math.round(baseScore * volumeMultiplier * 10) / 10)
    );

    const windowStr = `${args.windowMinutes}m`;

    return {
      eventId: args.eventId,
      window: windowStr,
      seismoScore,
      topMarketId,
      topMarketChange: maxChange,
      topMarketQuestion,
      topMarketPrevPrice01: topPrev,
      topMarketCurrPrice01: topCurr,
      marketMovements: allMovements,
      totalVolume,
      topMarketVolume,
      activeMarkets,
      timestampMs: now,
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

    // Get recent scores in the window from scores_lite
    const scores = await ctx.db
      .query('scores_lite')
      .withIndex('by_window_score', (q) => q.eq('window', window))
      .filter((q) => q.gte(q.field('updatedAt'), cutoff))
      .collect();

    // Map by event keeping latest updated
    const latestByEvent = new Map<string, (typeof scores)[0]>();
    for (const s of scores) {
      const existing = latestByEvent.get(s.eventId);
      if (!existing || s.updatedAt > existing.updatedAt) {
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
    const limit = args.limit || 20;

    // Read from materialized scores_lite
    const items = await ctx.db
      .query('scores_lite')
      .withIndex('by_window_score', (q) => q.eq('window', window))
      .order('desc')
      .take(limit);

    const results: Array<Record<string, unknown>> = [];
    for (const score of items) {
      const event = await ctx.db
        .query('events')
        .withIndex('by_event', (q) => q.eq('eventId', score.eventId))
        .first();
      const topMarket = score.topMarketId
        ? await ctx.db
            .query('markets')
            .withIndex('by_condition', (q) =>
              q.eq('conditionId', score.topMarketId!)
            )
            .first()
        : null;

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
      } else if (event) {
        const enriched = enrichGeoFromText(
          event.title || '',
          score.topMarketQuestion || topMarket?.question || ''
        );
        if (enriched) geo = enriched;
      }

      results.push({
        ...score,
        event,
        topMarket,
        priceChange: score.topMarketChange,
        timestampMs: score.updatedAt,
        geo: geo || undefined,
      });
    }

    return results;
  },
});

// Upsert a single scores_lite row
export const upsertScoreLite = internalMutation({
  args: {
    eventId: v.string(),
    window: v.string(),
    seismoScore: v.number(),
    topMarketId: v.optional(v.string()),
    topMarketChange: v.optional(v.number()),
    topMarketQuestion: v.optional(v.string()),
    topMarketPrevPrice01: v.optional(v.float64()),
    topMarketCurrPrice01: v.optional(v.float64()),
    marketMovements: v.optional(
      v.array(
        v.object({
          conditionId: v.string(),
          question: v.string(),
          prevPrice: v.float64(),
          currPrice: v.float64(),
          change: v.float64(),
          volume: v.float64(),
        })
      )
    ),
    totalVolume: v.optional(v.float64()),
    activeMarkets: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('scores_lite')
      .withIndex('by_event_window', (q) =>
        q.eq('eventId', args.eventId).eq('window', args.window)
      )
      .first();

    const doc = {
      eventId: args.eventId,
      window: args.window,
      updatedAt: Date.now(),
      seismoScore: args.seismoScore,
      topMarketId: args.topMarketId,
      topMarketChange: args.topMarketChange,
      topMarketQuestion: args.topMarketQuestion,
      topMarketPrevPrice01: args.topMarketPrevPrice01,
      topMarketCurrPrice01: args.topMarketCurrPrice01,
      marketMovements: args.marketMovements,
      totalVolume: args.totalVolume,
      activeMarkets: args.activeMarkets,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
    } else {
      await ctx.db.insert('scores_lite', doc);
    }
  },
});

// Materialize scores into scores_lite for instant lists
export const updateScoresLite = internalAction({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.runQuery(api.events.getActiveEvents, {
      limit: 500,
    });
    const windows = [5, 60, 1440];

    for (const event of events) {
      for (const windowMinutes of windows) {
        const scoreData = await ctx.runQuery(api.scoring.computeEventScore, {
          eventId: event.eventId,
          windowMinutes,
        });
        if (!('error' in scoreData)) {
          await ctx.runMutation(internal.scoring.upsertScoreLite, {
            eventId: event.eventId,
            window: `${windowMinutes}m`,
            seismoScore: scoreData.seismoScore,
            topMarketId: scoreData.topMarketId,
            topMarketChange: scoreData.topMarketChange,
            topMarketQuestion: scoreData.topMarketQuestion,
            topMarketPrevPrice01: scoreData.topMarketPrevPrice01,
            topMarketCurrPrice01: scoreData.topMarketCurrPrice01,
            marketMovements: scoreData.marketMovements,
            totalVolume: scoreData.totalVolume,
            activeMarkets: scoreData.activeMarkets,
          });
        }
      }
    }
  },
});
