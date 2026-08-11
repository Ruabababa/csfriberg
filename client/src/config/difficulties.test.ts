import { describe, expect, it } from 'vitest';
import { AVAILABLE_DIFFICULTIES, DIFFICULTIES } from './difficulties';

describe('difficulty config', () => {
  it('only exposes beginner while retaining future difficulty definitions', () => {
    expect(AVAILABLE_DIFFICULTIES.map((item) => item.key)).toEqual(['beginner']);
    expect(AVAILABLE_DIFFICULTIES[0]?.recommended).toBe(true);
    expect(DIFFICULTIES.map((item) => item.key)).toEqual(['beginner', 'easy', 'normal']);
    expect(DIFFICULTIES.find((item) => item.key === 'easy')?.enabled).toBe(false);
    expect(DIFFICULTIES.find((item) => item.key === 'normal')?.enabled).toBe(false);
    expect(DIFFICULTIES.find((item) => item.key === 'beginner')?.sortOrder).toBeLessThan(
      DIFFICULTIES.find((item) => item.key === 'easy')?.sortOrder ?? Infinity
    );
    expect(DIFFICULTIES.find((item) => item.key === 'easy')?.sortOrder).toBeLessThan(
      DIFFICULTIES.find((item) => item.key === 'normal')?.sortOrder ?? Infinity
    );
  });
});
