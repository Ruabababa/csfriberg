import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { playerRoleLabel } from './playerRoles';

afterEach(async () => {
  await i18n.changeLanguage('zh');
});

describe('player role labels', () => {
  it('normalizes and translates Chinese role aliases and composites', async () => {
    await i18n.changeLanguage('zh');

    expect(playerRoleLabel('Entry')).toBe('突破');
    expect(playerRoleLabel('entry')).toBe('突破');
    expect(playerRoleLabel('Entry fragger / Flex')).toBe('突破 / 自由人/补位');
    expect(playerRoleLabel('flex,entry')).toBe('自由人/补位 / 突破');
    expect(playerRoleLabel('SupportIn-game leader')).toBe('辅助 / 指挥');
    expect(playerRoleLabel('In-game leaderSupport')).toBe('指挥 / 辅助');
    expect(playerRoleLabel('igl,support')).toBe('指挥 / 辅助');
  });

  it('deduplicates roles and preserves unknown values in Chinese', async () => {
    await i18n.changeLanguage('zh');

    expect(playerRoleLabel('Entry / Entry fragger')).toBe('突破');
    expect(playerRoleLabel('Coach')).toBe('Coach');
    expect(playerRoleLabel('Entry / Coach')).toBe('突破 / Coach');
  });

  it('keeps existing English and Japanese behavior', async () => {
    await i18n.changeLanguage('en');
    expect(playerRoleLabel('Flex')).toBe('Flex');
    expect(playerRoleLabel('Entry fragger / Flex')).toBe('Entry fragger / Flex');

    await i18n.changeLanguage('ja');
    expect(playerRoleLabel('Support')).toBe('サポート');
    expect(playerRoleLabel('Entry fragger / Flex')).toBe('Entry fragger / Flex');
  });
});
