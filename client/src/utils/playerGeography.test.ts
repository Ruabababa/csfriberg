import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import {
  COUNTRY_OPTIONS,
  REGION_OPTIONS,
  canonicalCountryValue,
  canonicalRegionValue,
  countryLabel,
  regionLabel,
} from './playerGeography';

afterEach(async () => {
  await i18n.changeLanguage('zh');
});

describe('player geography labels', () => {
  it('covers every country and region in all supported languages', async () => {
    expect(COUNTRY_OPTIONS).toHaveLength(62);
    expect(REGION_OPTIONS).toHaveLength(7);
    for (const language of ['zh', 'en', 'ja']) {
      await i18n.changeLanguage(language);
      for (const option of COUNTRY_OPTIONS) {
        expect(countryLabel(i18n.t, option.value)).not.toContain('geography.countries.');
      }
      for (const option of REGION_OPTIONS) {
        expect(regionLabel(i18n.t, option.value)).not.toContain('geography.regions.');
      }
    }
  });

  it('translates canonical values and preserves unknown values', async () => {
    await i18n.changeLanguage('en');
    expect(countryLabel(i18n.t, '瑞典')).toBe('Sweden');
    expect(countryLabel(i18n.t, 'SE')).toBe('Sweden');
    expect(canonicalCountryValue('瑞典')).toBe('SE');
    expect(regionLabel(i18n.t, '欧洲')).toBe('EML');
    expect(regionLabel(i18n.t, '北美')).toBe('NAL');
    expect(canonicalRegionValue('北美')).toBe('NAL');

    await i18n.changeLanguage('zh');
    expect(countryLabel(i18n.t, 'United States')).toBe('美国');
    expect(countryLabel(i18n.t, 'Brazil / United States')).toBe('巴西 / 美国');
    expect(countryLabel(i18n.t, 'Russia / Armenia')).toBe('俄罗斯 / 亚美尼亚');
    expect(countryLabel(i18n.t, 'United Kingdom / Scotland')).toBe('英国 / 苏格兰');
    expect(countryLabel(i18n.t, 'united states')).toBe('美国');
    expect(countryLabel(i18n.t, 'Taiwan')).toBe('中国台湾');
    expect(countryLabel(i18n.t, 'Hong Kong / China')).toBe('中国香港 / 中国');
    expect(countryLabel(i18n.t, 'Macau')).toBe('中国澳门');
    expect(canonicalRegionValue('North America')).toBe('NAL');
    expect(canonicalRegionValue('Japan')).toBe('APL North');

    await i18n.changeLanguage('ja');
    expect(countryLabel(i18n.t, '乌克兰')).toBe('ウクライナ');
    expect(regionLabel(i18n.t, 'Asia')).toBe('APL アジア');
    expect(countryLabel(i18n.t, '未知国家')).toBe('未知国家');
  });
});
