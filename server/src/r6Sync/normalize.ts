import { z } from 'zod';
import knownPlayers from '../config/r6KnownPlayers.json';
import { normalizeR6Region, normalizeR6Role } from '../config/r6DataPolicy';
import type {
  NormalizedR6Player,
  R6NormalizationResult,
  R6ReviewItem,
  R6Snapshot,
} from './types';

const snapshotPlayerSchema = z.object({
  sourceId: z.string().trim().min(1).max(256),
  nickname: z.string().trim().min(1).max(64),
  nationality: z.string().trim().regex(/^[A-Z]{2}$/),
  region: z.string().trim().min(1).max(64),
  team: z.string().trim().max(64),
  birthDate: z.string().date(),
  roles: z.array(z.string().trim().min(1).max(64)).min(1).max(8),
  status: z.enum(['active', 'inactive', 'unknown']),
  sourceUrl: z.string().url().max(512),
  sourceUpdatedAt: z.string().datetime(),
  majorSiEventIds: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
  majorSiChampionshipEventIds: z.array(z.string().trim().min(1).max(256)).max(100),
});

const snapshotSchema = z.object({
  provider: z.literal('liquipedia'),
  dataVersion: z.string().trim().min(1).max(64),
  generatedAt: z.string().datetime(),
  fullSync: z.boolean(),
  players: z.array(z.unknown()).max(5000),
});

function fieldReason(issue: z.ZodIssue): string {
  const field = issue.path[0];
  return field ? `INVALID_${String(field).replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}` : 'INVALID_PLAYER';
}

export function ageAtDate(birthDate: string, at: string): number {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const snapshot = new Date(at);
  let age = snapshot.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = snapshot.getUTCMonth() < birth.getUTCMonth()
    || (snapshot.getUTCMonth() === birth.getUTCMonth()
      && snapshot.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function normalizeR6Snapshot(
  input: unknown,
  options: { knownPlayerIds?: Iterable<string> } = {}
): R6NormalizationResult {
  const snapshot = snapshotSchema.parse(input);
  const knownPlayerIds = new Set(options.knownPlayerIds ?? knownPlayers);
  const validPlayers: R6Snapshot['players'] = [];
  const review: R6ReviewItem[] = [];
  for (const rawPlayer of snapshot.players) {
    const parsed = snapshotPlayerSchema.safeParse(rawPlayer);
    if (parsed.success) {
      validPlayers.push(parsed.data);
      continue;
    }
    const record = rawPlayer && typeof rawPlayer === 'object'
      ? rawPlayer as Record<string, unknown>
      : {};
    review.push({
      sourcePlayerId: typeof record.sourceId === 'string' ? record.sourceId : '',
      nickname: typeof record.nickname === 'string' ? record.nickname : '',
      disposition: 'rejected',
      reasons: [...new Set(parsed.error.issues.map(fieldReason))],
    });
  }
  const sourceIdCounts = new Map<string, number>();
  for (const player of validPlayers) {
    sourceIdCounts.set(player.sourceId, (sourceIdCounts.get(player.sourceId) ?? 0) + 1);
  }

  const players: NormalizedR6Player[] = [];

  for (const player of validPlayers) {
    const reasons: string[] = [];
    const region = normalizeR6Region(player.region);
    if (!region) reasons.push('UNKNOWN_REGION');
    if (player.status === 'unknown') reasons.push('UNKNOWN_ACTIVE_STATUS');
    if ((sourceIdCounts.get(player.sourceId) ?? 0) > 1) reasons.push('DUPLICATE_SOURCE_PLAYER_ID');
    if (hasDuplicates(player.majorSiEventIds)) reasons.push('DUPLICATE_EVENT_ID');
    if (hasDuplicates(player.majorSiChampionshipEventIds)) reasons.push('DUPLICATE_CHAMPIONSHIP_EVENT_ID');

    const eventIds = new Set(player.majorSiEventIds);
    if (player.majorSiChampionshipEventIds.some((eventId) => !eventIds.has(eventId))) {
      reasons.push('CHAMPIONSHIP_EVENT_NOT_IN_APPEARANCES');
    }

    const roles = [...new Set(player.roles.map(normalizeR6Role).filter((role) => role !== null))];
    if (roles.length !== new Set(player.roles.map((role) => role.trim().toLocaleLowerCase('en-US'))).size) {
      reasons.push('UNKNOWN_ROLE');
    }

    const age = ageAtDate(player.birthDate, snapshot.generatedAt);
    if (!Number.isInteger(age) || age < 10 || age > 100) reasons.push('INVALID_AGE');
    if (player.majorSiEventIds.length === 0) reasons.push('NO_MAJOR_SI_APPEARANCE');
    if (player.majorSiChampionshipEventIds.length > player.majorSiEventIds.length) {
      reasons.push('CHAMPIONSHIPS_EXCEED_APPEARANCES');
    }

    if (reasons.length || !region || !roles.length) {
      review.push({
        sourcePlayerId: player.sourceId,
        nickname: player.nickname,
        disposition: reasons.includes('NO_MAJOR_SI_APPEARANCE') ? 'rejected' : 'review',
        reasons,
      });
      continue;
    }

    const champion = player.majorSiChampionshipEventIds.length > 0;
    const difficulties: NormalizedR6Player['difficulties'] = ['normal'];
    if (champion || knownPlayerIds.has(player.sourceId)) difficulties.push('easy');
    if (champion) difficulties.push('beginner');

    players.push({
      sourceProvider: 'liquipedia',
      sourcePlayerId: player.sourceId,
      nickname: player.nickname,
      nationality: player.nationality,
      region,
      team: player.team,
      age,
      birthDate: player.birthDate,
      role: roles[0],
      roles,
      majorSiChampionships: player.majorSiChampionshipEventIds.length,
      majorSiAppearances: player.majorSiEventIds.length,
      majorSiEventIds: [...player.majorSiEventIds].sort(),
      majorSiChampionshipEventIds: [...player.majorSiChampionshipEventIds].sort(),
      isActive: player.status === 'active',
      difficulties,
      sourceUrl: player.sourceUrl,
      sourceUpdatedAt: player.sourceUpdatedAt,
      dataVersion: snapshot.dataVersion,
    });
  }

  return {
    snapshot: {
      provider: snapshot.provider,
      dataVersion: snapshot.dataVersion,
      generatedAt: snapshot.generatedAt,
      fullSync: snapshot.fullSync,
    },
    players,
    review,
    summary: {
      input: snapshot.players.length,
      accepted: players.length,
      reviewed: review.filter((item) => item.disposition === 'review').length,
      rejected: review.filter((item) => item.disposition === 'rejected').length,
    },
  };
}
