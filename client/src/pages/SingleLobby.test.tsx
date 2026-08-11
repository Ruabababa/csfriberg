import { describe, expect, it, beforeEach } from 'vitest';
import { Route } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SingleLobby from './SingleLobby';
import { renderAtRoute } from '../test/render';

describe('SingleLobby', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('only exposes the beginner difficulty', () => {
    renderAtRoute(<SingleLobby />, { route: '/single', path: '/single' });

    const options = document.querySelectorAll('.single-difficulty-option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveClass('active');
    expect(options[0]).toHaveTextContent('入门版');
    expect(options[0].querySelector('.single-difficulty-badge')).toHaveTextContent('推荐');
    expect(screen.queryByText('简单版')).not.toBeInTheDocument();
    expect(screen.queryByText('完整版')).not.toBeInTheDocument();
  });

  it('starts beginner and remembers the choice', async () => {
    const user = userEvent.setup();
    renderAtRoute(
      <SingleLobby />,
      {
        route: '/single',
        path: '/single',
        extraRoutes: <Route path="/single/:mode" element={<div data-testid="game-route" />} />,
      }
    );

    await user.click(document.querySelector('.single-lobby-action button') as HTMLButtonElement);

    expect(await screen.findByTestId('game-route')).toBeInTheDocument();
    expect(localStorage.getItem('csgofriberg.single-difficulty')).toBe('beginner');
  });

  it('keeps the mobile start button as a full-width primary action', () => {
    renderAtRoute(<SingleLobby />, { route: '/single', path: '/single' });
    const start = document.querySelector('.single-lobby-action button');
    expect(start).toHaveClass('btn', 'btn-lg', 'btn-green');
  });
});
