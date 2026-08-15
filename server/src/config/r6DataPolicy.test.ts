import { describe, expect, it } from 'vitest';
import {
  R6_CLOSE_RANGES,
  normalizeR6Role,
  normalizeR6Region,
  R6_EVENT_TYPES,
} from './r6DataPolicy';

describe('R6 data policy', () => {
  it('defines only Major and Six Invitational as counted event types', () => {
    expect(R6_EVENT_TYPES).toEqual(['major', 'six_invitational']);
  });

  it('normalizes common role aliases without accepting staff roles', () => {
    expect(normalizeR6Role('Entry Fragger')).toBe('Entry');
    expect(normalizeR6Role('In-Game Leader')).toBe('IGL');
    expect(normalizeR6Role('Coach')).toBeNull();
  });

  it('keeps the agreed numeric close ranges', () => {
    expect(R6_CLOSE_RANGES).toEqual({
      age: 3,
      majorWins: 1,
      majorAppearances: 1,
      siWins: 1,
      siAppearances: 1,
    });
  });

  it('normalizes current R6 top-level regions', () => {
    expect(normalizeR6Region('NA')).toBe('NAL');
    expect(normalizeR6Region('LATAM')).toBe('SAL');
    expect(normalizeR6Region('Japan')).toBe('APL North');
    expect(normalizeR6Region('South Korea')).toBe('APL North');
    expect(normalizeR6Region('Oceania')).toBe('APL Oceania');
    expect(normalizeR6Region('China')).toBe('CNL');
    expect(normalizeR6Region('CIS')).toBeNull();
  });
});
