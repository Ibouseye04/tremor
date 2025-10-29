import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';
import logger from '../lib/logger';

const http = httpRouter();

// Fetch markets from Gamma API
http.route({
  path: '/sync/markets',
  method: 'GET',
  handler: httpAction(async (ctx, _request) => {
    try {
      // Fetch from Gamma API
      const response = await fetch(
        'https://gamma-api.polymarket.com/markets?limit=500&active=true&closed=false',
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status}`);
      }

      const rawMarkets = (await response.json()) as unknown;

      // Transform to our schema
      type GammaMarket = {
        conditionId?: string;
        question?: string;
        slug?: string;
        endDate?: string;
        active?: boolean;
        closed?: boolean;
        lastTradePrice?: string | number | null;
        bestBid?: string | number | null;
        bestAsk?: string | number | null;
        volume24hr?: string | number | null;
      };

      const marketsArr: GammaMarket[] = Array.isArray(rawMarkets)
        ? (rawMarkets as GammaMarket[])
        : [];

      const transformed = marketsArr
        .filter((m) => !!m.conditionId && m.lastTradePrice != null) // Must have condition ID and price
        .map((m) => ({
          conditionId: m.conditionId as string,
          question: m.question || 'Unknown',
          slug: m.slug || (m.conditionId as string),
          endDate: m.endDate,
          active: m.active !== false,
          closed: m.closed === true,
          lastTradePrice: parseFloat(String(m.lastTradePrice ?? '0')),
          bestBid:
            m.bestBid != null ? parseFloat(String(m.bestBid)) : undefined,
          bestAsk:
            m.bestAsk != null ? parseFloat(String(m.bestAsk)) : undefined,
          volume24hr: parseFloat(String(m.volume24hr ?? '0')),
        }));

      // Store in database
      const result = await ctx.runMutation(internal.markets.upsertMarkets, {
        markets: transformed,
      });

      return new Response(
        JSON.stringify({
          success: true,
          ...result,
          marketsFound: markets.length,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      logger.error('Market sync error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }),
});

// Fetch trades from Data API
http.route({
  path: '/sync/trades',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { conditionId, since } = body;

      if (!conditionId) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'conditionId required',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Build query params
      const params = new URLSearchParams({
        market: conditionId,
        limit: '1000',
      });

      if (since) {
        params.append('after', since.toString());
      }

      // Fetch from Data API
      const response = await fetch(
        `https://data-api.polymarket.com/trades?${params}`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Data API error: ${response.status}`);
      }

      const rawTrades = (await response.json()) as unknown;

      // Lookup eventId for the conditionId (needed for aggregation by event)
      const market = await ctx.runQuery(api.markets.getMarketByConditionId, {
        conditionId,
      });
      const eventId = market?.eventId || conditionId;

      // Transform trades
      type DataTrade = {
        price?: string | number | null;
        size?: string | number | null;
        timestamp: number;
        side?: string | null;
        transactionHash: string;
      };
      const tradesArr: DataTrade[] = Array.isArray(rawTrades)
        ? (rawTrades as DataTrade[])
        : [];

      const transformed = tradesArr
        .filter(
          (t) =>
            t.price != null && t.size != null && typeof t.timestamp === 'number'
        )
        .map((t) => ({
          conditionId,
          eventId,
          timestampMs:
            t.timestamp < 10000000000 ? t.timestamp * 1000 : t.timestamp,
          price01: parseFloat(String(t.price ?? '0')),
          size: parseFloat(String(t.size ?? '0')),
          side: t.side || 'unknown',
          txHash: t.transactionHash,
        }));

      // Store trades (now directly aggregates into buckets)
      const insertResult = await ctx.runMutation(internal.trades.insertTrades, {
        trades: transformed,
      });

      // Update sync state
      if (transformed.length > 0) {
        const lastTrade = transformed[transformed.length - 1];
        await ctx.runMutation(internal.markets.updateSyncState, { conditionId, lastTradeFetchMs: Date.now(), lastTradeId: lastTrade.txHash });
      }

      return new Response(
        JSON.stringify({
          success: true,
          ...insertResult,
          tradesFound: trades.length,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      logger.error('Trade sync error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }),
});

// Admin: backfill event geo cache for recent events
http.route({
  path: '/admin/backfill-event-geo',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);
      const window = url.searchParams.get('window') || '60m';
      const sinceHours = parseInt(
        url.searchParams.get('sinceHours') || '24',
        10
      );
      const limit = parseInt(url.searchParams.get('limit') || '200', 10);

      const result = await ctx.runMutation(internal.scoring.backfillEventGeo, {
        window,
        sinceHours,
        limit,
      });

      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      logger.error('Backfill event geo error:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }),
});

export default http;
