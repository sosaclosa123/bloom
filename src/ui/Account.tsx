// Settings → Account: sign in, then connect with your partner by code.
import { useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { formatCode } from '../sync/engine';
import { Button, Field, Icon, Segmented } from './common';
import { useBloom } from './store';
import { useSync } from './sync';

function errorKey(e: unknown): StringKey {
  const m = e instanceof Error ? e.message : String(e);
  if (/invalid-credential|wrong-password|user-not-found/.test(m)) return 'errWrongLogin';
  if (/email-already-in-use/.test(m)) return 'errEmailUsed';
  if (/weak-password/.test(m)) return 'errWeakPassword';
  if (/invalid-email/.test(m)) return 'errBadEmail';
  if (/network|offline|unavailable/i.test(m)) return 'errOffline';
  if (/not-found/.test(m)) return 'errNoCode';
  if (/full/.test(m)) return 'errFull';
  return 'errGeneric';
}

export function AccountSettings() {
  const { t } = useBloom();
  const { state, engine, available } = useSync();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<StringKey | null>(null);
  const [copied, setCopied] = useState(false);

  if (!available) return <p className="muted">{t('syncNotReady')}</p>;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorKey(e));
    } finally {
      setBusy(false);
    }
  };

  // ---------------- signed out
  if (!state.user) {
    return (
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => (mode === 'signup' ? engine!.signUp(name, email, password) : engine!.signIn(email, password)));
        }}
      >
        <p className="muted">{t('syncIntro')}</p>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'signup', label: t('createAccount') },
            { value: 'signin', label: t('signIn') },
          ]}
        />
        {mode === 'signup' && (
          <Field label={t('yourName')}>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </Field>
        )}
        <Field label={t('email')}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" dir="ltr" />
        </Field>
        <Field label={t('password')}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} dir="ltr" />
        </Field>
        {err && <p className="form-error">{t(err)}</p>}
        <div>
          <Button type="submit" variant="primary" disabled={busy || !engine}>
            {mode === 'signup' ? t('createAccount') : t('signIn')}
          </Button>
        </div>
      </form>
    );
  }

  // ---------------- signed in
  const space = state.space;
  const partnerId = space?.members.find((m) => m !== state.user!.uid);
  const partner = partnerId ? space?.names[partnerId] || t('partner') : null;
  const statusText =
    state.status === 'synced' ? t('syncSynced') : state.status === 'syncing' || state.status === 'connecting' ? t('syncSyncing') : state.status === 'offline' ? t('syncOffline') : state.status === 'error' ? t('syncError') : '';

  return (
    <div className="account">
      <div className="account-row">
        <div className="account-avatar" aria-hidden="true">
          {(state.profile?.name || state.user.email).slice(0, 1).toUpperCase()}
        </div>
        <div className="account-who">
          <strong>{state.profile?.name || state.user.email}</strong>
          <span className="muted small" dir="ltr">
            {state.user.email}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => run(() => engine!.signOut())}>
          {t('signOut')}
        </Button>
      </div>
      <p className={`sync-status ${state.status}`}>
        <span className="sync-dot" /> {statusText}
      </p>

      {!state.profile?.spaceId && (
        <div className="partner-card">
          <h4>💞 {t('shareWithPartner')}</h4>
          <p className="muted small">{t('shareIntro')}</p>
          <Button variant="primary" disabled={busy} onClick={() => run(() => engine!.createSpace())}>
            {t('createShared')}
          </Button>
          <div className="join-row">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" aria-label={t('inviteCode')} dir="ltr" />
            <Button disabled={busy || code.replace(/[^a-z0-9]/gi, '').length !== 8} onClick={() => run(() => engine!.joinSpace(code))}>
              {t('join')}
            </Button>
          </div>
        </div>
      )}

      {state.profile?.spaceId && (
        <div className="partner-card">
          {partner ? (
            <h4>
              💞 {t('connectedWith', { n: partner })}
            </h4>
          ) : (
            <>
              <h4>⏳ {t('waitingPartner')}</h4>
              <p className="muted small">{t('sendCode')}</p>
            </>
          )}
          <div className="code-row">
            <span className="invite-code" dir="ltr">
              {formatCode(state.profile.spaceId)}
            </span>
            {!partner && (
              <Button
                size="sm"
                icon={copied ? 'check' : undefined}
                onClick={() => {
                  navigator.clipboard?.writeText(formatCode(state.profile!.spaceId!));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? t('copied') : t('copy')}
              </Button>
            )}
          </div>
          <p className="muted small">
            <Icon name="lock" size={12} /> {t('privacyNote')}
          </p>
        </div>
      )}
      {err && <p className="form-error">{t(err)}</p>}
    </div>
  );
}
