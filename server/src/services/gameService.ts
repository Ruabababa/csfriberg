import { normalizeR6Role, R6_CLOSE_RANGES } from '../config/r6DataPolicy';
import { nationalityFeedbackCode } from '../config/r6CompetitionRegions';
import {
  Player,
  GuessFeedback,
  AttributeFeedback,
  majorAppearances,
  majorWins,
  playerStatus,
  siAppearances,
  siWins,
} from '../types';

function textAttr(guess: string | null | undefined, target: string | null | undefined): AttributeFeedback {
  const guessValue = guess?.trim() || null;
  const targetValue = target?.trim() || null;
  return {
    value: guessValue,
    level: guessValue && targetValue && guessValue === targetValue ? 'correct' : 'wrong',
  };
}

function nationalityAttr(guess: Player, target: Player): AttributeFeedback {
  const value = guess.nationality?.trim() || null;
  const code = nationalityFeedbackCode(
    guess.nationality,
    target.nationality,
    guess.region,
    target.region
  );
  return { value, level: code === 2 ? 'correct' : code === 1 ? 'close' : 'wrong' };
}

function roleTokens(player: Player): string[] {
  const source = player.roles?.length ? player.roles : [player.role];
  return [...new Set(source
    .flatMap((role) => String(role).split(/[,/|]/))
    .map((role) => role.trim())
    .filter(Boolean)
    .map((role) => normalizeR6Role(role)?.toLocaleLowerCase('en-US')
      ?? role.toLocaleLowerCase('en-US')))]
    .sort();
}

function roleDisplay(player: Player): string {
  const source = player.roles?.length ? player.roles : [player.role];
  return [...new Set(source.map((role) => String(role).trim()).filter(Boolean))].join(' / ');
}

function roleAttr(guess: Player, target: Player): AttributeFeedback {
  const guessRoles = roleTokens(guess);
  const targetRoles = new Set(roleTokens(target));
  if (!guessRoles.length || !targetRoles.size) {
    return { value: roleDisplay(guess) || null, level: 'wrong' };
  }
  const exact = guessRoles.length === targetRoles.size
    && guessRoles.every((role) => targetRoles.has(role));
  if (exact) return { value: roleDisplay(guess), level: 'correct' };
  if (guessRoles.some((role) => targetRoles.has(role))) {
    return { value: roleDisplay(guess), level: 'close' };
  }
  return { value: roleDisplay(guess), level: 'wrong' };
}

function numberAttr(
  guessVal: number | null | undefined,
  targetVal: number | null | undefined,
  closeRange: number
): AttributeFeedback {
  if (guessVal == null || targetVal == null) return { value: guessVal ?? null, level: 'wrong' };
  if (guessVal === targetVal) return { value: guessVal, level: 'correct' };
  const level = Math.abs(guessVal - targetVal) <= closeRange ? 'close' : 'wrong';
  return {
    value: guessVal,
    level,
    hint: targetVal > guessVal ? 'higher' : 'lower',
  };
}

/** 逐属性对比猜测选手与目标选手,产出反馈 */
export function compareGuess(guess: Player, target: Player): GuessFeedback {
  const correct = guess.id === target.id;
  return {
    playerId: guess.id,
    nickname: guess.nickname,
    correct,
    attributes: {
      nationality: nationalityAttr(guess, target),
      team: textAttr(guess.team, target.team),
      age: numberAttr(guess.age, target.age, R6_CLOSE_RANGES.age),
      role: roleAttr(guess, target),
      majorWins: numberAttr(
        majorWins(guess),
        majorWins(target),
        R6_CLOSE_RANGES.majorWins
      ),
      majorAppearances: numberAttr(
        majorAppearances(guess),
        majorAppearances(target),
        R6_CLOSE_RANGES.majorAppearances
      ),
      siWins: numberAttr(siWins(guess), siWins(target), R6_CLOSE_RANGES.siWins),
      siAppearances: numberAttr(
        siAppearances(guess),
        siAppearances(target),
        R6_CLOSE_RANGES.siAppearances
      ),
      status: textAttr(playerStatus(guess), playerStatus(target)),
    },
  };
}

/** Upgrade Redis game snapshots created before a feedback attribute was added. */
export function completeGuessFeedback(
  feedback: GuessFeedback,
  guess?: Player,
  target?: Player
): GuessFeedback {
  const attributes = feedback.attributes as Partial<GuessFeedback['attributes']>;
  const complete = (
    attributes.role
    && attributes.majorWins
    && attributes.majorAppearances
    && attributes.siWins
    && attributes.siAppearances
    && attributes.status
  );
  if (complete && (!guess || !target)) return feedback;
  const fallback = { value: '-', level: 'wrong' as const };
  return {
    ...feedback,
    attributes: {
      ...attributes,
      nationality: guess && target ? nationalityAttr(guess, target) : attributes.nationality,
      role: attributes.role ?? (guess && target ? roleAttr(guess, target) : fallback),
      majorWins: attributes.majorWins ?? (guess && target
        ? numberAttr(
            majorWins(guess),
            majorWins(target),
            R6_CLOSE_RANGES.majorWins
          )
        : fallback),
      majorAppearances: attributes.majorAppearances ?? (guess && target
        ? numberAttr(
            majorAppearances(guess),
            majorAppearances(target),
            R6_CLOSE_RANGES.majorAppearances
          )
        : fallback),
      siWins: attributes.siWins ?? (guess && target
        ? numberAttr(siWins(guess), siWins(target), R6_CLOSE_RANGES.siWins)
        : fallback),
      siAppearances: attributes.siAppearances ?? (guess && target
        ? numberAttr(siAppearances(guess), siAppearances(target), R6_CLOSE_RANGES.siAppearances)
        : fallback),
      status: attributes.status ?? (guess && target
        ? textAttr(playerStatus(guess), playerStatus(target))
        : fallback),
    } as GuessFeedback['attributes'],
  };
}

export const MAX_GUESSES = 8;
