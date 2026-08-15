import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client';
import i18n from '../../i18n';
import { renderWithProviders } from '../../test/render';
import { toast } from '../Toast';
import AdminPlayers from './AdminPlayers';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  errMsg: vi.fn(() => 'request failed'),
}));

vi.mock('../Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('AdminPlayers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('zh');
  });

  it('downloads the complete import-compatible player JSON', async () => {
    const exportedPlayers = [{
      nickname: 'export-player',
      nationality: 'FR',
      region: 'Europe',
      team: 'Test',
      age: 24,
      role: 'Support',
      roles: ['Support', 'IGL'],
      major_championships: 0,
      major_appearances: 1,
      major_si_championships: 0,
      major_si_appearances: 1,
      birth_date: '2002-02-02',
      source_url: 'https://liquipedia.net/rainbowsix/ExportPlayer',
      source_provider: 'liquipedia',
      source_player_id: 'export-player-id',
      source_updated_at: '2026-08-04T00:00:00.000Z',
      data_version: 'fixture-v1',
      major_si_event_ids: ['major-1'],
      major_si_championship_event_ids: [],
      difficulties: ['easy', 'normal'],
      is_active: true,
      is_enabled: true,
    }];
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/admin/players/export') return { data: exportedPlayers } as never;
      return {
        data: { players: [], total: 0, page: 1, pageSize: 50, totalPages: 1 },
      } as never;
    });
    const createObjectURL = vi.fn(() => 'blob:players');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const user = userEvent.setup();
    renderWithProviders(<AdminPlayers />);
    await screen.findByText('0 条');
    await user.click(screen.getByRole('button', { name: '导出 JSON' }));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/players/export'));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:players');
    expect(toast.success).toHaveBeenCalledWith('已导出 1 名选手');
  });
});
