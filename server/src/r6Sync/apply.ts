import type { Knex } from 'knex';
import { db } from '../db/knex';
import type { NormalizedR6Player, R6ApplyResult } from './types';

export async function applyR6Players(input: {
  players: NormalizedR6Player[];
  fullSync: boolean;
}, instance: Knex = db): Promise<R6ApplyResult> {
  let created = 0;
  let updated = 0;
  let disabled = 0;

  await instance.transaction(async (trx) => {
    const seenIds: number[] = [];
    for (const player of input.players) {
      const existing = await trx('players')
        .where({
          source_provider: player.sourceProvider,
          source_player_id: player.sourcePlayerId,
        })
        .first('id');
      const values = {
        nickname: player.nickname,
        nationality: player.nationality,
        region: player.region,
        team: player.team,
        age: player.age,
        birth_date: player.birthDate,
        role: player.role,
        roles: JSON.stringify(player.roles),
        major_championships: player.majorSiChampionships,
        major_appearances: player.majorSiAppearances,
        major_si_championships: player.majorSiChampionships,
        major_si_appearances: player.majorSiAppearances,
        major_si_event_ids: JSON.stringify(player.majorSiEventIds),
        major_si_championship_event_ids: JSON.stringify(player.majorSiChampionshipEventIds),
        source_provider: player.sourceProvider,
        source_player_id: player.sourcePlayerId,
        source_url: player.sourceUrl,
        source_updated_at: player.sourceUpdatedAt,
        data_version: player.dataVersion,
        is_active: player.isActive,
        is_enabled: true,
      };

      let playerId: number;
      if (existing) {
        playerId = Number(existing.id);
        await trx('players').where({ id: playerId }).update(values);
        updated += 1;
      } else {
        const [inserted] = await trx('players').insert(values).returning('id');
        playerId = Number(typeof inserted === 'object' ? inserted.id : inserted);
        created += 1;
      }
      seenIds.push(playerId);
      await trx('player_difficulties').where({ player_id: playerId }).del();
      await trx('player_difficulties').insert(
        player.difficulties.map((difficultyKey) => ({
          player_id: playerId,
          difficulty_key: difficultyKey,
        }))
      );
    }

    if (input.fullSync) {
      const missingOfficial = trx('players')
        .where({ source_provider: 'liquipedia', is_enabled: true });
      if (seenIds.length) missingOfficial.whereNotIn('id', seenIds);
      const officialIds = (await missingOfficial.select('id')).map((row) => Number(row.id));
      const legacyIds = (await trx('players')
        .whereNull('source_provider')
        .where({ is_enabled: true })
        .select('id'))
        .map((row) => Number(row.id));
      const disabledIds = [...new Set([...officialIds, ...legacyIds])];
      if (disabledIds.length) {
        await trx('players').whereIn('id', disabledIds).update({ is_enabled: false });
        await trx('player_difficulties').whereIn('player_id', disabledIds).del();
        disabled = disabledIds.length;
      }
    }
  });

  return { created, updated, disabled };
}
