import i18n from '../i18n';

export const PLAYER_ROLE_OPTIONS = [
  { value: 'Entry', labelKey: 'player.roles.entry' },
  { value: 'Fragger', labelKey: 'player.roles.fragger' },
  { value: 'Flex', labelKey: 'player.roles.flex' },
  { value: 'Support', labelKey: 'player.roles.support' },
  { value: 'Hard Breach', labelKey: 'player.roles.hardBreach' },
  { value: 'Soft Breach', labelKey: 'player.roles.softBreach' },
  { value: 'IGL', labelKey: 'player.roles.igl' },
  { value: 'Roamer', labelKey: 'player.roles.roamer' },
  { value: 'Anchor', labelKey: 'player.roles.anchor' },
  { value: 'Lurker', labelKey: 'player.roles.lurker' },
] as const;

const ROLE_LABELS = new Map<string, string>(
  PLAYER_ROLE_OPTIONS.map(({ value, labelKey }) => [value, labelKey])
);

const ROLE_ALIASES = new Map<string, string>([
  ['entry fragger', 'Entry'],
  ['entry', 'Entry'],
  ['fragger', 'Fragger'],
  ['flex', 'Flex'],
  ['support', 'Support'],
  ['hard breach', 'Hard Breach'],
  ['soft breach', 'Soft Breach'],
  ['in-game leader', 'IGL'],
  ['in game leader', 'IGL'],
  ['igl', 'IGL'],
  ['roamer', 'Roamer'],
  ['anchor', 'Anchor'],
  ['lurker', 'Lurker'],
]);

const ROLE_TOKEN_PATTERN = /entry\s*fragger|in[-\s]*game\s*leader|hard\s*breach|soft\s*breach|support|flex|entry|fragger|igl|roamer|anchor|lurker/gi;

function normalizeChineseRoles(role: string): string[] {
  const normalized: string[] = [];

  for (const segment of role.split(/\s*[/,|;+]\s*/)) {
    const matches = [...segment.matchAll(ROLE_TOKEN_PATTERN)];
    if (!matches.length) {
      if (segment.trim()) normalized.push(segment.trim());
      continue;
    }

    const unmatched = matches.reduce(
      (remaining, match) => remaining.replace(match[0], ''),
      segment
    ).trim();
    if (unmatched) {
      normalized.push(segment.trim());
      continue;
    }

    for (const match of matches) {
      const alias = match[0].toLowerCase().replace(/\s+/g, ' ').replace('in game leader', 'in-game leader');
      const canonical = ROLE_ALIASES.get(alias);
      if (canonical && !normalized.includes(canonical)) normalized.push(canonical);
    }
  }

  return normalized;
}

export function playerRoleLabel(role: string): string {
  if (i18n.resolvedLanguage?.startsWith('zh') || i18n.language.startsWith('zh')) {
    return normalizeChineseRoles(role)
      .map((normalizedRole) => {
        const key = ROLE_LABELS.get(normalizedRole);
        return key ? i18n.t(key) : normalizedRole;
      })
      .join(' / ');
  }

  const key = ROLE_LABELS.get(role);
  return key ? i18n.t(key) : role;
}
