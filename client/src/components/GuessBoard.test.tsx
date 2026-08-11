import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import GuessBoard from './GuessBoard';
import { renderWithProviders } from '../test/render';
import type { MultiplayerGuessFeedback } from '../types';

const guess: MultiplayerGuessFeedback = {
  playerId: 1,
  nickname: 'Renshiro',
  correct: false,
  attributes: {
    nationality: { value: 'France', level: 'wrong' },
    team: { value: 'Retired', level: 'wrong' },
    age: { value: 32, level: 'wrong', hint: 'lower' },
    role: { value: 'Entry / Flex', level: 'close' },
    majorAppearances: { value: 7, level: 'wrong', hint: 'higher' },
    majorWins: { value: 1, level: 'wrong', hint: 'higher' },
    siAppearances: { value: 4, level: 'wrong', hint: 'higher' },
    siWins: { value: 0, level: 'correct' },
    status: { value: 'retired', level: 'wrong' },
  },
};

describe('GuessBoard', () => {
  it('translates Retired in both the team and status cells', () => {
    renderWithProviders(<GuessBoard guesses={[guess]} />);

    expect(screen.getByText('Renshiro')).toBeInTheDocument();
    expect(screen.getAllByText('退役')).toHaveLength(2);
  });
});
