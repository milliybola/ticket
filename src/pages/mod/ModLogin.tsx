/* Moderator sign-in. Moderator accounts are created by the Sayohat team; there is no self sign-up (US-02). */
import { FlaskConical, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../store/auth';
import { refreshDb, useDb } from '../../store/db';
import { Button, Card, Field, Input } from '../../components/ui';
import { AuthShell } from '../../features/ops/common';

export default function ModLogin() {
  const { t3 } = useI18n();
  const db = useDb();
  const nav = useNavigate();
  const signIn = useAuth((s) => s.signInMod);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    refreshDb();
    const m = db.mods.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!email.trim() || !password) return setErr(t3('Email va parolni kiriting', 'Укажите email и пароль', 'Enter the email and password'));
    if (!m || m.password !== password) return setErr(t3('Login yoki parol notoʻgʻri', 'Неверный логин или пароль', 'Wrong login or password'));
    signIn(m.id);
    nav('/mod');
  };
  return (
    <AuthShell title={t3('Moderator kabineti', 'Кабинет модератора', 'Moderator workspace')} sub={t3('Faqat Sayohat xodimlari uchun.', 'Только для сотрудников Sayohat.', 'For Sayohat staff only.')}>
      <Card>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
          </Field>
          <Field label={t3('Parol', 'Пароль', 'Password')} required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {err && <div className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</div>}
          <Button type="submit" block>
            <ShieldCheck className="size-5" />
            {t3('Kirish', 'Войти', 'Sign in')}
          </Button>
        </form>
      </Card>
      <Card className="mt-6">
        <div className="mb-3 flex items-start gap-2 text-sm text-ink-2">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          {t3('Demo: parol — demo1234. Kirish uchun bosing:', 'Демо: пароль — demo1234. Нажмите, чтобы войти:', 'Demo: the password is demo1234. Click to sign in:')}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {db.mods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                signIn(m.id);
                nav('/mod');
              }}
              className="rounded-xl border border-line px-3 py-2.5 text-left hover:border-ink"
            >
              <b className="block">{m.name}</b>
              <span className="text-sm text-ink-3">{m.email}</span>
            </button>
          ))}
        </div>
      </Card>
    </AuthShell>
  );
}
