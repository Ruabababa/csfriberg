import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { SPECIAL_THANKS } from '../config/specialThanks';
import { renderWithProviders } from '../test/render';
import HomeSpecialThanks from './HomeSpecialThanks';

describe('HomeSpecialThanks', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh');
  });

  it('renders the configured Bilibili profile and avatar', async () => {
    const user = userEvent.setup();

    renderWithProviders(<HomeSpecialThanks />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', SPECIAL_THANKS[0].image);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://space.bilibili.com/290893104');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
