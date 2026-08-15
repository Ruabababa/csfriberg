import type { R6RegionLabel, R6RoleLabel } from '../config/r6DataPolicy';

export interface R6SnapshotPlayer {
  sourceId: string;
  nickname: string;
  nationality: string;
  region: string;
  team: string;
  birthDate: string;
  roles: string[];
  status: 'active' | 'inactive' | 'unknown';
  sourceUrl: string;
  sourceUpdatedAt: string;
  majorSiEventIds: string[];
  majorSiChampionshipEventIds: string[];
}

export interface R6Snapshot {
  provider: 'liquipedia';
  dataVersion: string;
  generatedAt: string;
  fullSync: boolean;
  players: R6SnapshotPlayer[];
}

export interface NormalizedR6Player {
  sourceProvider: 'liquipedia';
  sourcePlayerId: string;
  nickname: string;
  nationality: string;
  region: R6RegionLabel;
  team: string;
  age: number;
  birthDate: string;
  role: R6RoleLabel;
  roles: R6RoleLabel[];
  majorSiChampionships: number;
  majorSiAppearances: number;
  majorSiEventIds: string[];
  majorSiChampionshipEventIds: string[];
  isActive: boolean;
  difficulties: Array<'normal' | 'easy' | 'beginner'>;
  sourceUrl: string;
  sourceUpdatedAt: string;
  dataVersion: string;
}

export interface R6ReviewItem {
  sourcePlayerId: string;
  nickname: string;
  disposition: 'review' | 'rejected';
  reasons: string[];
}

export interface R6NormalizationResult {
  snapshot: Pick<R6Snapshot, 'provider' | 'dataVersion' | 'generatedAt' | 'fullSync'>;
  players: NormalizedR6Player[];
  review: R6ReviewItem[];
  summary: {
    input: number;
    accepted: number;
    reviewed: number;
    rejected: number;
  };
}

export interface R6ApplyResult {
  created: number;
  updated: number;
  disabled: number;
}
