import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAtRoute } from '../test/render';
import MultiLobby from './MultiLobby';

const socket = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => void>(),
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../api/socket', () => ({ getSocket: () => socket }));

describe('MultiLobby matchmaking', () => {
  beforeEach(() => {
    socket.handlers.clear();
    socket.on.mockReset();
    socket.off.mockReset();
    socket.emit.mockReset();
    socket.on.mockImplementation((event: string, handler: (...args: any[]) => void) => {
      socket.handlers.set(event, handler);
    });
    socket.emit.mockImplementation((event: string, ...args: any[]) => {
      const ack = args.at(-1);
      if (event === 'room:sync' && typeof ack === 'function') ack({ code: 'NOT_IN_ROOM' });
      if (event === 'match:start' && typeof ack === 'function') ack({ queued: true });
    });
  });

  it('navigates to the ready room immediately when a match is found', async () => {
    const user = userEvent.setup();
    renderAtRoute(<MultiLobby />, {
      route: '/multi',
      path: '/multi',
      extraRoutes: <Route path="/multi/room" element={<div>ready room</div>} />,
    });

    await user.click(await screen.findByRole('button', { name: '开始匹配' }));
    await waitFor(() => expect(socket.handlers.get('match:found')).toBeTypeOf('function'));
    act(() => socket.handlers.get('match:found')?.({}));

    expect(await screen.findByText('ready room')).toBeInTheDocument();
  });

  it('only exposes beginner and normalizes stored hidden difficulties', async () => {
    localStorage.setItem('csgofriberg.multi-lobby-preferences', JSON.stringify({
      createDifficulty: 'easy',
      boType: 5,
      allowSpectators: true,
      matchmakingDifficulty: 'normal',
    }));

    renderAtRoute(<MultiLobby />, { route: '/multi', path: '/multi' });

    const beginnerButtons = await screen.findAllByRole('button', { name: '入门版' });
    expect(beginnerButtons).toHaveLength(2);
    expect(beginnerButtons[0]).toHaveClass('active');
    expect(beginnerButtons[1]).toHaveClass('active');
    expect(screen.queryByRole('button', { name: '简单版' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '完整版' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'BO5' })).toHaveClass('active');
    expect(screen.getByRole('checkbox', { name: '允许观战' })).toBeChecked();
    await waitFor(() => expect(
      JSON.parse(localStorage.getItem('csgofriberg.multi-lobby-preferences') ?? '{}')
    ).toEqual({
      createDifficulty: 'beginner',
      boType: 5,
      allowSpectators: true,
      matchmakingDifficulty: 'beginner',
    }));
  });
});
