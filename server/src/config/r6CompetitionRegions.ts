import { normalizeR6Region, type R6RegionLabel } from './r6DataPolicy';

export type R6CompetitionRegion = R6RegionLabel;

const REGION_COUNTRIES: Readonly<Record<R6CompetitionRegion, readonly string[]>> = {
  NAL: [
    'CA', 'Canada',
    'CR', 'Costa Rica',
    'DO', 'Dominican Republic',
    'GT', 'Guatemala',
    'MX', 'Mexico',
    'US', 'United States',
  ],
  SAL: [
    'AR', 'Argentina',
    'BO', 'Bolivia',
    'BR', 'Brazil',
    'CL', 'Chile',
    'CO', 'Colombia',
    'EC', 'Ecuador',
    'PE', 'Peru',
    'PY', 'Paraguay',
    'UY', 'Uruguay',
    'VE', 'Venezuela',
  ],
  EML: [
    'AM', 'Armenia',
    'AT', 'Austria',
    'AZ', 'Azerbaijan',
    'BA', 'Bosnia and Herzegovina',
    'BE', 'Belgium',
    'BG', 'Bulgaria',
    'BY', 'Belarus',
    'CH', 'Switzerland',
    'CY', 'Cyprus',
    'CZ', 'Czechia', 'Czech Republic',
    'DE', 'Germany',
    'DK', 'Denmark',
    'DZ', 'Algeria',
    'EE', 'Estonia',
    'EG', 'Egypt',
    'ES', 'Spain',
    'FI', 'Finland',
    'FR', 'France',
    'GB', 'United Kingdom', 'England', 'Scotland', 'Wales', 'Northern Ireland',
    'GR', 'Greece',
    'HR', 'Croatia',
    'HU', 'Hungary',
    'IE', 'Ireland',
    'IL', 'Israel',
    'IQ', 'Iraq',
    'IS', 'Iceland',
    'IT', 'Italy',
    'JO', 'Jordan',
    'KW', 'Kuwait',
    'LB', 'Lebanon',
    'LT', 'Lithuania',
    'LU', 'Luxembourg',
    'LV', 'Latvia',
    'MA', 'Morocco',
    'ME', 'Montenegro',
    'MK', 'North Macedonia',
    'MT', 'Malta',
    'NG', 'Nigeria',
    'NL', 'Netherlands',
    'NO', 'Norway',
    'PL', 'Poland',
    'PT', 'Portugal',
    'QA', 'Qatar',
    'RO', 'Romania',
    'RS', 'Serbia', 'Kosovo',
    'RU', 'Russia',
    'SA', 'Saudi Arabia',
    'SE', 'Sweden',
    'SI', 'Slovenia',
    'SK', 'Slovakia',
    'SY', 'Syria',
    'TN', 'Tunisia',
    'TR', 'Turkey',
    'UA', 'Ukraine',
    'XK',
    'ZA', 'South Africa',
  ],
  'APL North': [
    'JP', 'Japan',
    'KR', 'South Korea', 'Korea',
  ],
  'APL Asia': [
    'BD', 'Bangladesh',
    'ID', 'Indonesia',
    'IN', 'India',
    'KZ', 'Kazakhstan',
    'LK', 'Sri Lanka',
    'MN', 'Mongolia',
    'MY', 'Malaysia',
    'NP', 'Nepal',
    'PH', 'Philippines',
    'PK', 'Pakistan',
    'SG', 'Singapore',
    'TH', 'Thailand',
    'UZ', 'Uzbekistan',
    'VN', 'Vietnam',
  ],
  'APL Oceania': [
    'AU', 'Australia',
    'NZ', 'New Zealand',
  ],
  CNL: [
    'CN', 'China',
    'HK', 'Hong Kong',
    'MO', 'Macau', 'Macao',
    'TW', 'Taiwan',
  ],
};

const regionByCountry = new Map<string, R6CompetitionRegion>();
const countryIdentityByAlias = new Map<string, string>();
for (const [region, countries] of Object.entries(REGION_COUNTRIES) as Array<[
  R6CompetitionRegion,
  readonly string[],
]>) {
  let countryIdentity = '';
  for (const country of countries) {
    if (/^[A-Z]{2}$/.test(country)) countryIdentity = country;
    const alias = country.trim().toLocaleLowerCase('en-US');
    regionByCountry.set(alias, region);
    countryIdentityByAlias.set(alias, countryIdentity || alias);
  }
}

function nationalityParts(value: string | null | undefined): string[] {
  return String(value ?? '')
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function competitionRegionsForNationality(
  nationality: string | null | undefined
): Set<R6CompetitionRegion> {
  const regions = new Set<R6CompetitionRegion>();
  for (const country of nationalityParts(nationality)) {
    const region = regionByCountry.get(country.toLocaleLowerCase('en-US'));
    if (region) regions.add(region);
  }
  return regions;
}

export function competitionRegionForNationality(
  nationality: string | null | undefined
): R6CompetitionRegion | null {
  const regions = competitionRegionsForNationality(nationality);
  return regions.size === 1 ? regions.values().next().value ?? null : null;
}

export function nationalityFeedbackCode(
  guessNationality: string | null | undefined,
  targetNationality: string | null | undefined,
  guessRegion?: string | null,
  targetRegion?: string | null
): 0 | 1 | 2 {
  const guessValue = guessNationality?.trim() ?? '';
  const targetValue = targetNationality?.trim() ?? '';
  const identities = (value: string) => nationalityParts(value)
    .map((country) => countryIdentityByAlias.get(country.toLocaleLowerCase('en-US')) ?? country)
    .sort();
  const guessIdentities = identities(guessValue);
  const targetIdentities = identities(targetValue);
  if (
    guessIdentities.length
    && guessIdentities.length === targetIdentities.length
    && guessIdentities.every((identity, index) => identity === targetIdentities[index])
  ) return 2;

  const guessRegions = competitionRegionsForNationality(guessValue);
  const targetRegions = competitionRegionsForNationality(targetValue);
  if (!guessRegions.size && guessRegion) {
    const normalized = normalizeR6Region(guessRegion);
    if (normalized) guessRegions.add(normalized);
  }
  if (!targetRegions.size && targetRegion) {
    const normalized = normalizeR6Region(targetRegion);
    if (normalized) targetRegions.add(normalized);
  }
  return [...guessRegions].some((region) => targetRegions.has(region)) ? 1 : 0;
}
