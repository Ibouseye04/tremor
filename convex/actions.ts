import { internalAction } from './_generated/server';
import { internal, api } from './_generated/api';
import { logger } from '../lib/logger';

type GammaMarket = {
  conditionId?: string;
  question?: string;
  active?: boolean;
  closed?: boolean;
  lastTradePrice?: string | number | null;
  bestBid?: string | number | null;
  bestAsk?: string | number | null;
  volume24hr?: string | number | null;
};

type GammaEvent = {
  id?: string;
  slug?: string;
  title?: string;
  question?: string;
  description?: string;
  category?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  closed?: boolean;
  liquidity?: string | number | null;
  volume?: string | number | null;
  markets?: GammaMarket[];
};

type DataTrade = {
  price?: string | number | null;
  size?: string | number | null;
  timestamp: number;
  side?: string | null;
  transactionHash?: string;
  outcome?: string;
  filler?: { outcome?: string };
};

// Sync events and their markets from Gamma API
export const syncEvents = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      // Event filtering thresholds
      const MIN_DAILY_VOLUME = 1000; // $1k+ daily volume
      const MIN_TOTAL_VOLUME = 5000; // $5k+ total volume
      const MIN_LIQUIDITY = 2000; // $2k+ liquidity

      // Fetch ALL events using pagination
      const allEvents: GammaEvent[] = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const url = `https://gamma-api.polymarket.com/events/pagination?limit=${limit}&offset=${offset}&active=true&closed=false`;
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok)
          throw new Error(`Gamma API error: ${response.status}`);
        const json = (await response.json()) as
          | { data?: GammaEvent[]; pagination?: { hasMore?: boolean } }
          | GammaEvent[];
        const page: GammaEvent[] = Array.isArray(json)
          ? json
          : (json.data ?? []);
        allEvents.push(...page);
        const hasMore = Array.isArray(json)
          ? false
          : !!json.pagination?.hasMore;
        if (!hasMore) break;
        offset += limit;
        if (offset > 10000) break; // safety
      }

      let totalEvents = 0;
      let totalMarkets = 0;
      let filteredEvents = 0;

      for (const event of allEvents) {
        if (!event.markets || event.markets.length === 0) continue;

        const liquidity = parseFloat(String(event.liquidity ?? '0'));
        const totalVolume = parseFloat(String(event.volume ?? '0'));
        const eventVolume24hr = (event.markets as GammaMarket[]).reduce(
          (sum, m) => sum + parseFloat(String(m.volume24hr ?? '0')),
          0
        );

        if (
          eventVolume24hr < MIN_DAILY_VOLUME &&
          totalVolume < MIN_TOTAL_VOLUME &&
          liquidity < MIN_LIQUIDITY
        ) {
          filteredEvents++;
          continue;
        }

        const validMarkets = (event.markets as GammaMarket[])
          .filter((m) => !!m.conditionId && String(m.conditionId).length > 10)
          .map((m) => ({
            conditionId: String(m.conditionId),
            eventId: event.id || event.slug || '',
            question: m.question || 'Unknown',
            active: m.active !== false,
            closed: m.closed === true,
            lastTradePrice: parseFloat(String(m.lastTradePrice ?? '0')),
            bestBid:
              m.bestBid != null ? parseFloat(String(m.bestBid)) : undefined,
            bestAsk:
              m.bestAsk != null ? parseFloat(String(m.bestAsk)) : undefined,
            volume24hr: parseFloat(String(m.volume24hr ?? '0')),
          }));

        if (validMarkets.length === 0) {
          filteredEvents++;
          continue;
        }

        try {
          await ctx.runMutation(internal.events.upsertEvent, {
            event: {
              eventId: event.id || event.slug || '',
              slug: event.slug || '',
              title: event.title || event.question || 'Unknown Event',
              description: event.description,
              category: event.category,
              image: event.image || event.icon,
              active: event.active !== false,
              closed: event.closed === true,
              liquidity,
              volume: totalVolume,
              volume24hr: eventVolume24hr,
            },
          });
          totalEvents++;

          await ctx.runMutation(internal.markets.upsertMarkets, {
            markets: validMarkets,
          });
          totalMarkets += validMarkets.length;
        } catch (e) {
          logger.error(`Failed to store event ${event.id} with markets:`, e);
        }
      }

      logger.info(
        `Synced ${totalEvents} events with ${totalMarkets} markets (filtered ${filteredEvents})`
      );
    } catch (error) {
      logger.error('Event sync error:', error);
    }
  },
});

// Sync trades for hot markets
export const syncHotTrades = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const markets = await ctx.runQuery(api.markets.getMarketsToSync, {
        priority: 'hot',
        limit: 3,
      });

      for (const market of markets) {
        if (!market.market) continue;

        const since = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000); // 25h
        const params = new URLSearchParams({
          market: market.conditionId,
          limit: '500',
          after: since.toString(),
        });
        const response = await fetch(
          `https://data-api.polymarket.com/trades?${params}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) continue;
        const raw = (await response.json()) as unknown;
        const trades: DataTrade[] = Array.isArray(raw)
          ? (raw as DataTrade[])
          : [];

        if (trades.length === 0) continue;

        const transformed = trades
          .filter(
            (t) =>
              t.price != null &&
              t.size != null &&
              typeof t.timestamp === 'number'
          )
          .map((t) => {
            const rawPrice = parseFloat(String(t.price ?? '0'));
            const outcome = (
              t.outcome ||
              t.filler?.outcome ||
              'yes'
            ).toLowerCase();
            const normalizedPrice = outcome === 'no' ? 1 - rawPrice : rawPrice;
            return {
              conditionId: market.conditionId,
              eventId: market.market?.eventId || market.conditionId,
              timestampMs:
                t.timestamp < 10000000000 ? t.timestamp * 1000 : t.timestamp,
              price01: normalizedPrice,
              size: parseFloat(String(t.size ?? '0')),
              side: t.side || 'unknown',
              txHash:
                t.transactionHash ||
                `${market.conditionId}_${t.timestamp}_${t.price}_${t.size}`,
            };
          });

        const insertResult = await ctx.runMutation(
          internal.trades.insertTrades,
          {
            trades: transformed,
          }
        );

        await ctx.runMutation(internal.markets.updateSyncState, {
          conditionId: market.conditionId,
          lastTradeFetchMs: Date.now(),
        });

        logger.debug(
          `Processed ${transformed.length} trades → ${insertResult.inserted} snapshots for ${market.market.question}`
        );
      }
    } catch (error) {
      logger.error('Hot trade sync error:', error);
    }
  },
});

// Sync trades for warm markets
export const syncWarmTrades = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const markets = await ctx.runQuery(api.markets.getMarketsToSync, {
        priority: 'warm',
        limit: 10,
      });

      for (const market of markets) {
        if (!market.market) continue;

        const since = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000); // 25h
        const params = new URLSearchParams({
          market: market.conditionId,
          limit: '1000',
          after: since.toString(),
        });
        const response = await fetch(
          `https://data-api.polymarket.com/trades?${params}`,
          { headers: { Accept: 'application/json' } }
        );
        if (!response.ok) continue;
        const raw = (await response.json()) as unknown;
        const trades: DataTrade[] = Array.isArray(raw)
          ? (raw as DataTrade[])
          : [];
        if (trades.length === 0) continue;

        const transformed = trades
          .filter(
            (t) =>
              t.price != null &&
              t.size != null &&
              typeof t.timestamp === 'number'
          )
          .map((t) => {
            const rawPrice = parseFloat(String(t.price ?? '0'));
            const outcome = (
              t.outcome ||
              t.filler?.outcome ||
              'yes'
            ).toLowerCase();
            const normalizedPrice = outcome === 'no' ? 1 - rawPrice : rawPrice;
            return {
              conditionId: market.conditionId,
              eventId: market.market?.eventId || market.conditionId,
              timestampMs:
                t.timestamp < 10000000000 ? t.timestamp * 1000 : t.timestamp,
              price01: normalizedPrice,
              size: parseFloat(String(t.size ?? '0')),
              side: t.side || 'unknown',
              txHash:
                t.transactionHash ||
                `${market.conditionId}_${t.timestamp}_${t.price}_${t.size}`,
            };
          });

        await ctx.runMutation(internal.trades.insertTrades, {
          trades: transformed,
        });
        await ctx.runMutation(internal.markets.updateSyncState, {
          conditionId: market.conditionId,
          lastTradeFetchMs: Date.now(),
        });
      }
    } catch (error) {
      logger.error('Warm trade sync error:', error);
    }
  },
});

// Compute and materialize scores for all active events
export const computeAllScores = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      await ctx.runAction(internal.scoring.updateScoresLite, {});
      logger.info('Updated scores_lite for active events');
    } catch (error) {
      logger.error('Score computation error:', error);
    }
  },
});
