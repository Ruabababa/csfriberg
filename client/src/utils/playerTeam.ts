import type { TFunction } from 'i18next';

export function playerTeamLabel(t: TFunction, value: string): string {
  const trimmed = value.trim();
  return trimmed.toLocaleLowerCase('en-US') === 'retired'
    ? String(t('common.retired'))
    : trimmed;
}
