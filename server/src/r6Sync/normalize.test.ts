import { describe, expect, it } from 'vitest';
import fixture from './fixtures/snapshot.json';
import { ageAtDate, normalizeR6Snapshot } from './normalize';

describe('R6 snapshot normalization', () => {
  it('normalizes official fields and applies the configured difficulty policy', () => {
    const result = normalizeR6Snapshot(fixture, { knownPlayerIds: ['fixture-bravo'] });
    expect(result.summary).toEqual({ input: 3, accepted: 3, reviewed: 0, rejected: 0 });
    expect(result.players.find((player) => player.sourcePlayerId === 'fixture-alpha')?.difficulties)
      .toEqual(['normal', 'easy', 'beginner']);
    expect(result.players.find((player) => player.sourcePlayerId === 'fixture-bravo')?.difficulties)
      .toEqual(['normal', 'easy']);
    expect(result.players.find((player) => player.sourcePlayerId === 'fixture-charlie')?.difficulties)
      .toEqual(['normal']);
  });

  it('calculates age at the snapshot date', () => {
    expect(ageAtDate('2000-08-05', '2026-08-04T00:00:00.000Z')).toBe(25);
    expect(ageAtDate('2000-08-04', '2026-08-04T00:00:00.000Z')).toBe(26);
  });

  it('routes conflicting event and role data to review', () => {
    const invalid = structuredClone(fixture);
    invalid.players[0].roles = ['Coach'];
    invalid.players[0].majorSiEventIds = ['major-fixture-1', 'major-fixture-1'];
    invalid.players[0].majorSiChampionshipEventIds = ['missing-event'];
    const result = normalizeR6Snapshot(invalid);
    expect(result.summary.reviewed).toBe(1);
    expect(result.summary.rejected).toBe(0);
    expect(result.review[0].disposition).toBe('review');
    expect(result.review[0].reasons).toEqual(expect.arrayContaining([
      'UNKNOWN_ROLE',
      'DUPLICATE_EVENT_ID',
      'CHAMPIONSHIP_EVENT_NOT_IN_APPEARANCES',
    ]));
  });

  it('rejects malformed records without aborting the rest of the snapshot', () => {
    const invalid = structuredClone(fixture) as unknown as { players: unknown[] };
    invalid.players.push({ nickname: 'MissingIdentity' });
    const result = normalizeR6Snapshot(invalid);
    expect(result.summary).toMatchObject({ input: 4, accepted: 3, reviewed: 0, rejected: 1 });
    expect(result.review.at(-1)).toMatchObject({
      nickname: 'MissingIdentity',
      disposition: 'rejected',
    });
  });
});
