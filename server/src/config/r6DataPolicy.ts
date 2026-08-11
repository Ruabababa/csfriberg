/**
 * Shared policy constants for the R6 data importer and game-rule migration.
 * This file intentionally has no runtime side effects; later scraper/database
 * work should import these values instead of duplicating string literals.
 */

export const R6_EVENT_TYPES = ['major', 'six_invitational'] as const;
export type R6EventType = (typeof R6_EVENT_TYPES)[number];

export const R6_ROLE_LABELS = [
  'Entry',
  'Fragger',
  'Flex',
  'Support',
  'Hard Breach',
  'Soft Breach',
  'IGL',
  'Roamer',
  'Anchor',
  'Lurker',
] as const;
export type R6RoleLabel = (typeof R6_ROLE_LABELS)[number];

export const R6_REGION_LABELS = [
  'NAL',
  'SAL',
  'EML',
  'APL North',
  'APL Asia',
  'APL Oceania',
  'CNL',
] as const;
export type R6RegionLabel = (typeof R6_REGION_LABELS)[number];

/**
 * Aliases are deliberately conservative. Unknown values should be retained
 * as raw data and reported for review rather than silently discarded.
 */
export const R6_ROLE_ALIASES: Readonly<Record<string, R6RoleLabel>> = {
  'entry fragger': 'Entry',
  entry: 'Entry',
  fragger: 'Fragger',
  flex: 'Flex',
  support: 'Support',
  'hard support': 'Support',
  'hard breach': 'Hard Breach',
  'soft breach': 'Soft Breach',
  'soft support': 'Soft Breach',
  igl: 'IGL',
  'in-game leader': 'IGL',
  'in game leader': 'IGL',
  roamer: 'Roamer',
  anchor: 'Anchor',
  lurker: 'Lurker',
};

export const R6_REGION_ALIASES: Readonly<Record<string, R6RegionLabel>> = {
  nal: 'NAL',
  'north america': 'NAL',
  na: 'NAL',
  sal: 'SAL',
  'south america': 'SAL',
  'latin america': 'SAL',
  latam: 'SAL',
  brazil: 'SAL',
  br: 'SAL',
  eml: 'EML',
  europe: 'EML',
  eu: 'EML',
  mena: 'EML',
  emea: 'EML',
  'apl north': 'APL North',
  'apac north': 'APL North',
  japan: 'APL North',
  jp: 'APL North',
  'south korea': 'APL North',
  korea: 'APL North',
  kr: 'APL North',
  'apl asia': 'APL Asia',
  asia: 'APL Asia',
  apac: 'APL Asia',
  'apl oceania': 'APL Oceania',
  oceania: 'APL Oceania',
  oce: 'APL Oceania',
  cnl: 'CNL',
  china: 'CNL',
  cn: 'CNL',
};

export const R6_CLOSE_RANGES = {
  age: 3,
  majorWins: 1,
  majorAppearances: 1,
  siWins: 1,
  siAppearances: 1,
} as const;

export function normalizeR6Role(value: string): R6RoleLabel | null {
  const normalized = value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  return R6_ROLE_ALIASES[normalized] ?? null;
}

export function normalizeR6Region(value: string): R6RegionLabel | null {
  const normalized = value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  return R6_REGION_ALIASES[normalized] ?? null;
}
