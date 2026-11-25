// The reminder card list — used by the desktop popup window and, in the
// browser build, as an in-page overlay.
import { formatDuration, translate } from '../i18n/strings';
import { dateOf, parseLocal } from '../shared/dates';
import type { FiredAlert, Language } from '../shared/types';
import type { DeliveryReason } from '../platform/bridge';

interface Props {
  alerts: FiredAlert[];
  reason: DeliveryReason;
  lang: Language;
  snoozeOptions: number[];
  onSnooze: (key: string, minutes: number) => void;
  onDismiss: (key: string) => void;
  onDismissAll: () => void;
  onOpen: (date: string) => void;
  /** Medication reminders: mark the dose as taken. */
  onTaken?: (key: string) => void;
}

export function AlertCards({ alerts, reason, lang, snoozeOptions, onSnooze, onDismiss, onDismissAll, onOpen, onTaken }: Props) {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v);
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  return (
    <div className="alert-stack" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {(reason !== 'now' || alerts.length > 1) && (
        <div className="alert-stack-head">
          <span>{reason === 'afterGame' ? `🎮 ${t('whilePlaying')}` : reason === 'whileClosed' ? t('whileClosed') : t('reminders')}</span>
          <button type="button" onClick={onDismissAll}>
            {t('dismissAll')}
          </button>
        </div>
      )}
      {alerts.map((a) => {
        const when = parseLocal(a.when);
        const time = when.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
        const sameDay = new Date().toDateString() === when.toDateString();
        const whenLabel = sameDay ? time : `${when.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
        const lead = a.minutesBefore > 0 && reason === 'now' ? t('startsIn', { t: formatDuration(lang, a.minutesBefore) }) : null;
        return (
          <div className="alert-card" key={a.key}>
            <div className="alert-icon" aria-hidden="true">
              {a.kind === 'event' ? '📅' : a.kind === 'med' ? '💊' : a.kind === 'water' ? '💧' : a.kind === 'weigh' ? '⚖️' : '🔔'}
            </div>
            <div className="alert-main">
              <div className="alert-meta">
                <span>{whenLabel}</span>
                {lead && <span className="alert-lead">{lead}</span>}
                {!!a.missed && <span className="alert-missed">{t('alertMissed', { n: a.missed })}</span>}
              </div>
              <div className="alert-title">
                {a.title || (a.kind === 'med' ? t('hlMedication') : a.kind === 'water' ? t('hlNudgeWater') : a.kind === 'weigh' ? t('hlNudgeWeigh') : t('reminder'))}
              </div>
              <div className="alert-actions">
                {snoozeOptions.map((m) => (
                  <button type="button" key={m} onClick={() => onSnooze(a.key, m)}>
                    {t('snooze', { t: formatDuration(lang, m) })}
                  </button>
                ))}
                {a.kind === 'water' ? (
                  <>
                    <button type="button" onClick={() => onDismiss(a.key)}>
                      {t('dismiss')}
                    </button>
                    {onTaken && (
                      <button type="button" className="primary" onClick={() => onTaken(a.key)}>
                        + {t('hlAddGlass')}
                      </button>
                    )}
                  </>
                ) : a.kind === 'med' ? (
                  <>
                    <button type="button" onClick={() => onDismiss(a.key)}>
                      {t('dismiss')}
                    </button>
                    {onTaken && (
                      <button type="button" className="primary" onClick={() => onTaken(a.key)}>
                        ✓ {t('hlTaken')}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onOpen(dateOf(a.when))}>
                      {t('open')}
                    </button>
                    <button type="button" className="primary" onClick={() => onDismiss(a.key)}>
                      {t('dismiss')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
