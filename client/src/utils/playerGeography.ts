import type { TFunction } from 'i18next';

export interface GeographyOption {
  value: string;
  key: string;
}

interface GeographyDefinition extends GeographyOption {
  englishName?: string;
  aliases?: string[];
}

const countryDefinitions: GeographyDefinition[] = [
  { value: 'AM', key: 'armenia', englishName: 'Armenia', aliases: ['亚美尼亚'] },
  { value: 'AR', key: 'argentina', englishName: 'Argentina', aliases: ['阿根廷'] },
  { value: 'AU', key: 'australia', englishName: 'Australia', aliases: ['澳大利亚'] },
  { value: 'AZ', key: 'azerbaijan', englishName: 'Azerbaijan', aliases: ['阿塞拜疆'] },
  { value: 'BA', key: 'bosniaHerzegovina', englishName: 'Bosnia and Herzegovina', aliases: ['波黑'] },
  { value: 'BE', key: 'belgium', englishName: 'Belgium', aliases: ['比利时'] },
  { value: 'BG', key: 'bulgaria', englishName: 'Bulgaria', aliases: ['保加利亚'] },
  { value: 'BR', key: 'brazil', englishName: 'Brazil', aliases: ['巴西'] },
  { value: 'BY', key: 'belarus', englishName: 'Belarus', aliases: ['白俄罗斯'] },
  { value: 'CA', key: 'canada', englishName: 'Canada', aliases: ['加拿大'] },
  { value: 'CH', key: 'switzerland', englishName: 'Switzerland', aliases: ['瑞士'] },
  { value: 'CL', key: 'chile', englishName: 'Chile', aliases: ['智利'] },
  { value: 'CN', key: 'china', englishName: 'China', aliases: ['中国'] },
  { value: 'CZ', key: 'czechia', englishName: 'Czechia', aliases: ['Czech Republic', '捷克'] },
  { value: 'DE', key: 'germany', englishName: 'Germany', aliases: ['德国'] },
  { value: 'DK', key: 'denmark', englishName: 'Denmark', aliases: ['丹麦'] },
  { value: 'EE', key: 'estonia', englishName: 'Estonia', aliases: ['爱沙尼亚'] },
  { value: 'ES', key: 'spain', englishName: 'Spain', aliases: ['西班牙'] },
  { value: 'FI', key: 'finland', englishName: 'Finland', aliases: ['芬兰'] },
  { value: 'FR', key: 'france', englishName: 'France', aliases: ['法国'] },
  { value: 'GB', key: 'unitedKingdom', englishName: 'United Kingdom', aliases: ['UK', 'Great Britain', '英国'] },
  { value: 'GB-SCT', key: 'scotland', englishName: 'Scotland', aliases: ['苏格兰'] },
  { value: 'GT', key: 'guatemala', englishName: 'Guatemala', aliases: ['危地马拉'] },
  { value: 'HK', key: 'hongKong', englishName: 'Hong Kong', aliases: ['香港', '中国香港'] },
  { value: 'HU', key: 'hungary', englishName: 'Hungary', aliases: ['匈牙利'] },
  { value: 'ID', key: 'indonesia', englishName: 'Indonesia', aliases: ['印度尼西亚'] },
  { value: 'IL', key: 'israel', englishName: 'Israel', aliases: ['以色列'] },
  { value: 'IN', key: 'india', englishName: 'India', aliases: ['印度'] },
  { value: 'JO', key: 'jordan', englishName: 'Jordan', aliases: ['约旦'] },
  { value: 'JP', key: 'japan', englishName: 'Japan', aliases: ['日本'] },
  { value: 'KR', key: 'southKorea', englishName: 'South Korea', aliases: ['韩国'] },
  { value: 'KZ', key: 'kazakhstan', englishName: 'Kazakhstan', aliases: ['哈萨克斯坦'] },
  { value: 'LT', key: 'lithuania', englishName: 'Lithuania', aliases: ['立陶宛'] },
  { value: 'LV', key: 'latvia', englishName: 'Latvia', aliases: ['拉脱维亚'] },
  { value: 'ME', key: 'montenegro', englishName: 'Montenegro', aliases: ['黑山'] },
  { value: 'MK', key: 'northMacedonia', englishName: 'North Macedonia', aliases: ['北马其顿'] },
  { value: 'MN', key: 'mongolia', englishName: 'Mongolia', aliases: ['蒙古'] },
  { value: 'MO', key: 'macau', englishName: 'Macau', aliases: ['Macao', '澳门', '中国澳门'] },
  { value: 'MX', key: 'mexico', englishName: 'Mexico', aliases: ['墨西哥'] },
  { value: 'MY', key: 'malaysia', englishName: 'Malaysia', aliases: ['马来西亚'] },
  { value: 'NL', key: 'netherlands', englishName: 'Netherlands', aliases: ['荷兰'] },
  { value: 'NO', key: 'norway', englishName: 'Norway', aliases: ['挪威'] },
  { value: 'NZ', key: 'newZealand', englishName: 'New Zealand', aliases: ['新西兰'] },
  { value: 'PH', key: 'philippines', englishName: 'Philippines', aliases: ['菲律宾'] },
  { value: 'PL', key: 'poland', englishName: 'Poland', aliases: ['波兰'] },
  { value: 'PT', key: 'portugal', englishName: 'Portugal', aliases: ['葡萄牙'] },
  { value: 'RO', key: 'romania', englishName: 'Romania', aliases: ['罗马尼亚'] },
  { value: 'RS', key: 'serbia', englishName: 'Serbia', aliases: ['塞尔维亚'] },
  { value: 'RU', key: 'russia', englishName: 'Russia', aliases: ['俄罗斯'] },
  { value: 'SA', key: 'saudiArabia', englishName: 'Saudi Arabia', aliases: ['沙特阿拉伯'] },
  { value: 'SE', key: 'sweden', englishName: 'Sweden', aliases: ['瑞典'] },
  { value: 'SG', key: 'singapore', englishName: 'Singapore', aliases: ['新加坡'] },
  { value: 'SK', key: 'slovakia', englishName: 'Slovakia', aliases: ['斯洛伐克'] },
  { value: 'TH', key: 'thailand', englishName: 'Thailand', aliases: ['泰国'] },
  { value: 'TR', key: 'turkey', englishName: 'Turkey', aliases: ['Türkiye', '土耳其'] },
  { value: 'TW', key: 'taiwan', englishName: 'Taiwan', aliases: ['台湾', '中国台湾'] },
  { value: 'UA', key: 'ukraine', englishName: 'Ukraine', aliases: ['乌克兰'] },
  { value: 'US', key: 'unitedStates', englishName: 'United States', aliases: ['USA', 'United States of America', '美国'] },
  { value: 'UY', key: 'uruguay', englishName: 'Uruguay', aliases: ['乌拉圭'] },
  { value: 'UZ', key: 'uzbekistan', englishName: 'Uzbekistan', aliases: ['乌兹别克斯坦'] },
  { value: 'XK', key: 'kosovo', englishName: 'Kosovo', aliases: ['塞尔维亚科索沃', '科索沃'] },
  { value: 'ZA', key: 'southAfrica', englishName: 'South Africa', aliases: ['南非'] },
];

const regionDefinitions: GeographyDefinition[] = [
  { value: 'NAL', key: 'nal', aliases: ['North America', 'NA', '北美', '北美洲'] },
  { value: 'SAL', key: 'sal', aliases: ['South America', 'Latin America', 'LATAM', 'Brazil', '南美', '南美洲', '拉丁美洲'] },
  { value: 'EML', key: 'eml', aliases: ['Europe', 'MENA', 'EMEA', '欧洲', '中东和北非'] },
  { value: 'APL North', key: 'aplNorth', aliases: ['APAC North', 'Japan', 'South Korea', '亚太北区'] },
  { value: 'APL Asia', key: 'aplAsia', aliases: ['Asia', 'APAC', '亚洲'] },
  { value: 'APL Oceania', key: 'aplOceania', aliases: ['Oceania', 'OCE', '大洋洲'] },
  { value: 'CNL', key: 'cnl', aliases: ['China', 'CN', '中国赛区'] },
];

export const COUNTRY_OPTIONS: GeographyOption[] = countryDefinitions.map(({ value, key }) => ({ value, key }));
export const REGION_OPTIONS: GeographyOption[] = regionDefinitions.map(({ value, key }) => ({ value, key }));

function maps(definitions: GeographyDefinition[]) {
  const keys = new Map<string, string>();
  const canonical = new Map<string, string>();
  for (const definition of definitions) {
    for (const value of [definition.value, definition.englishName, ...(definition.aliases ?? [])]) {
      if (!value) continue;
      const normalized = normalizeLookupValue(value);
      keys.set(normalized, definition.key);
      canonical.set(normalized, definition.value);
    }
  }
  return { keys, canonical };
}

function normalizeLookupValue(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

const countries = maps(countryDefinitions);
const regions = maps(regionDefinitions);

export function countryLabel(t: TFunction, value: string): string {
  return value.split(/\s*\/\s*/).map((part) => {
    const trimmed = part.trim();
    const key = countries.keys.get(normalizeLookupValue(trimmed));
    return key ? String(t(`geography.countries.${key}`)) : trimmed;
  }).join(' / ');
}

export function regionLabel(t: TFunction, value: string): string {
  const key = regions.keys.get(normalizeLookupValue(value));
  return key ? String(t(`geography.regions.${key}`)) : value;
}

export function isKnownCountry(value: string): boolean {
  return countries.keys.has(normalizeLookupValue(value));
}

export function isKnownRegion(value: string): boolean {
  return regions.keys.has(normalizeLookupValue(value));
}

export function canonicalCountryValue(value: string): string {
  const trimmed = value.trim();
  return countries.canonical.get(normalizeLookupValue(trimmed)) ?? trimmed;
}

export function canonicalRegionValue(value: string): string {
  const trimmed = value.trim();
  return regions.canonical.get(normalizeLookupValue(trimmed)) ?? trimmed;
}
