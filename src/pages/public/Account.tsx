/*
 * Optional buyer account (US-35, Should): sign in with phone + SMS code (no password), "My tickets" with upcoming
 * and past orders — guest orders with the same phone show up too — and details prefilled at checkout.
 */
import { ChevronRight, FlaskConical, LogOut, Pencil, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { getLang, inLang, nTickets, tl, useI18n } from '../../lib/i18n';
import { fmtPhone, normPhone, sum, validEmail } from '../../lib/format';
import { now } from '../../lib/time';
import { randInt, uid } from '../../lib/util';
import { tx, useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { getEvent, logAct, send, unitInfo, unitWhen } from '../../domain/rules';
import { forgetLastBuyer, myOrderIds } from '../../domain/purchase';
import type { BuyerAccount, Order } from '../../domain/types';
import { Button, Empty, Field, Input, LinkButton, Notice, Tabs } from '../../components/ui';
import { PhoneField } from '../../components/purchase/parts';

export default function Account() {
  useI18n();
  const db = useDb();
  const buyerId = useAuth((s) => s.buyerId);
  const acc = buyerId ? db.buyers.find((b) => b.id === buyerId) : null;
  return acc ? <MyTickets acc={acc} /> : <SignIn />;
}

function SignIn() {
  const { t3 } = useI18n();
  const signIn = useAuth((s) => s.signInBuyer);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [iso, setIso] = useState('UZ');
  const [num, setNum] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [name, setName] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [tries, setTries] = useState(0);
  const [err, setErr] = useState<{ phone?: string; code?: string; name?: string }>({});

  const sendCode = (p: string) => {
    const c = String(randInt(1000, 9999));
    const L = getLang();
    tx((d) => {
      send('sms', p, '', inLang(L, `Sayohat: kirish kodi ${c}`, `Sayohat: код входа ${c}`, `Sayohat: your sign-in code is ${c}`), L, 'code');
      setIsNew(!d.buyers.some((b) => b.phone === p));
    });
    setCode(c);
    setTyped('');
    setTries(0);
  };
  return (
    <div className="mx-auto max-w-md px-4 py-8 md:py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{t3('Xaridorlar uchun kirish', 'Вход для покупателей', 'Sign in')}</h1>
      <p className="mt-2 text-ink-3">{t3('Akkaunt shart emas: usiz ham xarid qilish mumkin. Akkaunt bilan barcha chiptalar bir joyda boʻladi va maʼlumotlaringiz avtomatik toʻldiriladi.', 'Аккаунт не обязателен: покупать можно и без него. С аккаунтом все билеты в одном месте, а данные подставляются сами.', 'An account is optional; you can always buy without one. With an account, all your tickets live in one place and your details are filled in for you.')}</p>
      {step === 'phone' ? (
        <form
          noValidate
          className="mt-6 space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const p = normPhone(iso, num);
            if (!p) return setErr({ phone: t3('Telefon raqamini tekshiring', 'Проверьте номер телефона', 'Check the phone number') });
            setErr({});
            setPhone(p);
            sendCode(p);
            setStep('code');
          }}
        >
          <Field label={t3('Telefon', 'Телефон', 'Phone')} required error={err.phone}>
            <PhoneField iso={iso} num={num} onIso={setIso} onNum={setNum} invalid={!!err.phone} autoFocus />
          </Field>
          <Button type="submit" block size="lg">
            {t3('Kodni olish', 'Получить код', 'Get a code')}
          </Button>
        </form>
      ) : (
        <form
          noValidate
          className="mt-6 space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const er: typeof err = {};
            if (tries >= 5) er.code = t3('Urinishlar tugadi — yangi kod oling', 'Попытки закончились — получите новый код', 'Too many attempts: get a new code');
            else if (typed.trim() !== code) {
              er.code = t3('Kod notoʻgʻri', 'Неверный код', 'Wrong code');
              setTries((n) => n + 1);
            }
            if (isNew && (name.trim().length < 2 || name.trim().length > 60)) er.name = t3('Ismingizni kiriting', 'Укажите имя', 'Enter your name');
            setErr(er);
            if (er.code || er.name) return;
            const acc = tx((d) => {
              let b = d.buyers.find((x) => x.phone === phone);
              if (!b) {
                b = { id: uid('b'), name: name.trim(), phone, email: '', createdAt: now() };
                d.buyers.push(b);
                logAct('buyer-register', fmtPhone(phone), '', { role: 'buyer', id: b.id, name: b.name });
              }
              return b;
            });
            signIn(acc.id);
          }}
        >
          <p>{t3('Kod {p} raqamiga yuborildi', 'Код отправлен на {p}', 'We sent a code to {p}', { p: fmtPhone(phone) })}</p>
          <Field label={t3('SMS-dagi kod', 'Код из SMS', 'Code from the SMS')} required error={err.code}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" maxLength={4} className="font-mono text-lg tracking-[0.4em]" invalid={!!err.code} autoFocus />
          </Field>
          {isNew && (
            <Field label={t3('Ismingiz', 'Ваше имя', 'Your name')} required error={err.name} hint={t3('Bu raqam bilan birinchi marta kiryapsiz — akkaunt yaratamiz.', 'Вы входите с этим номером впервые — создадим аккаунт.', 'First time with this number: we’ll create your account.')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" invalid={!!err.name} />
            </Field>
          )}
          <Button type="submit" block size="lg">
            {t3('Kirish', 'Войти', 'Sign in')}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('phone')}>
              {t3('Boshqa raqam', 'Другой номер', 'Use another number')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => sendCode(phone)}>
              {t3('Kodni qayta yuborish', 'Отправить код ещё раз', 'Send the code again')}
            </Button>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            {t3('Demo: SMS-shlyuz yoʻq, kod — {c}. SMS moderatorning «Yuborilgan xabarlar» boʻlimida ham bor.', 'Демо: SMS-шлюза нет, код — {c}. SMS также есть у модератора в «Отправленных уведомлениях».', 'Demo: there is no SMS gateway; the code is {c}. The SMS is also in the moderator’s Sent notifications.', { c: code })}
          </p>
        </form>
      )}
      <DeviceOrders />
    </div>
  );
}

/** Orders bought as a guest in this browser: reopen them without an account. */
function DeviceOrders() {
  const { t3 } = useI18n();
  const db = useDb();
  const list = myOrderIds()
    .map((id) => db.orders.find((o) => o.id === id))
    .filter((o): o is Order => !!o)
    .slice(0, 10);
  if (!list.length) return null;
  return (
    <section className="mt-8">
      <h2 className="font-bold">{t3('Bu qurilmadagi buyurtmalar', 'Заказы на этом устройстве', 'Orders on this device')}</h2>
      <ul className="mt-3 space-y-2">
        {list.map((o) => {
          const ev = getEvent(o.ev);
          const u = unitInfo(o.sid);
          return (
            <li key={o.id}>
              <Link to={'/order/' + o.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[var(--shadow-card)] hover:shadow-lg">
                <Ticket className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{ev ? tl(ev.card.title) : o.id}</b>
                  <small className="block text-ink-3">
                    {u ? unitWhen(u) : ''} · <span className="font-mono">{o.id}</span>
                  </small>
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink-3" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MyTickets({ acc }: { acc: BuyerAccount }) {
  const { t3 } = useI18n();
  const db = useDb();
  const signOut = useAuth((s) => s.signOutBuyer);
  const [tab, setTab] = useState<'up' | 'past'>('up');
  const [edit, setEdit] = useState(false);
  const orders = db.orders.filter((o) => o.buyer.phone === acc.phone);
  const endOf = (o: Order) => unitInfo(o.sid)?.endsAt ?? 0;
  const up = orders.filter((o) => endOf(o) > now()).sort((a, b) => endOf(a) - endOf(b));
  const past = orders.filter((o) => endOf(o) <= now()).sort((a, b) => endOf(b) - endOf(a));
  const list = tab === 'up' ? up : past;
  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t3('Mening chiptalarim', 'Мои билеты', 'My tickets')}</h1>
          <p className="mt-1 text-ink-3">
            {acc.name} · {fmtPhone(acc.phone)}
            {acc.email ? ` · ${acc.email}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEdit((v) => !v)}>
            <Pencil className="size-4" />
            {t3('Profil', 'Профиль', 'Profile')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              forgetLastBuyer();
              signOut();
            }}
          >
            <LogOut className="size-4" />
            {t3('Chiqish', 'Выйти', 'Sign out')}
          </Button>
        </div>
      </div>
      {edit && <Profile acc={acc} onDone={() => setEdit(false)} />}
      <Tabs
        className="mt-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'up', label: t3('Kelgusi', 'Предстоящие', 'Upcoming'), count: up.length },
          { value: 'past', label: t3('Oʻtgan', 'Прошедшие', 'Past'), count: past.length },
        ]}
      />
      {list.length ? (
        <ul className="mt-4 space-y-3">
          {list.map((o) => {
            const u = unitInfo(o.sid);
            const ev = getEvent(o.ev);
            return (
              <li key={o.id}>
                <Link to={`/order/${o.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-lg">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand">
                    <Ticket className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{ev ? tl(ev.card.title) : o.id}</div>
                    <div className="text-sm text-ink-2">
                      {u ? unitWhen(u) : ''}
                      {u?.venue ? ` · ${u.venue.name}` : ''}
                    </div>
                    <div className="text-sm text-ink-3">
                      <span className="font-mono">{o.id}</span> · {nTickets(o.tickets.length)} · {sum(o.total)}
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-ink-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty
          title={tab === 'up' ? t3('Kelgusi chiptalar yoʻq', 'Предстоящих билетов нет', 'No upcoming tickets') : t3('Oʻtgan chiptalar yoʻq', 'Прошедших билетов нет', 'No past tickets')}
          action={<LinkButton to="/">{t3('Afishaga', 'В афишу', 'Browse events')}</LinkButton>}
        >
          {t3('Ushbu telefon raqamiga kirmasdan rasmiylashtirilgan buyurtmalar ham shu yerda chiqadi.', 'Заказы, оформленные на этот телефон без входа, тоже появятся здесь.', 'Orders placed with this phone number as a guest show up here too.')}
        </Empty>
      )}
    </div>
  );
}

function Profile({ acc, onDone }: { acc: BuyerAccount; onDone: () => void }) {
  const { t3 } = useI18n();
  const [name, setName] = useState(acc.name);
  const [email, setEmail] = useState(acc.email);
  const [err, setErr] = useState<{ name?: string; email?: string }>({});
  return (
    <form
      noValidate
      className="mt-5 space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)]"
      onSubmit={(e) => {
        e.preventDefault();
        const er: typeof err = {};
        if (name.trim().length < 2 || name.trim().length > 60) er.name = t3('Ismingizni kiriting', 'Укажите имя', 'Enter your name');
        if (email.trim() && !validEmail(email)) er.email = t3('Emailni tekshiring', 'Проверьте email', 'Check the email');
        setErr(er);
        if (er.name || er.email) return;
        tx((d) => {
          const b = d.buyers.find((x) => x.id === acc.id);
          if (b) {
            b.name = name.trim();
            b.email = email.trim();
          }
        });
        onDone();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t3('Ism', 'Имя', 'Name')} required error={err.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} invalid={!!err.name} />
        </Field>
        <Field label="Email" error={err.email} hint={t3('Chiptalarni pochtaga yuboramiz', 'Будем присылать билеты на почту', 'We’ll email your tickets')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!err.email} />
        </Field>
      </div>
      <Notice tone="neutral">{t3('Telefon raqami — akkauntingiz kaliti, uni oʻzgartirib boʻlmaydi.', 'Телефон — ключ аккаунта, его нельзя изменить.', 'Your phone number is the key to the account and can’t be changed.')}</Notice>
      <div className="flex gap-2">
        <Button type="submit">{t3('Saqlash', 'Сохранить', 'Save')}</Button>
        <Button variant="ghost" onClick={onDone}>
          {t3('Bekor qilish', 'Отмена', 'Cancel')}
        </Button>
      </div>
    </form>
  );
}
