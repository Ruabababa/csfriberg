import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnswerOverlay, { PlayerInfoTable } from './AnswerOverlay';
import { renderWithProviders } from '../test/render';

const answer = {
  nickname: 'R6Alpha',
  team: 'Fixture One',
  nationality: 'FR',
  role: 'Entry',
  roles: ['Entry', 'Flex'],
  age: 24,
  majorWins: 1,
  majorAppearances: 4,
  siWins: 0,
  siAppearances: 2,
  status: 'active' as const,
};

describe('AnswerOverlay', () => {
  it('exposes dialog semantics used by keyboard focus guards', () => {
    renderWithProviders(
      <AnswerOverlay title="结算" answer={answer} actions={<button type="button">查看</button>} />
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('R6Alpha')).toBeInTheDocument();
    expect(screen.getByText('突破 / 自由人/补位')).toBeInTheDocument();
  });

  it('supports desktop Escape and mobile backdrop dismiss when onClose is provided', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <AnswerOverlay
        title="结算"
        answer={answer}
        onClose={onClose}
        actions={<button type="button">查看</button>}
      />
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = container.ownerDocument.querySelector('.overlay');
    expect(overlay).toBeTruthy();
    fireEvent.mouseDown(overlay!);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close when onClose is omitted (match-over flow)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AnswerOverlay title="整场结算" answer={answer} actions={<button type="button">再来</button>} />
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows a player\'s difficulty memberships when provided', () => {
    renderWithProviders(
      <PlayerInfoTable answer={{ ...answer, difficulties: ['beginner', 'normal'] }} />
    );

    expect(screen.getByText('所属难度')).toBeInTheDocument();
    expect(screen.getByText('入门版, 完整版')).toBeInTheDocument();
  });

  it('shows unknown instead of blanks for missing player details', () => {
    renderWithProviders(
      <PlayerInfoTable
        answer={{
          nickname: 'MissingData',
          team: '',
          nationality: '',
          age: null,
          status: 'unknown',
        }}
      />
    );

    expect(screen.getAllByText('未知')).toHaveLength(5);
  });

  it('translates Retired when it is stored as the team placeholder', () => {
    renderWithProviders(
      <PlayerInfoTable answer={{ ...answer, team: 'Retired', status: 'retired' }} />
    );

    expect(screen.getAllByText('退役')).toHaveLength(2);
  });
});
