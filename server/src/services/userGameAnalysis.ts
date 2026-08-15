import { normalizeR6Role, R6_CLOSE_RANGES } from '../config/r6DataPolicy';
import { nationalityFeedbackCode } from '../config/r6CompetitionRegions';
import { majorAppearances, majorWins, playerStatus, siAppearances, siWins } from '../types';
import type { Player } from '../types';

// Keep the benchmark bounded while covering the full catalog in normal deployments.
const MAX_BENCHMARK_GUESSES = 1000;
const MAX_ANALYZED_STEPS = 60;
const BENCHMARK_CHUNK_SIZE = 64;
// Country feedback and role feedback each have three states.
const FEEDBACK_SIGNATURE_COUNT = 560000;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export interface AnalysisRoundInput {
  source: 'single' | 'multi';
  recordId: number;
  mode: string;
  finishedAt: string;
  round: number;
  targetPlayerId: number;
  guessPlayerIds: number[];
}

export interface AnalysisStep {
  guessNumber: number;
  guessPlayerId: number;
  guessNickname: string;
  candidateCountBefore: number;
  candidateCountAfter: number;
  informationGain: number;
  bestInformationGain: number;
  entropyPercentile: number;
  bestGuessPlayerId: number;
  bestGuessNickname: string;
}

export interface AnalysisTrajectory {
  source: 'single' | 'multi';
  recordId: number;
  mode: string;
  finishedAt: string;
  round: number;
  targetPlayerId: number;
  targetNickname: string;
  steps: AnalysisStep[];
}

function numberFeedbackCode(
  guessValue: number | null,
  targetValue: number | null,
  closeRange: number
): number {
  if (guessValue == null || targetValue == null) return 5;
  if (guessValue === targetValue) return 0;
  const isClose = Math.abs(guessValue - targetValue) <= closeRange;
  return targetValue > guessValue ? (isClose ? 1 : 2) : (isClose ? 3 : 4);
}

function roleTokens(player: Player): Set<string> {
  const source = player.roles?.length ? player.roles : [player.role];
  return new Set(source
    .flatMap((role) => String(role).split(/[,/|]/))
    .map((role) => role.trim())
    .filter(Boolean)
    .map((role) => normalizeR6Role(role)?.toLocaleLowerCase('en-US')
      ?? role.toLocaleLowerCase('en-US')));
}

function roleFeedbackCode(guess: Player, target: Player): number {
  const guessRoles = roleTokens(guess);
  const targetRoles = roleTokens(target);
  if (!guessRoles.size || !targetRoles.size) return 0;
  const exact = guessRoles.size === targetRoles.size
    && [...guessRoles].every((role) => targetRoles.has(role));
  if (exact) return 2;
  return [...guessRoles].some((role) => targetRoles.has(role)) ? 1 : 0;
}

function feedbackSignature(guess: Player, target: Player): number {
  const nationality = nationalityFeedbackCode(
    guess.nationality,
    target.nationality,
    guess.region,
    target.region
  );
  let signature = guess.id === target.id ? 1 : 0;
  signature = signature * 3 + nationality;
  signature = signature * 2 + (Boolean(guess.team) && guess.team === target.team ? 1 : 0);
  signature = signature * 6 + numberFeedbackCode(guess.age, target.age, R6_CLOSE_RANGES.age);
  signature = signature * 3 + roleFeedbackCode(guess, target);
  signature = signature * 6 + numberFeedbackCode(
    majorWins(guess),
    majorWins(target),
    R6_CLOSE_RANGES.majorWins
  );
  signature = signature * 6 + numberFeedbackCode(
    majorAppearances(guess),
    majorAppearances(target),
    R6_CLOSE_RANGES.majorAppearances
  );
  signature = signature * 6 + numberFeedbackCode(siWins(guess), siWins(target), R6_CLOSE_RANGES.siWins);
  signature = signature * 6 + numberFeedbackCode(
    siAppearances(guess),
    siAppearances(target),
    R6_CLOSE_RANGES.siAppearances
  );
  return signature * 2 + (playerStatus(guess) === playerStatus(target)
    && playerStatus(guess) !== 'unknown' ? 1 : 0);
}

function informationGain(
  signatureRow: Uint32Array,
  candidateIndexes: number[],
  partitionCounts: Uint16Array,
  touchedSignatures: number[]
): number {
  if (candidateIndexes.length <= 1) return 0;
  touchedSignatures.length = 0;
  for (const candidateIndex of candidateIndexes) {
    const signature = signatureRow[candidateIndex];
    if (partitionCounts[signature] === 0) touchedSignatures.push(signature);
    partitionCounts[signature] += 1;
  }
  let expectedRemainingEntropy = 0;
  for (const signature of touchedSignatures) {
    const count = partitionCounts[signature];
    const probability = count / candidateIndexes.length;
    expectedRemainingEntropy += probability * Math.log2(count);
    partitionCounts[signature] = 0;
  }
  return Math.log2(candidateIndexes.length) - expectedRemainingEntropy;
}

function benchmarkGuesses(allGuesses: Player[], actual: Player): Player[] {
  if (allGuesses.length <= MAX_BENCHMARK_GUESSES) return allGuesses;
  const selected: Player[] = [];
  const used = new Set<number>();
  for (let index = 0; index < MAX_BENCHMARK_GUESSES - 1; index++) {
    const player = allGuesses[Math.floor(index * allGuesses.length / (MAX_BENCHMARK_GUESSES - 1))];
    if (player && !used.has(player.id)) {
      selected.push(player);
      used.add(player.id);
    }
  }
  if (!used.has(actual.id)) selected.push(actual);
  return selected;
}

export async function analyzeGameChoices(
  rounds: AnalysisRoundInput[],
  playersById: ReadonlyMap<number, Player>,
  difficultyPools: ReadonlyMap<string, Player[]>,
  allEnabledPlayers: Player[]
) {
  const trajectories: AnalysisTrajectory[] = [];
  const percentiles: number[] = [];
  const regretRatios: number[] = [];
  let truncated = false;
  // Precompute each guess/target feedback once and reuse complete rankings when
  // multiple rounds reach the same candidate state.
  const universe = new Map<number, Player>();
  for (const pool of difficultyPools.values()) {
    for (const player of pool) universe.set(player.id, player);
  }
  for (const player of allEnabledPlayers) universe.set(player.id, player);
  const universePlayers = [...universe.values()];
  const playerIndexes = new Map(universePlayers.map((player, index) => [player.id, index]));
  const signatureRows = new Map<number, Uint32Array>();
  const benchmarkCache = new Map<number, Player[]>();
  const scoreCache = new Map<string, Array<{ guess: Player; gain: number }>>();
  const partitionCounts = new Uint16Array(FEEDBACK_SIGNATURE_COUNT);
  const touchedSignatures: number[] = [];

  const getSignatureRow = (guess: Player): Uint32Array => {
    const cached = signatureRows.get(guess.id);
    if (cached) return cached;
    const row = new Uint32Array(universePlayers.length);
    for (let index = 0; index < universePlayers.length; index++) {
      row[index] = feedbackSignature(guess, universePlayers[index]);
    }
    signatureRows.set(guess.id, row);
    return row;
  };

  const getBenchmark = (actual: Player): Player[] => {
    const cached = benchmarkCache.get(actual.id);
    if (cached) return cached;
    const benchmark = benchmarkGuesses(allEnabledPlayers, actual);
    benchmarkCache.set(actual.id, benchmark);
    return benchmark;
  };

  const scoreBenchmark = async (
    benchmark: Player[],
    candidates: Player[],
    candidateIndexes: number[]
  ): Promise<Array<{ guess: Player; gain: number }>> => {
    const key = `${benchmark.map((player) => player.id).join(',')}|${candidates.map((player) => player.id).join(',')}`;
    const cached = scoreCache.get(key);
    if (cached) return cached;
    const scored: Array<{ guess: Player; gain: number }> = [];
    for (let benchmarkIndex = 0; benchmarkIndex < benchmark.length; benchmarkIndex++) {
      const guess = benchmark[benchmarkIndex];
      scored.push({
        guess,
        gain: informationGain(getSignatureRow(guess), candidateIndexes, partitionCounts, touchedSignatures),
      });
      if ((benchmarkIndex + 1) % BENCHMARK_CHUNK_SIZE === 0) {
        await yieldToEventLoop();
      }
    }
    scored.sort((a, b) => b.gain - a.gain || a.guess.id - b.guess.id);
    scoreCache.set(key, scored);
    return scored;
  };

  for (const round of rounds) {
    if (percentiles.length >= MAX_ANALYZED_STEPS) {
      truncated = true;
      break;
    }
    const target = playersById.get(round.targetPlayerId);
    const initialPool = difficultyPools.get(round.mode) ?? [];
    if (!target || !initialPool.length) continue;
    let candidates = initialPool.slice();
    let candidateIndexes = candidates.map((player) => playerIndexes.get(player.id) as number);
    const steps: AnalysisStep[] = [];
    for (let index = 0; index < round.guessPlayerIds.length; index++) {
      if (percentiles.length >= MAX_ANALYZED_STEPS) {
        truncated = true;
        break;
      }
      const actual = playersById.get(round.guessPlayerIds[index]);
      if (!actual || candidates.length <= 1 || actual.id === target.id) break;
      const actualRow = getSignatureRow(actual);
      const targetIndex = playerIndexes.get(target.id);
      const actualSignature = targetIndex == null
        ? feedbackSignature(actual, target)
        : actualRow[targetIndex];
      const actualGain = informationGain(actualRow, candidateIndexes, partitionCounts, touchedSignatures);
      const benchmark = getBenchmark(actual);
      const scored = await scoreBenchmark(benchmark, candidates, candidateIndexes);
      const best = scored[0] ?? { guess: actual, gain: actualGain };
      const belowOrEqual = scored.filter((item) => item.gain <= actualGain + 1e-9).length;
      const percentile = scored.length ? belowOrEqual / scored.length : 0;
      const nextCandidates: Player[] = [];
      const nextCandidateIndexes: number[] = [];
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
        if (actualRow[candidateIndexes[candidateIndex]] !== actualSignature) continue;
        nextCandidates.push(candidates[candidateIndex]);
        nextCandidateIndexes.push(candidateIndexes[candidateIndex]);
      }
      steps.push({
        guessNumber: index + 1,
        guessPlayerId: actual.id,
        guessNickname: actual.nickname,
        candidateCountBefore: candidates.length,
        candidateCountAfter: nextCandidates.length,
        informationGain: Number(actualGain.toFixed(4)),
        bestInformationGain: Number(best.gain.toFixed(4)),
        entropyPercentile: Number((percentile * 100).toFixed(1)),
        bestGuessPlayerId: best.guess.id,
        bestGuessNickname: best.guess.nickname,
      });
      percentiles.push(percentile);
      regretRatios.push(best.gain > 0 ? Math.max(0, 1 - actualGain / best.gain) : 0);
      candidates = nextCandidates;
      candidateIndexes = nextCandidateIndexes;
    }
    if (steps.length) {
      trajectories.push({
        source: round.source,
        recordId: round.recordId,
        mode: round.mode,
        finishedAt: round.finishedAt,
        round: round.round,
        targetPlayerId: target.id,
        targetNickname: target.nickname,
        steps,
      });
    }
  }

  const sampleSize = percentiles.length;
  const meanPercentile = sampleSize
    ? percentiles.reduce((sum, value) => sum + value, 0) / sampleSize
    : 0;
  const topDecileRate = sampleSize
    ? percentiles.filter((value) => value >= 0.9).length / sampleSize
    : 0;
  const lowRegretRate = sampleSize
    ? regretRatios.filter((value) => value <= 0.1).length / sampleSize
    : 0;
  const similarityIndex = sampleSize
    ? Math.round(100 * (0.55 * meanPercentile + 0.25 * topDecileRate + 0.2 * lowRegretRate))
    : 0;
  const confidence = Math.min(1, sampleSize / 30);
  const level = sampleSize < 10
    ? 'insufficient'
    : similarityIndex >= 90 && sampleSize >= 20
      ? 'high'
      : similarityIndex >= 78
        ? 'elevated'
        : 'common';

  return {
    summary: {
      similarityIndex,
      level,
      sampleSize,
      confidence: Number((confidence * 100).toFixed(1)),
      averageEntropyPercentile: Number((meanPercentile * 100).toFixed(1)),
      topDecileRate: Number((topDecileRate * 100).toFixed(1)),
      lowRegretRate: Number((lowRegretRate * 100).toFixed(1)),
      analyzedRounds: trajectories.length,
      truncated,
    },
    trajectories,
  };
}
