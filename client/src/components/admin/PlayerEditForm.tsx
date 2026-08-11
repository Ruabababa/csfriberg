import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PLAYER_ROLE_OPTIONS } from '../../utils/playerRoles';
import ModalPortal from '../ModalPortal';
import { toast } from '../Toast';
import { useTranslation } from 'react-i18next';
import DifficultyMultiSelect from './DifficultyMultiSelect';
import {
  COUNTRY_OPTIONS,
  REGION_OPTIONS,
  canonicalCountryValue,
  canonicalRegionValue,
  countryLabel,
  isKnownCountry,
  isKnownRegion,
  regionLabel,
} from '../../utils/playerGeography';

export interface PlayerForm {
  id?: number;
  nickname: string;
  nationality: string;
  region: string;
  team: string;
  age: number;
  role: string;
  roles: string[];
  major_si_championships: number;
  major_si_appearances: number;
  birth_date: string | null;
  source_url: string | null;
  source_provider: 'liquipedia' | null;
  source_player_id: string | null;
  source_updated_at: string | null;
  data_version: string | null;
  major_si_event_ids: string[];
  major_si_championship_event_ids: string[];
  difficulties: string[];
  is_active: boolean;
  is_enabled: boolean;
}

export const emptyPlayer: PlayerForm = {
  nickname: '',
  nationality: '',
  region: '',
  team: '',
  age: 25,
  role: 'Entry',
  roles: ['Entry'],
  major_si_championships: 0,
  major_si_appearances: 0,
  birth_date: null,
  source_url: null,
  source_provider: null,
  source_player_id: null,
  source_updated_at: null,
  data_version: null,
  major_si_event_ids: [],
  major_si_championship_event_ids: [],
  difficulties: ['normal'],
  is_active: true,
  is_enabled: true,
};

interface Props {
  initial: PlayerForm;
  difficultyKeys: string[];
  onSubmit: (form: PlayerForm) => Promise<void>;
  onCancel: () => void;
}

export default function PlayerEditForm({ initial, difficultyKeys, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PlayerForm>(() => ({
    ...initial,
    nationality: canonicalCountryValue(initial.nationality),
    region: canonicalRegionValue(initial.region),
    roles: initial.roles?.length ? initial.roles : [initial.role],
  }));
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const firstInputRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<PlayerForm>) => setForm((current) => ({ ...current, ...patch }));

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstInputRef.current?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel, saving]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ ...form, role: form.roles[0] ?? form.role });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('admin.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="admin-player-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) onCancel();
        }}
      >
        <div className="admin-player-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="admin-player-dialog-heading">
            <div>
              <h2 id={titleId}>{form.id ? t('admin.editPlayer', { player: form.nickname }) : t('admin.addPlayer')}</h2>
              <p>{t('admin.formDescription')}</p>
            </div>
            <button className="confirm-close" type="button" aria-label={t('common.close')} onClick={onCancel} disabled={saving}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit}>
          <div className="admin-player-form-grid">
            <label className="admin-player-field">
              <span>{t('admin.playerNickname')}</span>
              <input ref={firstInputRef} className="input" value={form.nickname} onChange={(event) => set({ nickname: event.target.value })} required />
            </label>
            <label className="admin-player-field">
              <span>{t('admin.nationalityRequired')}</span>
              <select className="input" value={form.nationality} onChange={(event) => set({ nationality: event.target.value })} required>
                <option value="" disabled>{t('admin.nationalityRequired')}</option>
                {form.nationality && !isKnownCountry(form.nationality) && (
                  <option value={form.nationality}>{form.nationality}</option>
                )}
                {COUNTRY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{countryLabel(t, option.value)}</option>
                ))}
              </select>
            </label>
            <label className="admin-player-field">
              <span>{t('admin.region')}</span>
              <select className="input" value={form.region} onChange={(event) => set({ region: event.target.value })}>
                <option value="">{t('admin.regionPlaceholder')}</option>
                {form.region && !isKnownRegion(form.region) && (
                  <option value={form.region}>{form.region}</option>
                )}
                {REGION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{regionLabel(t, option.value)}</option>
                ))}
              </select>
            </label>
            <label className="admin-player-field">
              <span>{t('admin.currentTeam')}</span>
              <input className="input" value={form.team} onChange={(event) => set({ team: event.target.value })} />
            </label>
            <label className="admin-player-field">
              <span>{t('admin.ageRequired')}</span>
              <input className="input" type="number" min="10" max="100" value={form.age} onChange={(event) => set({ age: Number(event.target.value) })} required />
            </label>
            <fieldset className="admin-player-field admin-player-role-field">
              <legend>{t('admin.playerRole')}</legend>
              <div className="admin-player-role-options">
                {PLAYER_ROLE_OPTIONS.map(({ value, labelKey }) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={form.roles.includes(value)}
                      onChange={(event) => {
                        const roles = event.target.checked
                          ? [...new Set([...form.roles, value])]
                          : form.roles.filter((role) => role !== value);
                        if (roles.length) set({ roles, role: roles[0] });
                      }}
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="admin-player-field">
              <span>{t('player.majorChampionships')}</span>
              <input className="input" type="number" min="0" value={form.major_si_championships} onChange={(event) => set({ major_si_championships: Number(event.target.value) })} />
            </label>
            <label className="admin-player-field">
              <span>{t('admin.majorAppearances')}</span>
              <input className="input" type="number" min="0" value={form.major_si_appearances} onChange={(event) => set({ major_si_appearances: Number(event.target.value) })} />
            </label>
            <label className="admin-player-field">
              <span>{t('admin.birthDate')}</span>
              <input className="input" type="date" value={form.birth_date ?? ''} onChange={(event) => set({ birth_date: event.target.value || null })} />
            </label>
          </div>

          {form.source_provider && (
            <details className="admin-player-source">
              <summary>{t('admin.sourceMetadata')}</summary>
              <div className="admin-player-form-grid">
                <label className="admin-player-field"><span>{t('admin.sourceProvider')}</span><input className="input" value={form.source_provider} readOnly /></label>
                <label className="admin-player-field"><span>{t('admin.sourcePlayerId')}</span><input className="input" value={form.source_player_id ?? ''} readOnly /></label>
                <label className="admin-player-field"><span>{t('admin.dataVersion')}</span><input className="input" value={form.data_version ?? ''} readOnly /></label>
                <label className="admin-player-field"><span>{t('admin.sourceUpdatedAt')}</span><input className="input" value={form.source_updated_at ?? ''} readOnly /></label>
                <label className="admin-player-field"><span>{t('admin.sourceUrl')}</span><input className="input" value={form.source_url ?? ''} readOnly /></label>
                <label className="admin-player-field"><span>{t('admin.eventIds')}</span><textarea className="input" rows={4} value={form.major_si_event_ids.join('\n')} readOnly /></label>
                <label className="admin-player-field"><span>{t('admin.championshipEventIds')}</span><textarea className="input" rows={4} value={form.major_si_championship_event_ids.join('\n')} readOnly /></label>
              </div>
            </details>
          )}

          <div className="admin-player-flags">
            <div className="admin-player-difficulty-field">
              <span className="admin-player-flag-label">{t('admin.difficulties')}</span>
              <DifficultyMultiSelect
                options={difficultyKeys}
                value={form.difficulties}
                onChange={(difficulties) => set({ difficulties })}
              />
            </div>
            <label><input type="checkbox" checked={form.is_active} onChange={(event) => set({ is_active: event.target.checked })} />{t('admin.activePlayer')}</label>
            <label><input type="checkbox" checked={form.is_enabled} onChange={(event) => set({ is_enabled: event.target.checked })} />{t('admin.enabledPlayer')}</label>
          </div>

          <div className="admin-player-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
            <button className="btn btn-green" disabled={saving || form.difficulties.length === 0}>{saving ? t('admin.saving') : form.id ? t('admin.saveChanges') : t('admin.addPlayer')}</button>
          </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
