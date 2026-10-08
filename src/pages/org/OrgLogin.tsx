/* Organizer sign-in: phone or email + password. The box office and the entry check work under the same login (US-01). */
import { FlaskConical } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { digits } from '../../lib/format';
import { useAuth } from '../../store/auth';
import { refreshDb, useDb } from '../../store/db';
import { Button, Card, Field, Input } from '../../components/ui';
import { AuthShell, kindsText, OrgStatusBadge } from '../../features/ops/common';

export default function OrgLogin() {
  const { t3 } = useI18n();
  const db = useDb();
  const nav = useNavigate();
  const signIn = useAuth((s) => s.signInOrg);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [errs, setErrs] = useState<{ login?: string; password?: string; form?: string }>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const l = login.trim().toLowerCase();
    const er: typeof errs = {};
    if (!l) er.login = t3('Telefon yoki emailni kiriting', 'Укажите телефон или email', 'Enter a phone or email');
    if (!password) er.password = t3('Parolni kiriting', 'Укажите пароль', 'Enter the password');
    if (er.login || er.password) return setErrs(er);
    refreshDb();
    const dg = digits(l);
    const o = db.orgs.find((x) => (l.includes('@') ? x.email.toLowerCase() === l : dg.length >= 9 && digits(x.phone).endsWith(dg)));
    if (!o || o.password !== password) return setErrs({ form: t3('Login yoki parol notoʻgʻri', 'Неверный логин или пароль', 'Wrong login or password') });
    signIn(o.id);
    nav('/org');
  };
  const quick = (id: string) => {
    signIn(id);
    nav('/org');
  };

  return (
    <AuthShell title={t3('Tashkilotchilar uchun kirish', 'Вход для организаторов', 'Organizer sign in')} sub={t3('Shu login bilan kabinet, kassa va kirish nazorati ishlaydi.', 'Под этим логином работают кабинет, касса и проверка на входе.', 'The cabinet, the box office and the entry check all work under this login.')}>
      <Card>
        <form onSubmit={submit} noValidate className="space-y-4">
          <Field label={t3('Telefon yoki email', 'Телефон или email', 'Phone or email')} required error={errs.login}>
            <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" invalid={!!errs.login} autoFocus />
          </Field>
          <Field label={t3('Parol', 'Пароль', 'Password')} required error={errs.password}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" invalid={!!errs.password} />
          </Field>
          {errs.form && <div className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{errs.form}</div>}
          <Button type="submit" block>
            {t3('Kirish', 'Войти', 'Sign in')}
          </Button>
          <p className="text-sm text-ink-3">
            {t3('Akkauntingiz yoʻqmi?', 'Нет аккаунта?', 'No account yet?')}{' '}
            <Link to="/org/register" className="font-semibold text-ink underline">
              {t3('Tashkilotchi boʻlish', 'Стать организатором', 'Become an organizer')}
            </Link>
          </p>
        </form>
      </Card>
      <Card className="mt-6">
        <div className="mb-3 flex items-start gap-2 text-sm text-ink-2">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          {t3('Demo: barcha tashkilotchilar paroli — demo1234. Kirish uchun bosing:', 'Демо: пароль у всех организаторов — demo1234. Нажмите, чтобы войти:', 'Demo: every organizer’s password is demo1234. Click to sign in:')}
        </div>
        <div className="grid gap-2">
          {db.orgs.slice(0, 12).map((o) => (
            <button key={o.id} type="button" onClick={() => quick(o.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-ink">
              <span className="min-w-0 flex-1">
                <b className="block truncate">{o.name}</b>
                <span className="block truncate text-sm text-ink-3">
                  {kindsText(o.kinds)} · {o.email}
                </span>
              </span>
              <OrgStatusBadge status={o.status} />
            </button>
          ))}
        </div>
      </Card>
    </AuthShell>
  );
}
