import { ReactNode, useEffect } from 'react';
import { Globe, Crosshair, Calendar, Shield, Trophy, Layers3, Activity } from 'lucide-react';
import { playerRoleLabel } from '../utils/playerRoles';
import { countryLabel, regionLabel } from '../utils/playerGeography';
import ModalPortal from './ModalPortal';
import { useTranslation } from 'react-i18next';
import { difficultyLabel } from '../utils/difficulty';
import { playerTeamLabel } from '../utils/playerTeam';

export interface AnswerInfo {
  nickname: string;
  team: string;
  nationality: string;
  region?: string;
  role?: string;
  roles?: string[];
  age?: number | null;
  majorWins?: number;
  majorAppearances?: number;
  siWins?: number;
  siAppearances?: number;
  status?: 'active' | 'retired' | 'unknown';
  difficulties?: string[];
}

/** 选手信息表(答案卡片/查询结果共用) */
export function PlayerInfoTable({ answer }: { answer: AnswerInfo }) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const nationality = answer.nationality ? countryLabel(t, answer.nationality) : unknown;
  const geography = answer.region
    ? `${nationality} (${regionLabel(t, answer.region)})`
    : nationality;
  const rows: [ReactNode, string, ReactNode][] = [
    [<Shield size={14} key="i" />, t('player.team'), answer.team ? playerTeamLabel(t, answer.team) : unknown],
    [<Globe size={14} key="i" />, t('player.nationality'), geography],
    [<Calendar size={14} key="i" />, t('player.age'), answer.age ?? unknown],
    [
      <Crosshair size={14} key="i" />,
      t('player.role'),
      answer.roles?.length
        ? answer.roles.map(playerRoleLabel).join(' / ')
        : answer.role ? playerRoleLabel(answer.role) : unknown,
    ],
    [<Calendar size={14} key="i" />, t('player.majorAppearances'), answer.majorAppearances ?? 0],
    [<Trophy size={14} key="i" />, t('player.majorWins'), answer.majorWins ?? 0],
    [<Calendar size={14} key="i" />, t('player.siAppearances'), answer.siAppearances ?? 0],
    [<Trophy size={14} key="i" />, t('player.siWins'), answer.siWins ?? 0],
    [
      <Activity size={14} key="i" />,
      t('player.status'),
      answer.status === 'active'
        ? t('common.active')
        : answer.status === 'retired' ? t('common.retired') : t('common.unknown'),
    ],
  ];
  if (answer.difficulties) {
    rows.push([
      <Layers3 size={14} key="i" />,
      t('player.difficulties'),
      answer.difficulties.length
        ? answer.difficulties.map((key) => difficultyLabel(t, key)).join(', ')
        : '-',
    ]);
  }
  return (
    <table className="player-info-table">
      <tbody>
        {rows.map(([icon, label, value]) => (
          <tr key={label}>
            <td className="label">
              {icon}
              {label}
            </td>
            <td className="value">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Props {
  title: string;
  answer: AnswerInfo | null;
  extra?: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
  /** 胜负配色:win 绿色调头部,lose 中性 */
  tone?: 'win' | 'lose';
}

/** 结算/答案遮罩卡片 */
export default function AnswerOverlay({ title, answer, extra, actions, onClose, tone }: Props) {
  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <ModalPortal>
      <div
        className="overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose?.();
        }}
      >
        <div
          className={`overlay-card${tone ? ` overlay-card-${tone}` : ''}`}
          role="dialog"
          aria-modal="true"
        >
          <h2>{title}</h2>
          {extra}
          {answer && (
            <>
              <p className="answer-name">{answer.nickname}</p>
              <PlayerInfoTable answer={answer} />
            </>
          )}
          <div className="btns">{actions}</div>
        </div>
      </div>
    </ModalPortal>
  );
}
