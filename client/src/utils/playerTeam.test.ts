import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { playerTeamLabel } from './playerTeam';

afterEach(async () => {
  await i18n.changeLanguage('zh');
});

describe('player team labels', () => {
  it('translates the Retired placeholder in every supported language', async () => {
    await i18n.changeLanguage('zh');
    expect(playerTeamLabel(i18n.t, 'Retired')).toBe('退役');
    expect(playerTeamLabel(i18n.t, 'retired')).toBe('退役');

    await i18n.changeLanguage('en');
    expect(playerTeamLabel(i18n.t, 'Retired')).toBe('Retired');

    await i18n.changeLanguage('ja');
    expect(playerTeamLabel(i18n.t, 'Retired')).toBe('引退');
  });

  it('preserves real team names', () => {
    expect(playerTeamLabel(i18n.t, 'G2 Esports')).toBe('G2 Esports');
  });
});
