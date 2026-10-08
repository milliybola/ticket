/* Organizer sign-up (US-01): application form with an SMS-confirmed phone; the account starts "under review". */
import { Check, CheckCircle2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { LANG_LABEL, LANGS, useI18n, type Lang } from '../../lib/i18n';
import { normPhone, validEmail } from '../../lib/format';
import { registerOrg } from '../../domain/rules';
import type { EventKind } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { useDb } from '../../store/db';
import { byId } from '../../lib/util';
import { Button, Card, Checkbox, Field, Input, LinkButton, Select, cn } from '../../components/ui';
import { AuthShell } from '../../features/ops/common';
import { KindPicker } from '../../features/ops/KindPicker';
import { PhoneConfirm } from '../../features/ops/phone';

type Vals = { name: string; kinds: EventKind[]; contact: string; iso: string; num: string; email: string; password: string; lang: Lang; consent: boolean };

export default function OrgRegister() {
  const { t3, lang } = useI18n();
  const db = useDb();
  const nav = useNavigate();
  const orgId = useAuth((s) => s.orgId);
  const signIn = useAuth((s) => s.signInOrg);
  const [v, setV] = useState<Vals>({ name: '', kinds: [], contact: '', iso: 'UZ', num: '', email: '', password: '', lang, consent: false });
  const [verified, setVerified] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [dup, setDup] = useState<'phone' | 'email' | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const set = <K extends keyof Vals>(k: K, val: Vals[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    setDup(null);
  };

  const phone = normPhone(v.iso, v.num);
  const errs: Partial<Record<keyof Vals | 'phone', string>> = {};
  const name = v.name.trim();
  const contact = v.contact.trim();
  if (name.length < 2 || name.length > 100) errs.name = t3('Tashkilot nomini kiriting (2–100 belgi)', 'Укажите название организации (2–100 символов)', 'Enter the organization name (2–100 characters)');
  if (!v.kinds.length) errs.kinds = t3('Kamida bitta turni tanlang', 'Выберите хотя бы один вид', 'Pick at least one kind');
  if (contact.length < 2 || contact.length > 60) errs.contact = t3('Masʼul shaxs ismini kiriting', 'Укажите имя контактного лица', 'Enter the contact person’s name');
  if (!phone) errs.phone = t3('Telefon raqamini tekshiring', 'Проверьте номер телефона', 'Check the phone number');
  else if (phone !== verified) errs.phone = t3('Telefonni SMS-kod bilan tasdiqlang', 'Подтвердите телефон кодом из SMS', 'Confirm the phone with the SMS code');
  if (!validEmail(v.email)) errs.email = t3('Emailni tekshiring', 'Проверьте email', 'Check the email');
  if (v.password.length < 8) errs.password = t3('Parol juda qisqa (kamida 8 belgi)', 'Пароль слишком короткий (минимум 8 символов)', 'The password is too short (at least 8 characters)');
  if (!v.consent) errs.consent = t3('Davom etish uchun rozilik kerak', 'Нужно согласие, чтобы продолжить', 'Please agree to continue');
  const valid = Object.keys(errs).length === 0;
  const show = (k: keyof typeof errs) => (tried ? errs[k] : undefined);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!valid || !phone) return;
    const r = registerOrg({ name, kinds: v.kinds, contact, phone, email: v.email.trim().toLowerCase(), password: v.password, lang: v.lang });
    if (!r.ok) {
      setDup(r.field);
      return;
    }
    signIn(r.org.id);
    setDoneId(r.org.id);
  };

  const done = byId(db.orgs, doneId);
  if (done)
    return (
      <AuthShell title={t3('Anketa yuborildi', 'Анкета отправлена', 'Application sent')}>
        <Card className="text-center">
          <CheckCircle2 className="mx-auto size-14 text-ok" />
          <div className="mt-3 text-lg font-semibold">{t3('Anketani moderator tekshirmoqda', 'Анкету проверяет модератор', 'A moderator is checking your application')}</div>
          <p className="mt-2 text-ink-3">{t3('Qaror {e} manziliga keladi. Hozircha maydonlar, zallar va tadbir qoralamalarini tayyorlashingiz mumkin.', 'Решение придёт на {e}. Пока можно готовить площадки, залы и черновики мероприятий.', 'The decision will come to {e}. Meanwhile you can prepare venues, halls and event drafts.', { e: done.email })}</p>
          <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left text-[15px]">
            <li className="flex gap-2">
              <Check className="size-5 shrink-0 text-ok" />
              {t3('Maydonlar, zallar va sxemalar yaratish', 'Создавать площадки, залы и схемы', 'Create venues, halls and seating plans')}
            </li>
            <li className="flex gap-2">
              <Check className="size-5 shrink-0 text-ok" />
              {t3('Tadbir qoralamalarini tayyorlash', 'Готовить черновики мероприятий', 'Prepare event drafts')}
            </li>
            <li className="flex gap-2 text-ink-3">
              <X className="size-5 shrink-0 text-bad" />
              {t3('Tadbirni moderatsiyaga yuborish — anketa tasdiqlangandan keyin', 'Отправлять мероприятия на модерацию — после одобрения анкеты', 'Send events for moderation: after the approval')}
            </li>
          </ul>
          <Button className="mt-6" onClick={() => nav('/org')}>
            {t3('Kabinetga oʻtish', 'Перейти в кабинет', 'Go to the cabinet')}
          </Button>
        </Card>
      </AuthShell>
    );

  if (orgId && byId(db.orgs, orgId))
    return (
      <AuthShell title={t3('Siz tashkilotchi sifatida kirgansiz', 'Вы уже вошли как организатор', 'You’re signed in as an organizer')}>
        <LinkButton to="/org">{t3('Kabinetga oʻtish', 'Перейти в кабинет', 'Go to the cabinet')}</LinkButton>
      </AuthShell>
    );

  return (
    <AuthShell
      wide
      title={t3('Tashkilotchi boʻlish', 'Стать организатором', 'Become an organizer')}
      sub={t3('Anketani toʻldiring — Sayohat moderatori uni tekshiradi. Tekshiruv paytida maydon va tadbir qoralamalarini tayyorlash mumkin.', 'Заполните анкету — модератор Sayohat проверит её. Пока идёт проверка, можно готовить площадки и черновики мероприятий.', 'Fill in the application and a Sayohat moderator will check it. Meanwhile you can prepare venues and event drafts.')}
    >
      <Card>
        <form onSubmit={submit} noValidate autoComplete="off" className="space-y-5">
          <Field label={t3('Tashkilot nomi', 'Название организации', 'Organization name')} required error={show('name')}>
            <Input value={v.name} maxLength={100} onChange={(e) => set('name', e.target.value)} invalid={!!show('name')} />
          </Field>
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink-2">
              {t3('Faoliyat turi', 'Вид деятельности', 'What you run')}
              <span className="text-bad"> *</span> <span className="font-normal text-ink-3">{t3('bir nechtasini tanlash mumkin', 'можно несколько', 'pick one or more')}</span>
            </div>
            <KindPicker value={v.kinds} onChange={(k) => set('kinds', k)} invalid={!!show('kinds')} />
            {show('kinds') && <div className="mt-1 text-sm text-bad">{show('kinds')}</div>}
          </div>
          <Field label={t3('Masʼul shaxs ismi', 'Имя контактного лица', 'Contact person')} required error={show('contact')}>
            <Input value={v.contact} maxLength={60} onChange={(e) => set('contact', e.target.value)} invalid={!!show('contact')} />
          </Field>
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink-2">
              {t3('Telefon', 'Телефон', 'Phone')}
              <span className="text-bad"> *</span>
            </div>
            <PhoneConfirm
              iso={v.iso}
              num={v.num}
              onChange={(iso, num) => {
                setV((s) => ({ ...s, iso, num }));
                setDup(null);
              }}
              verified={verified}
              onVerified={setVerified}
              lang={v.lang}
              invalid={!!show('phone')}
            />
            {show('phone') && <div className="mt-1 text-sm text-bad">{show('phone')}</div>}
          </div>
          <Field label="Email" required error={show('email')}>
            <Input type="email" value={v.email} onChange={(e) => set('email', e.target.value)} invalid={!!show('email')} />
          </Field>
          <Field label={t3('Parol', 'Пароль', 'Password')} required error={show('password')} hint={t3('Kamida 8 belgi. Shu parol bilan kassa va kirish nazorati ham ishlaydi.', 'Минимум 8 символов. Под этим паролем работают касса и вход.', 'At least 8 characters. The box office and the entry check use it too.')}>
            <Input type="password" value={v.password} autoComplete="new-password" onChange={(e) => set('password', e.target.value)} invalid={!!show('password')} />
          </Field>
          <Field label={t3('Interfeys va xatlar tili', 'Язык интерфейса и писем', 'Interface and email language')}>
            <Select value={v.lang} onChange={(e) => set('lang', e.target.value as Lang)}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <div>
            <Checkbox
              checked={v.consent}
              onChange={(c) => set('consent', c)}
              invalid={!!show('consent')}
              label={
                <>
                  {t3('Men ', 'Согласен с ', 'I accept the ')}
                  <a href="/page/rules" target="_blank" rel="noreferrer" className="underline">
                    {t3('oferta', 'офертой', 'offer')}
                  </a>
                  {t3(' va ', ' и ', ' and the ')}
                  <a href="/page/privacy" target="_blank" rel="noreferrer" className="underline">
                    {t3('shaxsiy maʼlumotlarni qayta ishlash siyosatiga', 'политикой обработки персональных данных', 'personal data policy')}
                  </a>
                  {t3(' roziman', '', '')}
                </>
              }
            />
            {show('consent') && <div className="mt-1 text-sm text-bad">{show('consent')}</div>}
          </div>
          {dup && (
            <div className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
              {dup === 'phone'
                ? t3('Bunday telefon bilan tashkilotchi roʻyxatdan oʻtgan. Kabinetga kiring.', 'Организатор с таким телефоном уже зарегистрирован. Войдите в кабинет.', 'An organizer with this phone is already registered. Sign in instead.')
                : t3('Bunday email bilan tashkilotchi roʻyxatdan oʻtgan. Kabinetga kiring.', 'Организатор с таким email уже зарегистрирован. Войдите в кабинет.', 'An organizer with this email is already registered. Sign in instead.')}{' '}
              <Link to="/org/login" className="font-semibold underline">
                {t3('Kirish', 'Войти', 'Sign in')}
              </Link>
            </div>
          )}
          <Button type="submit" block size="lg" aria-disabled={!valid} className={cn(!valid && 'bg-line text-ink-3 hover:bg-line')}>
            {t3('Anketani yuborish', 'Отправить анкету', 'Submit the application')}
          </Button>
          <p className="text-sm text-ink-3">
            {t3('Yuborishdan oldin sahifadan chiqsangiz, kiritilgan maʼlumotlar saqlanmaydi.', 'Если уйти со страницы до отправки, введённые данные не сохранятся.', 'If you leave this page before submitting, what you typed is not kept.')}{' '}
            {t3('Akkauntingiz bormi?', 'Уже есть аккаунт?', 'Have an account?')}{' '}
            <Link to="/org/login" className="font-semibold text-ink underline">
              {t3('Kirish', 'Войти', 'Sign in')}
            </Link>
          </p>
        </form>
      </Card>
    </AuthShell>
  );
}
