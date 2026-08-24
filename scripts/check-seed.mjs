import players from '../server/src/db/seeds/players.json' with { type: 'json' };

const required = ['player_id', 'nickname', 'country_region', 'current_team', 'birth_date', 'status_raw', 'liquipedia_url', 'scraped_at'];
if (players.length !== 81) throw new Error('FIXED_SEED_COUNT_MUST_BE_81');
const ids = new Set();
for (const player of players) {
  if (!player.player_id || ids.has(player.player_id)) throw new Error('SEED_PLAYER_ID_MUST_BE_UNIQUE');
  ids.add(player.player_id);
  for (const field of required) if (!String(player[field] ?? '').trim()) throw new Error(`SEED_PLAYER_REQUIRED_FIELD_MISSING:${player.player_id}:${field}`);
  if (player.major_wins > player.major_appearances || player.si_wins > player.si_appearances) throw new Error(`SEED_PLAYER_STATS_INVALID:${player.player_id}`);
}
console.log(JSON.stringify({ ok: true, players: players.length }));
