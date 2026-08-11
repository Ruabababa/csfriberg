import { describe, expect, it, vi } from 'vitest';

vi.mock('../redis', () => ({
  redis: () => null,
  redisKey: (key: string) => key,
}));

import {
  consumeAndVerifyChallenge,
  createChallenge,
  hasLeadingZeroBits,
  modifiedSha256,
} from './pow';

function solve(challenge: string, difficulty: number): string {
  const bytes = Buffer.from(challenge, 'base64url');
  for (let nonce = 0n; nonce <= 0xffffffffffffffffn; nonce++) {
    if (hasLeadingZeroBits(modifiedSha256(bytes, nonce), difficulty)) return nonce.toString();
  }
  throw new Error('POW_NOT_FOUND');
}

describe('PoW in-memory fallback', () => {
  it('verifies and consumes a challenge without Redis', async () => {
    const challenge = await createChallenge('pow-test-browser');
    const nonce = solve(challenge.challenge, challenge.difficulty);

    await expect(
      consumeAndVerifyChallenge(challenge.id, nonce, 'pow-test-browser')
    ).resolves.toBe(challenge.difficulty);
    await expect(
      consumeAndVerifyChallenge(challenge.id, nonce, 'pow-test-browser')
    ).rejects.toMatchObject({ code: 'POW_CHALLENGE_EXPIRED' });
  });

  it('binds the challenge to the browser and still consumes it on failure', async () => {
    const challenge = await createChallenge('pow-test-browser');

    await expect(
      consumeAndVerifyChallenge(challenge.id, '0', 'different-browser')
    ).rejects.toMatchObject({ code: 'POW_FINGERPRINT_MISMATCH' });
    await expect(
      consumeAndVerifyChallenge(challenge.id, '0', 'pow-test-browser')
    ).rejects.toMatchObject({ code: 'POW_CHALLENGE_EXPIRED' });
  });
});
