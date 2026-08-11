import { describe, expect, it } from 'vitest';
import {
  competitionRegionForNationality,
  competitionRegionsForNationality,
  nationalityFeedbackCode,
} from './r6CompetitionRegions';

describe('R6 competition regions', () => {
  it.each([
    ['United States', 'NAL'],
    ['Brazil', 'SAL'],
    ['France', 'EML'],
    ['Japan', 'APL North'],
    ['South Korea', 'APL North'],
    ['Thailand', 'APL Asia'],
    ['Australia', 'APL Oceania'],
    ['China', 'CNL'],
    ['Taiwan', 'CNL'],
    ['Hong Kong', 'CNL'],
    ['Macau', 'CNL'],
    ['Macao', 'CNL'],
  ])('maps %s to %s', (country, region) => {
    expect(competitionRegionForNationality(country)).toBe(region);
  });

  it('preserves every region represented by a multi-nationality value', () => {
    expect([...competitionRegionsForNationality('Australia / Japan')]).toEqual([
      'APL Oceania',
      'APL North',
    ]);
    expect(competitionRegionForNationality('Australia / Japan')).toBeNull();
  });

  it('uses exact, same-subregion, and different-subregion feedback states', () => {
    expect(nationalityFeedbackCode('Japan', 'Japan')).toBe(2);
    expect(nationalityFeedbackCode('JP', 'Japan')).toBe(2);
    expect(nationalityFeedbackCode('Hong Kong', 'HK')).toBe(2);
    expect(nationalityFeedbackCode('Japan / Australia', 'AU / JP')).toBe(2);
    expect(nationalityFeedbackCode('Japan', 'South Korea')).toBe(1);
    expect(nationalityFeedbackCode('Japan', 'Thailand')).toBe(0);
    expect(nationalityFeedbackCode('Japan', 'Australia')).toBe(0);
    expect(nationalityFeedbackCode('Taiwan', 'Hong Kong')).toBe(1);
  });
});
