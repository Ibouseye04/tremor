import { MarketMovement } from '@/lib/types';

export type GeoConfidence = 'high' | 'medium' | 'low';

export interface GeoResult {
  lat: number;
  lng: number;
  region?: string;
  country?: string;
  confidence: GeoConfidence;
  source: 'title' | 'question' | 'inferred' | 'unknown';
}

// Approximate centroids for U.S. states
const US_STATES: Record<
  string,
  { abbr: string; lat: number; lng: number; aliases?: string[] }
> = {
  Alabama: { abbr: 'AL', lat: 32.806671, lng: -86.79113 },
  Alaska: { abbr: 'AK', lat: 61.370716, lng: -152.404419 },
  Arizona: { abbr: 'AZ', lat: 33.729759, lng: -111.431221 },
  Arkansas: { abbr: 'AR', lat: 34.969704, lng: -92.373123 },
  California: { abbr: 'CA', lat: 36.116203, lng: -119.681564 },
  Colorado: { abbr: 'CO', lat: 39.059811, lng: -105.311104 },
  Connecticut: { abbr: 'CT', lat: 41.597782, lng: -72.755371 },
  Delaware: { abbr: 'DE', lat: 39.318523, lng: -75.507141 },
  Florida: { abbr: 'FL', lat: 27.766279, lng: -81.686783 },
  Georgia: { abbr: 'GA', lat: 33.040619, lng: -83.643074 },
  Hawaii: { abbr: 'HI', lat: 21.094318, lng: -157.498337 },
  Idaho: { abbr: 'ID', lat: 44.240459, lng: -114.478828 },
  Illinois: { abbr: 'IL', lat: 40.349457, lng: -88.986137 },
  Indiana: { abbr: 'IN', lat: 39.849426, lng: -86.258278 },
  Iowa: { abbr: 'IA', lat: 42.011539, lng: -93.210526 },
  Kansas: { abbr: 'KS', lat: 38.5266, lng: -96.726486 },
  Kentucky: { abbr: 'KY', lat: 37.66814, lng: -84.670067 },
  Louisiana: { abbr: 'LA', lat: 31.169546, lng: -91.867805 },
  Maine: { abbr: 'ME', lat: 44.693947, lng: -69.381927 },
  Maryland: { abbr: 'MD', lat: 39.063946, lng: -76.802101 },
  Massachusetts: { abbr: 'MA', lat: 42.230171, lng: -71.530106 },
  Michigan: { abbr: 'MI', lat: 43.326618, lng: -84.536095 },
  Minnesota: { abbr: 'MN', lat: 45.694454, lng: -93.900192 },
  Mississippi: { abbr: 'MS', lat: 32.741646, lng: -89.678696 },
  Missouri: { abbr: 'MO', lat: 38.456085, lng: -92.288368 },
  Montana: { abbr: 'MT', lat: 46.921925, lng: -110.454353 },
  Nebraska: { abbr: 'NE', lat: 41.12537, lng: -98.268082 },
  Nevada: { abbr: 'NV', lat: 38.313515, lng: -117.055374 },
  'New Hampshire': { abbr: 'NH', lat: 43.452492, lng: -71.563896 },
  'New Jersey': { abbr: 'NJ', lat: 40.298904, lng: -74.521011 },
  'New Mexico': { abbr: 'NM', lat: 34.840515, lng: -106.248482 },
  'New York': { abbr: 'NY', lat: 42.165726, lng: -74.948051 },
  'North Carolina': { abbr: 'NC', lat: 35.630066, lng: -79.806419 },
  'North Dakota': { abbr: 'ND', lat: 47.528912, lng: -99.784012 },
  Ohio: { abbr: 'OH', lat: 40.388783, lng: -82.764915 },
  Oklahoma: { abbr: 'OK', lat: 35.565342, lng: -96.928917 },
  Oregon: { abbr: 'OR', lat: 44.572021, lng: -122.070938 },
  Pennsylvania: { abbr: 'PA', lat: 40.590752, lng: -77.209755 },
  'Rhode Island': { abbr: 'RI', lat: 41.680893, lng: -71.51178 },
  'South Carolina': { abbr: 'SC', lat: 33.856892, lng: -80.945007 },
  'South Dakota': { abbr: 'SD', lat: 44.299782, lng: -99.438828 },
  Tennessee: { abbr: 'TN', lat: 35.747845, lng: -86.692345 },
  Texas: { abbr: 'TX', lat: 31.054487, lng: -97.563461 },
  Utah: { abbr: 'UT', lat: 40.150032, lng: -111.862434 },
  Vermont: { abbr: 'VT', lat: 44.045876, lng: -72.710686 },
  Virginia: { abbr: 'VA', lat: 37.769337, lng: -78.169968 },
  Washington: { abbr: 'WA', lat: 47.400902, lng: -121.490494 },
  'West Virginia': { abbr: 'WV', lat: 38.491226, lng: -80.954456 },
  Wisconsin: { abbr: 'WI', lat: 44.268543, lng: -89.616508 },
  Wyoming: { abbr: 'WY', lat: 42.755966, lng: -107.30249 },
  District: {
    abbr: 'DC',
    lat: 38.9072,
    lng: -77.0369,
    aliases: [
      'district of columbia',
      'washington, d.c.',
      'washington dc',
      'dc',
    ],
  },
};

const ABBR_TO_STATE: Record<string, string> = Object.entries(US_STATES).reduce(
  (acc, [name, v]) => {
    acc[v.abbr] = name;
    return acc;
  },
  {} as Record<string, string>
);

type CountryEntry = {
  code: string;
  lat: number;
  lng: number;
  aliases?: string[];
};

// Approximate centroids for selected countries (MVP coverage)
const COUNTRIES: Record<string, CountryEntry> = {
  'United States': {
    code: 'US',
    lat: 39.8283,
    lng: -98.5795,
    aliases: [
      'usa',
      'u.s.a.',
      'u.s.',
      'us',
      'united states of america',
      'america',
    ],
  },
  Germany: { code: 'DE', lat: 51.1657, lng: 10.4515, aliases: ['deutschland'] },
  'United Kingdom': {
    code: 'GB',
    lat: 55.3781,
    lng: -3.436,
    aliases: [
      'uk',
      'u.k.',
      'britain',
      'great britain',
      'england',
      'scotland',
      'wales',
      'northern ireland',
      'gb',
    ],
  },
  France: { code: 'FR', lat: 46.2276, lng: 2.2137 },
  Italy: { code: 'IT', lat: 41.8719, lng: 12.5674, aliases: ['italia'] },
  Spain: { code: 'ES', lat: 40.4637, lng: -3.7492 },
  Portugal: { code: 'PT', lat: 39.3999, lng: -8.2245 },
  Netherlands: {
    code: 'NL',
    lat: 52.1326,
    lng: 5.2913,
    aliases: ['holland'],
  },
  Belgium: { code: 'BE', lat: 50.5039, lng: 4.4699 },
  Switzerland: { code: 'CH', lat: 46.8182, lng: 8.2275 },
  Austria: { code: 'AT', lat: 47.5162, lng: 14.5501 },
  Poland: { code: 'PL', lat: 51.9194, lng: 19.1451 },
  'Czech Republic': {
    code: 'CZ',
    lat: 49.8175,
    lng: 15.473,
    aliases: ['czechia'],
  },
  Sweden: { code: 'SE', lat: 60.1282, lng: 18.6435 },
  Norway: { code: 'NO', lat: 60.472, lng: 8.4689 },
  Denmark: { code: 'DK', lat: 56.2639, lng: 9.5018 },
  Finland: { code: 'FI', lat: 61.9241, lng: 25.7482 },
  Ireland: { code: 'IE', lat: 53.1424, lng: -7.6921 },
  Greece: { code: 'GR', lat: 39.0742, lng: 21.8243 },
  Turkey: { code: 'TR', lat: 38.9637, lng: 35.2433 },
  Russia: {
    code: 'RU',
    lat: 61.524,
    lng: 105.3188,
    aliases: ['russian federation'],
  },
  Ukraine: { code: 'UA', lat: 48.3794, lng: 31.1656 },
  Canada: { code: 'CA', lat: 56.1304, lng: -106.3468 },
  Mexico: { code: 'MX', lat: 23.6345, lng: -102.5528 },
  Brazil: { code: 'BR', lat: -14.235, lng: -51.9253 },
  Argentina: { code: 'AR', lat: -38.4161, lng: -63.6167 },
  Chile: { code: 'CL', lat: -35.6751, lng: -71.543 },
  Colombia: { code: 'CO', lat: 4.5709, lng: -74.2973 },
  Peru: { code: 'PE', lat: -9.19, lng: -75.0152 },
  China: {
    code: 'CN',
    lat: 35.8617,
    lng: 104.1954,
    aliases: ["people's republic of china", 'prc', 'mainland china'],
  },
  India: { code: 'IN', lat: 20.5937, lng: 78.9629 },
  Japan: { code: 'JP', lat: 36.2048, lng: 138.2529 },
  'South Korea': {
    code: 'KR',
    lat: 35.9078,
    lng: 127.7669,
    aliases: ['republic of korea', 'rok', 's. korea', 'south korea'],
  },
  'North Korea': {
    code: 'KP',
    lat: 40.3399,
    lng: 127.5101,
    aliases: ['dprk', 'north korea'],
  },
  Taiwan: { code: 'TW', lat: 23.6978, lng: 120.9605 },
  Singapore: { code: 'SG', lat: 1.3521, lng: 103.8198 },
  Malaysia: { code: 'MY', lat: 4.2105, lng: 101.9758 },
  Thailand: { code: 'TH', lat: 15.87, lng: 100.9925 },
  Vietnam: { code: 'VN', lat: 14.0583, lng: 108.2772 },
  Philippines: { code: 'PH', lat: 12.8797, lng: 121.774 },
  Indonesia: { code: 'ID', lat: -0.7893, lng: 113.9213 },
  Pakistan: { code: 'PK', lat: 30.3753, lng: 69.3451 },
  Bangladesh: { code: 'BD', lat: 23.685, lng: 90.3563 },
  Israel: { code: 'IL', lat: 31.0461, lng: 34.8516 },
  Iran: {
    code: 'IR',
    lat: 32.4279,
    lng: 53.688,
    aliases: ['islamic republic of iran'],
  },
  Iraq: { code: 'IQ', lat: 33.2232, lng: 43.6793 },
  'Saudi Arabia': { code: 'SA', lat: 23.8859, lng: 45.0792, aliases: ['ksa'] },
  'United Arab Emirates': {
    code: 'AE',
    lat: 23.4241,
    lng: 53.8478,
    aliases: ['uae', 'u.a.e.'],
  },
  Qatar: { code: 'QA', lat: 25.3548, lng: 51.1839 },
  Kuwait: { code: 'KW', lat: 29.3117, lng: 47.4818 },
  Egypt: { code: 'EG', lat: 26.8206, lng: 30.8025 },
  Nigeria: { code: 'NG', lat: 9.082, lng: 8.6753 },
  'South Africa': { code: 'ZA', lat: -30.5595, lng: 22.9375 },
  Australia: { code: 'AU', lat: -25.2744, lng: 133.7751 },
  'New Zealand': { code: 'NZ', lat: -40.9006, lng: 174.886 },
};

const COUNTRY_ALIASES: Record<string, string> = Object.entries(
  COUNTRIES
).reduce(
  (acc, [name, entry]) => {
    entry.aliases?.forEach((alias) => {
      acc[alias.toLowerCase()] = name;
    });
    return acc;
  },
  {} as Record<string, string>
);

function normalize(text: string): string {
  return text.toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordMatch(text: string, candidate: string): boolean {
  const pattern = escapeRegex(candidate).replace(/\s+/g, '\\s+');
  const re = new RegExp(`\\b${pattern}\\b`, 'i');
  return re.test(text);
}

function buildStateNameRegex(): RegExp {
  const names = Object.keys(US_STATES)
    .filter((n) => n !== 'District')
    .map((n) => n.replace(/\s+/g, '\\s+'))
    .join('|');
  return new RegExp(`\\b(${names})\\b`, 'i');
}

const STATE_NAME_REGEX = buildStateNameRegex();
const STATE_ABBR_REGEX = new RegExp(
  `\\b(${Object.values(US_STATES)
    .map((s) => s.abbr)
    .join('|')})\\b`,
  'i'
);

export class GeographicService {
  // Expose a helper for region filtering (US state match)
  static matchUSState(
    text: string
  ): { region: string; lat: number; lng: number } | null {
    const nameMatch = text.match(STATE_NAME_REGEX);
    if (nameMatch) {
      const stateName = this.normalizeStateName(nameMatch[1]);
      const byName = this.lookupState(stateName);
      if (byName)
        return { region: stateName, lat: byName.lat, lng: byName.lng };
    }
    const abbrMatch = text.match(STATE_ABBR_REGEX);
    if (abbrMatch) {
      const abbr = abbrMatch[1].toUpperCase();
      const stateName = ABBR_TO_STATE[abbr];
      const byAbbr = this.lookupState(stateName);
      if (byAbbr)
        return { region: stateName, lat: byAbbr.lat, lng: byAbbr.lng };
    }
    return null;
  }
  private static cache = new Map<string, GeoResult | null>();

  static clearCache() {
    this.cache.clear();
  }

  static resolveCountryName(query: string): string | null {
    const byName = this.matchCountryByName(query);
    if (byName?.country) return byName.country;
    const byAlias = this.matchCountryByAlias(query);
    if (byAlias?.country) return byAlias.country;
    return null;
  }

  static mapMovementToGeo(movement: MarketMovement): GeoResult | null {
    if (!movement) return null;
    const cacheKey = movement.eventId || movement.id;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    const title = normalize(movement.title || '');
    const question = normalize(movement.marketMovements?.[0]?.question || '');
    const text = `${title} ${question}`.trim();

    // Handle global/federal topics distinctly
    // Global keywords: map to a neutral world position with low confidence
    if (/(\b(global|worldwide|world)\b)/i.test(text)) {
      const result: GeoResult = {
        lat: 20,
        lng: 0,
        country: 'Global',
        confidence: 'low',
        source: 'inferred',
      };
      this.cache.set(cacheKey, result);
      return result;
    }
    // Federal/national (US) topics: map to Washington, D.C. with medium confidence
    if (
      /(\b(fed|federal|nationwide)\b)/i.test(text) ||
      /(\b(united\s+states|united\s+states\s+of\s+america|usa|u\.s\.a\.|u\.s\.|us)\b)/i.test(
        text
      )
    ) {
      const result: GeoResult = {
        lat: 38.9072,
        lng: -77.0369,
        region: 'Federal',
        country: 'US',
        confidence: 'medium',
        source: 'inferred',
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // Heuristic patterns
    // 1) U.S. state-specific offices
    const officeMatch = text.match(
      /\b(governor|senate|senator|house|governorship|attorney\s+general)\s+(of|in)\s+([a-zA-Z\s\.]+)\b/i
    );
    if (officeMatch) {
      const locationStr = officeMatch[3].trim();
      const byStateName = this.matchByName(locationStr);
      if (byStateName) {
        const result: GeoResult = {
          ...byStateName,
          confidence: 'high',
          source: 'question',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
      const byStateAbbr = this.matchByAbbr(locationStr);
      if (byStateAbbr) {
        const result: GeoResult = {
          ...byStateAbbr,
          confidence: 'medium',
          source: 'question',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
      // Country after office (e.g., 'president of France')
      const byCountryFromOffice =
        this.matchCountryByName(locationStr) ||
        this.matchCountryByAlias(locationStr);
      if (byCountryFromOffice) {
        const result: GeoResult = {
          ...byCountryFromOffice,
          confidence: this.isAlias(locationStr, byCountryFromOffice.country!)
            ? 'medium'
            : 'high',
          source: 'question',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // 2) Generic "in/at/of X" pattern
    const inMatch = text.match(/\b(in|at|of)\s+([a-zA-Z\s\.]+)\b/i);
    if (inMatch) {
      const locationStr = inMatch[2].trim();
      const byStateName = this.matchByName(locationStr);
      if (byStateName) {
        const result: GeoResult = {
          ...byStateName,
          confidence: 'high',
          source: 'question',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
      const byStateAbbr = this.matchByAbbr(locationStr);
      if (byStateAbbr) {
        const result: GeoResult = {
          ...byStateAbbr,
          confidence: 'medium',
          source: 'question',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
      const byCountryName = this.matchCountryByName(locationStr);
      if (byCountryName) {
        const result: GeoResult = {
          ...byCountryName,
          confidence: 'high',
          source: 'question',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
      const byCountryAlias = this.matchCountryByAlias(locationStr);
      if (byCountryAlias) {
        const result: GeoResult = {
          ...byCountryAlias,
          confidence: 'medium',
          source: 'question',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // 3) State name appears anywhere
    const nameMatch = text.match(STATE_NAME_REGEX);
    if (nameMatch) {
      const stateName = this.normalizeStateName(nameMatch[1]);
      const byName = this.lookupState(stateName);
      if (byName) {
        const result: GeoResult = {
          ...byName,
          confidence: 'high',
          source: 'title',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    // 4) Country appears anywhere (name, then alias)
    const byCountryAnywhereName = this.matchCountryByName(text);
    if (byCountryAnywhereName) {
      const result: GeoResult = {
        ...byCountryAnywhereName,
        confidence: 'high',
        source: 'title',
      };
      this.cache.set(cacheKey, result);
      return result;
    }
    const byCountryAnywhereAlias = this.matchCountryByAlias(text);
    if (byCountryAnywhereAlias) {
      const result: GeoResult = {
        ...byCountryAnywhereAlias,
        confidence: 'medium',
        source: 'title',
      };
      this.cache.set(cacheKey, result);
      return result;
    }

    // 5) State abbreviation appears anywhere
    const abbrMatch = text.match(STATE_ABBR_REGEX);
    if (abbrMatch) {
      const abbr = abbrMatch[1].toUpperCase();
      const stateName = ABBR_TO_STATE[abbr];
      const byAbbr = this.lookupState(stateName);
      if (byAbbr) {
        const result: GeoResult = {
          ...byAbbr,
          confidence: 'medium',
          source: 'title',
        };
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    this.cache.set(cacheKey, null);
    return null;
  }

  private static matchByName(
    fragment: string
  ): Omit<GeoResult, 'confidence' | 'source'> | null {
    const normalized = fragment.replace(/\./g, '').trim();
    // Try exact state name match
    for (const stateName of Object.keys(US_STATES)) {
      const n = stateName.toLowerCase();
      if (normalized.toLowerCase().startsWith(n)) {
        const s = US_STATES[stateName];
        return { lat: s.lat, lng: s.lng, region: stateName, country: 'US' };
      }
      // Match aliases for DC
      const aliases = US_STATES[stateName].aliases || [];
      if (aliases.some((a) => normalized.toLowerCase().includes(a))) {
        const s = US_STATES[stateName];
        return { lat: s.lat, lng: s.lng, region: stateName, country: 'US' };
      }
    }
    return null;
  }

  private static matchByAbbr(
    fragment: string
  ): Omit<GeoResult, 'confidence' | 'source'> | null {
    const tokens = fragment
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (const t of tokens) {
      const stateName = ABBR_TO_STATE[t];
      if (stateName) {
        const s = US_STATES[stateName];
        return { lat: s.lat, lng: s.lng, region: stateName, country: 'US' };
      }
    }
    return null;
  }

  private static lookupState(
    stateName?: string
  ): Omit<GeoResult, 'confidence' | 'source'> | null {
    if (!stateName) return null;
    const s = US_STATES[stateName];
    if (!s) return null;
    return { lat: s.lat, lng: s.lng, region: stateName, country: 'US' };
  }

  private static normalizeStateName(name: string): string {
    // Capitalize words correctly
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private static matchCountryByName(
    fragment: string
  ): Omit<GeoResult, 'confidence' | 'source'> | null {
    const norm = fragment.toLowerCase();
    for (const name of Object.keys(COUNTRIES)) {
      if (wordMatch(norm, name.toLowerCase())) {
        const c = COUNTRIES[name];
        return { lat: c.lat, lng: c.lng, country: name };
      }
    }
    return null;
  }

  private static matchCountryByAlias(
    fragment: string
  ): Omit<GeoResult, 'confidence' | 'source'> | null {
    const norm = fragment.toLowerCase();
    for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) {
      if (wordMatch(norm, alias)) {
        const c = COUNTRIES[name];
        return { lat: c.lat, lng: c.lng, country: name };
      }
    }
    return null;
  }

  private static isAlias(fragment: string, countryName: string): boolean {
    const entry = COUNTRIES[countryName];
    if (!entry?.aliases) return false;
    const f = fragment.toLowerCase();
    return entry.aliases.some((a) => wordMatch(f, a.toLowerCase()));
  }
}
