import { describe, it, expect } from 'vitest';
import { compareGuess, completeGuessFeedback } from './gameService';
import { Player } from '../types';

function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: 1,
    nickname: 'test',
    nationality: 'FR',
    region: 'Europe',
    team: 'Fixture One',
    age: 35,
    role: 'Entry',
    roles: ['Entry'],
    major_championships: 1,
    major_appearances: 12,
    si_championships: 0,
    si_appearances: 4,
    status_raw: 'Active',
    is_active: true,
    created_at: '',
    ...overrides,
  };
}

describe('compareGuess', () => {
  const target = makePlayer({ id: 10, nickname: 'R6Target' });

  it('猜中时所有属性 correct', () => {
    const fb = compareGuess(target, target);
    expect(fb.correct).toBe(true);
    expect(Object.values(fb.attributes).every((a) => a.level === 'correct')).toBe(true);
  });

  it('同一联赛不同国家或地区给 close', () => {
    const guess = makePlayer({ id: 2, nationality: 'DE', region: 'Europe' });
    expect(compareGuess(guess, target).attributes.nationality.level).toBe('close');
  });

  it('不同赛区的国家或地区给 wrong', () => {
    const guess = makePlayer({ id: 2, nationality: 'BR', region: 'Brazil' });
    const fb = compareGuess(guess, target);
    expect(fb.attributes.nationality.level).toBe('wrong');
  });

  it('年龄相差 3 岁给 close 并带方向提示', () => {
    const guess = makePlayer({ id: 2, age: Number(target.age) - 3 });
    const fb = compareGuess(guess, target);
    expect(fb.attributes.age.level).toBe('close');
    // 猜的人更年轻,目标年龄更大
    expect(fb.attributes.age.hint).toBe('higher');
  });

  it('年龄相差 4 岁给 wrong', () => {
    const guess = makePlayer({ id: 2, age: Number(target.age) - 4 });
    expect(compareGuess(guess, target).attributes.age.level).toBe('wrong');
  });

  it('Major 出场次数相差 1 给 close 并带方向提示', () => {
    const guess = makePlayer({ id: 2, major_appearances: target.major_appearances - 1 });
    const fb = compareGuess(guess, target);
    expect(fb.attributes.majorAppearances.level).toBe('close');
    expect(fb.attributes.majorAppearances.hint).toBe('higher');
  });

  it('Major 出场次数相差 2 给 wrong 并带方向提示', () => {
    const guess = makePlayer({ id: 2, major_appearances: target.major_appearances - 2 });
    const fb = compareGuess(guess, target);
    expect(fb.attributes.majorAppearances.level).toBe('wrong');
    expect(fb.attributes.majorAppearances.hint).toBe('higher');
  });

  it('Major 冠军数相差 1 给 close 并带方向提示', () => {
    const guess = makePlayer({ id: 2, major_championships: 0 });
    const fb = compareGuess(guess, target);
    expect(fb.attributes.majorWins.level).toBe('close');
    expect(fb.attributes.majorWins.hint).toBe('higher');
  });

  it('Major 冠军数相差 2 给 wrong', () => {
    const guess = makePlayer({ id: 2, major_championships: target.major_championships + 2 });
    expect(compareGuess(guess, target).attributes.majorWins.level).toBe('wrong');
  });

  it('位置不同时给 wrong', () => {
    const guess = makePlayer({ id: 2, role: 'Support', roles: ['Support'] });
    expect(compareGuess(guess, target).attributes.role.level).toBe('wrong');
  });

  it('APL 北区内日韩互相接近，但与亚洲和大洋洲不接近', () => {
    const japan = makePlayer({ id: 2, nationality: 'Japan', region: 'APL North' });
    const korea = makePlayer({ id: 3, nationality: 'South Korea', region: 'APL North' });
    const thailand = makePlayer({ id: 4, nationality: 'Thailand', region: 'APL Asia' });
    const australia = makePlayer({ id: 5, nationality: 'Australia', region: 'APL Oceania' });
    expect(compareGuess(japan, korea).attributes.nationality.level).toBe('close');
    expect(compareGuess(japan, thailand).attributes.nationality.level).toBe('wrong');
    expect(compareGuess(japan, australia).attributes.nationality.level).toBe('wrong');
  });

  it('中国大陆、台湾、香港和澳门都归入 CNL', () => {
    const china = makePlayer({ id: 2, nationality: 'China', region: 'CNL' });
    for (const nationality of ['Taiwan', 'Hong Kong', 'Macau']) {
      const guess = makePlayer({ id: 3, nationality, region: 'CNL' });
      expect(compareGuess(guess, china).attributes.nationality.level).toBe('close');
    }
  });

  it('R6 多位置存在交集时给 close，完全相同的位置集合给 correct', () => {
    const r6Target = makePlayer({ id: 10, role: 'Support', roles: ['Support', 'Flex'] });
    const overlapping = makePlayer({ id: 2, role: 'Flex', roles: ['Flex', 'Entry'] });
    const exact = makePlayer({ id: 3, role: 'Support', roles: ['Flex', 'Support'] });
    expect(compareGuess(overlapping, r6Target).attributes.role.level).toBe('close');
    expect(compareGuess(exact, r6Target).attributes.role.level).toBe('correct');
  });

  it('SI 参赛与夺冠次数分别比较', () => {
    const guess = makePlayer({ id: 2, si_championships: 1, si_appearances: 3 });
    const feedback = compareGuess(guess, target);
    expect(feedback.attributes.siWins.level).toBe('close');
    expect(feedback.attributes.siAppearances.level).toBe('close');
  });

  it('旧反馈缺少选手数据时使用未知冠军数占位', () => {
    const legacy = compareGuess(target, target);
    delete (legacy.attributes as Partial<typeof legacy.attributes>).majorWins;
    expect(completeGuessFeedback(legacy).attributes.majorWins).toEqual({
      value: '-',
      level: 'wrong',
    });
  });

  it('现役状态不同给 wrong', () => {
    const guess = makePlayer({ id: 2, is_active: false, status_raw: 'Retired' });
    expect(compareGuess(guess, target).attributes.status.level).toBe('wrong');
  });
});
