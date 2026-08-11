export interface User {
  id: number;
  username: string;
  display_id: string | null;
  password_hash: string;
  role: 'user' | 'admin';
  token_version: number;
  matchmaking_restricted: boolean | number;
  created_at: string;
}

export interface Player {
  id: number;
  nickname: string;
  nationality: string;
  region: string;
  team: string;
  age: number | null;
  role: string;
  si_championships?: number | null;
  si_appearances?: number | null;
  status_raw?: string | null;
  /** Canonical R6 fields. Nullable during the compatibility migration. */
  major_si_championships?: number | null;
  major_si_appearances?: number | null;
  roles?: string[];
  birth_date?: string | null;
  source_url?: string | null;
  source_provider?: string | null;
  source_player_id?: string | null;
  source_updated_at?: string | null;
  data_version?: string | null;
  major_si_event_ids?: string | null;
  major_si_championship_event_ids?: string | null;
  /** @deprecated CS-era aliases retained for old rows and replays. */
  major_championships: number;
  major_appearances: number;
  difficulties?: string[];
  is_active: boolean | number;
  is_enabled: boolean | number;
  created_at: string;
}

export function majorSiChampionships(player: Pick<Player, 'major_si_championships' | 'major_championships'>): number {
  return player.major_si_championships == null
    ? Number(player.major_championships ?? 0)
    : Number(player.major_si_championships);
}

export function majorSiAppearances(player: Pick<Player, 'major_si_appearances' | 'major_appearances'>): number {
  return player.major_si_appearances == null
    ? Number(player.major_appearances ?? 0)
    : Number(player.major_si_appearances);
}

export function majorWins(player: Pick<Player, 'major_championships'>): number {
  return Number(player.major_championships ?? 0);
}

export function majorAppearances(player: Pick<Player, 'major_appearances'>): number {
  return Number(player.major_appearances ?? 0);
}

export function siWins(player: Pick<Player, 'si_championships'>): number {
  return Number(player.si_championships ?? 0);
}

export function siAppearances(player: Pick<Player, 'si_appearances'>): number {
  return Number(player.si_appearances ?? 0);
}

export type PlayerStatus = 'active' | 'retired' | 'unknown';

export function playerStatus(player: Pick<Player, 'status_raw' | 'is_active'>): PlayerStatus {
  const status = String(player.status_raw ?? '').trim().toLocaleLowerCase('en-US');
  if (status === 'active') return 'active';
  if (status === 'retired' || status === 'inactive') return 'retired';
  if (player.status_raw == null || status === '') return 'unknown';
  return Boolean(player.is_active) ? 'active' : 'retired';
}

export type FeedbackLevel = 'correct' | 'close' | 'wrong';

export interface AttributeFeedback {
  value: string | number | boolean | null;
  level: FeedbackLevel;
  /** 数值型属性的方向提示: higher = 目标比猜测大 */
  hint?: 'higher' | 'lower';
}

export interface GuessFeedback {
  playerId: number;
  nickname: string;
  correct: boolean;
  attributes: {
    nationality: AttributeFeedback;
    team: AttributeFeedback;
    age: AttributeFeedback;
    role: AttributeFeedback;
    majorWins: AttributeFeedback;
    majorAppearances: AttributeFeedback;
    siWins: AttributeFeedback;
    siAppearances: AttributeFeedback;
    status: AttributeFeedback;
  };
}

export interface GameRow {
  id: number;
  session_id: string | null;
  user_id: number | null;
  guest_key: string | null;
  target_player_id: number;
  mode: string;
  guesses: string;
  guess_times: string;
  status: 'playing' | 'won' | 'lost';
  guess_count: number;
  created_at: string;
  finished_at: string | null;
}
