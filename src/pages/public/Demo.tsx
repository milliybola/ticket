/* Demo tools (/demo): reset the data, time travel, switch outside services off, demo accounts with quick sign-in, and
   the eight pilot acceptance scenarios from the PRD with deep links to the right screens. */
import { Clock, ExternalLink, FlaskConical, RotateCcw, Trash2, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { DAY, fmtStamp, getClockOffset, HOUR, setClockOffset } from '../../lib/time';
import { cleanupHolds, logAct } from '../../domain/rules';
import { useAuth } from '../../store/auth';
import { initDb, tx, useDb } from '../../store/db';
import { Badge, Button, Card, Checkbox, PageHeader, toast } from '../../components/ui';
import { ConfirmDialog, kindsText, OrgStatusBadge, useTicker } from '../../features/ops/common';

type Go = { label: string; to: string; org?: string; mod?: string; guest?: boolean; tab?: boolean };
type Scenario = { n: number; title: string; steps: string; go: Go[] };

const shift = (ms: number, t3: (uz: string, ru: string, en: string, v?: Record<string, string | number>) => string) => {
  const m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mi = m % 60;
  const parts = [d ? t3('{n} kun', '{n} д', '{n}d', { n: d }) : '', h ? t3('{n} soat', '{n} ч', '{n}h', { n: h }) : '', mi ? t3('{n} daq', '{n} мин', '{n}m', { n: mi }) : ''].filter(Boolean);
  return (ms < 0 ? '−' : '+') + (parts.join(' ') || '0');
};

export default function Demo() {
  const { t3 } = useI18n();
  const db = useDb();
  const nav = useNavigate();
  const auth = useAuth();
  const [reset, setReset] = useState(false);
  const [done, setDone] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('sayohat-demo-done') || '{}');
    } catch {
      return {};
    }
  });
  useTicker(1000);

  const go = (g: Go) => {
    if (g.org) auth.signInOrg(g.org);
    if (g.mod) auth.signInMod(g.mod);
    if (g.guest) auth.signOutOrg();
    if (g.tab) window.open(g.to, '_blank', 'noopener');
    else nav(g.to);
  };
  const clock = (ms: number | null) => {
    tx((d) => {
      d.demo.clock = ms === null ? 0 : (d.demo.clock || 0) + ms;
      setClockOffset(d.demo.clock);
      logAct('demo-clock', '', fmtStamp(Date.now() + d.demo.clock), { role: 'system', id: 'demo', name: 'Demo' });
    });
    cleanupHolds();
  };
  const flag = (k: 'passportUp' | 'boxOnline' | 'entryOnline', v: boolean) => tx((d) => void (d.demo[k] = v));
  const doReset = () => {
    initDb(true);
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('sayohat-entry-') || k.startsWith('sayohat-org-seen-') || k === 'sayohat-demo-done') localStorage.removeItem(k);
    } catch {
      /* storage blocked */
    }
    setDone({});
    toast(t3('Demo maʼlumotlar tiklandi', 'Демо-данные сброшены', 'Demo data reset'), 'ok');
  };
  const tick = (n: number, v: boolean) => {
    const next = { ...done, [n]: v };
    setDone(next);
    try {
      localStorage.setItem('sayohat-demo-done', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // the catalogue comes from iticket.uz: scenarios point at real imported events
  const pub = db.events.filter((e) => e.status === 'published' && e.ext);
  const pick = (k: string, cat?: string) => pub.find((e) => e.kind === k && (!cat || e.ext?.category === cat)) || pub[0];
  const conc = pick('concert');
  const thea = pick('theatre');
  const attr = pub.find((e) => e.ext?.category === 'samarkand') || pub[0];
  const ev = (e: typeof conc) => e?.id || '';
  const og = (e: typeof conc) => e?.orgId || '';
  const scenarios: Scenario[] = [
    {
      n: 1,
      title: t3('Tashkilotchini ulash', 'Подключение организатора', 'Onboarding an organizer'),
      steps: t3('Yangi tashkilotchi sifatida roʻyxatdan oʻting (SMS kodi ekranda koʻrsatiladi) → moderator anketani tasdiqlaydi → tashkilotchi tadbir yaratadi.', 'Зарегистрируйтесь как новый организатор (код из SMS показан на экране) → модератор одобряет анкету → организатор создаёт мероприятие.', 'Sign up as a new organizer (the SMS code is shown on screen) → a moderator approves → the organizer creates an event.'),
      go: [
        { label: t3('Roʻyxatdan oʻtish', 'Регистрация', 'Sign up'), to: '/org/register', guest: true },
        { label: t3('Moderator navbati', 'Очередь модератора', 'Moderator queue'), to: '/mod', mod: 'mod1' },
      ],
    },
    {
      n: 2,
      title: t3('Konsert', 'Концерт', 'Concert'),
      steps: t3('SVG dan maydon → sektorlar tanildi → joylar va fan-zona sozlandi → ikki sanali konsert → moderatsiya → sotuv → bir sanani koʻchirish, xaridorlarga xabar.', 'Площадка из SVG → секторы распознаны → места и фан-зона настроены → концерт на две даты → модерация → продажи → перенос одной даты с уведомлением покупателей.', 'Venue from SVG → sectors recognized → seats and fan zone set → concert on two dates → moderation → sales → one date postponed with buyer notifications.'),
      go: [
        { label: t3('Maydonlar (SVG import)', 'Площадки (импорт SVG)', 'Venues (SVG import)'), to: '/org/venues', org: og(conc) },
        { label: t3('Konsert va koʻchirish', 'Концерт и перенос', 'Concert and postponing'), to: `/org/events/${ev(conc)}`, org: og(conc) },
        { label: t3('Joy sotib olish', 'Купить место', 'Buy a seat'), to: `/e/${ev(conc)}` },
      ],
    },
    {
      n: 3,
      title: t3('Teatr', 'Театр', 'Theatre'),
      steps: t3('Oddiy va VIP joyli zal → mavsum oxirigacha har chorshanba spektakl → «Kattalar» va «Talaba» turlari → moderatsiya → sotuv.', 'Зал с обычными и VIP-местами → спектакль каждую среду до конца сезона → типы «Взрослый» и «Студент» → модерация → продажи.', 'Hall with standard and VIP seats → a play every Wednesday to the end of the season → "Adult" and "Student" types → moderation → sales.'),
      go: [
        { label: t3('Yangi spektakl', 'Новый спектакль', 'New play'), to: '/org/events/new', org: og(thea) },
        { label: t3('Tayyor jadval', 'Готовое расписание', 'An existing schedule'), to: `/org/events/${ev(thea)}`, org: og(thea) },
        { label: t3('Chipta sotib olish', 'Купить билет', 'Buy a ticket'), to: `/e/${ev(thea)}` },
      ],
    },
    {
      n: 4,
      title: t3('Muzey', 'Музей', 'Museum'),
      steps: t3('08:00–17:00 grafik, limitli soatlik slotlar → fuqarolar va xorijliklar uchun turlar → turist xorijiy pasport bilan Visa orqali sotib oladi.', 'График 8:00–17:00, часовые слоты с лимитом → типы для граждан и иностранцев → турист покупает с иностранным паспортом и картой Visa.', 'Hours 8:00–17:00, hourly slots with a limit → types for citizens and foreigners → a tourist buys with a foreign passport and a Visa card.'),
      go: [
        { label: t3('Turist sifatida sotib olish', 'Купить как турист', 'Buy as a tourist'), to: `/e/${ev(attr)}` },
        { label: t3('Muzey grafigi', 'График музея', 'Museum hours'), to: `/org/events/${ev(attr)}`, org: og(attr) },
      ],
    },
    {
      n: 5,
      title: t3('Kinoteatr', 'Кинотеатр', 'Cinema'),
      steps: t3('Ikki zal, biri VIP → filmning ikkala zaldagi seanslari → joy sotib olish.', 'Два зала, один VIP → у фильма сеансы в обоих залах → покупка места.', 'Two halls, one VIP → the film has sessions in both → buying a seat.'),
      go: [
        { label: t3('Film seanslari', 'Сеансы фильма', 'Film sessions'), to: '/org/venues', org: og(conc) },
        { label: t3('Chipta sotib olish', 'Купить билет', 'Buy a ticket'), to: '/events/kino' },
      ],
    },
    {
      n: 6,
      title: t3('Kassa va sayt bir vaqtda', 'Касса и сайт одновременно', 'Box office and website at once'),
      steps: t3('Xaridor sifatida joy tanlang — u 10 daqiqa bron qilinadi. Ikkinchi varaqda kassada oʻsha seansni oching: joy band, uni ikki marta sotib boʻlmaydi.', 'Покупателем выберите место — оно в брони на 10 минут. Во второй вкладке откройте кассу на тот же сеанс: место занято, продать его дважды нельзя.', 'As a buyer pick a seat: it is held for 10 minutes. In a second tab open the box office for the same session: the seat is taken and can’t be sold twice.'),
      go: [
        { label: t3('1. Onlayn joy olish', '1. Взять место онлайн', '1. Hold a seat online'), to: `/e/${ev(conc)}` },
        { label: t3('2. Kassa (yangi varaq)', '2. Касса (новая вкладка)', '2. Box office (new tab)'), to: '/org/box', org: og(conc), tab: true },
      ],
    },
    {
      n: 7,
      title: t3('Moderator rad etishi', 'Отказ модератора', 'Moderator returns an event'),
      steps: t3('«Yangi yil gala-konserti» sabab bilan qaytarilgan → tashkilotchi tuzatadi va qayta yuboradi → moderatorda «Qayta» belgisi → eʼlon.', '«Новогодний гала-концерт» возвращён с причиной → организатор исправляет и отправляет снова → у модератора пометка «Повторно» → публикация.', '"New Year Gala Concert" was returned with a reason → the organizer fixes and resubmits → the moderator sees "Again" → published.'),
      go: [
        { label: t3('Tuzatib yuborish', 'Исправить и отправить', 'Fix and resubmit'), to: '/org/events/new', org: og(conc) },
        { label: t3('Moderator navbati', 'Очередь модератора', 'Moderator queue'), to: '/mod/events', mod: 'mod2' },
      ],
    },
    {
      n: 8,
      title: t3('Kirish', 'Вход', 'Entry check'),
      steps: t3('Xodim bugungi seansni tanlaydi va haqiqiy chiptani, keyin oʻsha chiptani yana va boshqa seans chiptasini skanerlaydi — uchta turli javob. Kamera boʻlmasa, ekrandagi test chiptalardan foydalaning.', 'Сотрудник выбирает сегодняшний сеанс и сканирует действительный билет, затем тот же билет ещё раз и билет другого сеанса — три разных ответа. Без камеры используйте тестовые билеты на экране.', 'Staff pick today’s session and scan a valid ticket, the same ticket again and a ticket of another session: three different answers. Without a camera use the test tickets on screen.'),
      go: [
        { label: t3('Kinoteatrga kirish', 'Вход в кинотеатре', 'Cinema entrance'), to: '/org/entry', org: og(conc) },
        { label: t3('Muzeyga kirish', 'Вход в музее', 'Museum entrance'), to: '/org/entry', org: og(thea) },
      ],
    },
  ];

  const off = getClockOffset();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader title={t3('Demo vositalar', 'Демо-инструменты', 'Demo tools')} sub={t3('Hammasi shu brauzerda saqlanadi; varaqlar bitta joy qoldigʻini koʻradi.', 'Всё хранится в этом браузере; вкладки видят один остаток мест.', 'Everything is stored in this browser; tabs share one stock.')} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            <Clock className="size-5" />
            {t3('Vaqt', 'Время', 'Time')}
          </h2>
          <div className="text-2xl font-bold tabular-nums">{fmtStamp(Date.now() + off)}</div>
          <div className="mt-1 text-sm text-ink-3">
            {t3('Toshkent vaqti', 'по Ташкенту', 'Tashkent time')} {off !== 0 && <Badge tone="warn">{t3('siljish {s}', 'сдвиг {s}', 'shift {s}', { s: shift(off, t3) })}</Badge>}
          </div>
          <p className="mt-3 text-sm text-ink-3">{t3('Bron tugashi, sotuv yopilishi, kassa va muzey slotlarini tekshirish uchun.', 'Помогает проверить окончание брони, закрытие продаж, кассу после начала и вход в музей по слотам.', 'Handy to check hold expiry, sales closing, late box office sales and museum slots.')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => clock(-HOUR)}>
              {t3('−1 soat', '−1 ч', '−1 h')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => clock(HOUR)}>
              {t3('+1 soat', '+1 ч', '+1 h')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => clock(DAY)}>
              {t3('+1 kun', '+1 день', '+1 day')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => clock(7 * DAY)}>
              {t3('+1 hafta', '+1 неделя', '+1 week')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => clock(null)} disabled={off === 0}>
              <RotateCcw className="size-4" />
              {t3('Hozirgi vaqt', 'Сбросить', 'Reset')}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">{t3('Tashqi xizmatlar va aloqa', 'Внешние сервисы и связь', 'Outside services and connection')}</h2>
          <div className="space-y-4">
            <Toggle checked={db.demo.passportUp} onChange={(v) => flag('passportUp', v)} label={t3('Fuqarolar pasportini tekshirish', 'Проверка паспортов граждан', 'Citizen passport check')} hint={t3('Oʻchiring: «Tekshiruv vaqtincha mavjud emas»', 'Выключите, чтобы увидеть «Проверка временно недоступна»', 'Turn off to see "Verification temporarily unavailable"')} />
            <Toggle checked={db.demo.boxOnline} onChange={(v) => flag('boxOnline', v)} label={t3('Kassada internet', 'Интернет в кассе', 'Box office internet')} hint={t3('Aloqasiz kassa sotmaydi', 'Без связи касса не продаёт', 'Without it the box office doesn’t sell')} />
            <Toggle checked={db.demo.entryOnline} onChange={(v) => flag('entryOnline', v)} label={t3('Kirishda internet', 'Интернет на входе', 'Entrance internet')} hint={t3('Aloqasiz kirish yuklab olingan roʻyxat boʻyicha ishlaydi', 'Без связи вход работает по скачанному списку', 'Without it the entrance works from the downloaded list')} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">{t3('Maʼlumotlar', 'Данные', 'Data')}</h2>
          <p className="text-sm text-ink-3">{t3('Tiklash demo maʼlumotlarni va sanalarni bugungi kunga nisbatan qaytaradi. Barcha sotuvlar va yangi tashkilotchilar oʻchadi.', 'Сброс вернёт демо-данные и даты относительно сегодняшнего дня. Все продажи и новые организаторы удалятся.', 'Reset restores the demo data with dates relative to today. All sales and new organizers are removed.')}</p>
          <Button className="mt-4" variant="danger" onClick={() => setReset(true)}>
            <Trash2 className="size-4" />
            {t3('Demo maʼlumotlarni tiklash', 'Сбросить демо-данные', 'Reset demo data')}
          </Button>
          <div className="mt-4 text-sm text-ink-3">
            {t3('Buyurtmalar: {o} · chiptalar: {t} · xabarlar: {m}', 'Заказов: {o} · билетов: {t} · уведомлений: {m}', 'Orders: {o} · tickets: {t} · messages: {m}', { o: db.orders.length, t: db.tickets.length, m: db.outbox.length })}
          </div>
        </Card>
      </div>

      <h2 className="mt-10 mb-1 text-xl font-bold">{t3('Pilot ssenariylari', 'Сценарии пилота', 'Pilot scenarios')}</h2>
      <p className="mb-4 text-ink-3">{t3('PRDdagi sakkizta ssenariy — pilotni qabul qilish asosi. Tugmalar rolni almashtiradi va kerakli ekranni ochadi.', 'Восемь сценариев из PRD — основа приёмки пилота. Кнопки переключают роль и открывают нужный экран.', 'The eight PRD scenarios are the basis of pilot acceptance. The buttons switch the role and open the right screen.')}</p>
      <ol className="grid gap-4 md:grid-cols-2">
        {scenarios.map((s) => (
          <li key={s.n}>
            <Card className={done[s.n] ? 'ring-2 ring-ok' : ''}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand font-bold">{s.n}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold">{s.title}</h3>
                    <Checkbox checked={!!done[s.n]} onChange={(v) => tick(s.n, v)} label={<span className="text-sm">{t3('Oʻtdi', 'Пройден', 'Passed')}</span>} />
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{s.steps}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.go.map((g) => (
                      <Button key={g.label} size="sm" variant="outline" onClick={() => go(g)}>
                        {g.label}
                        {g.tab && <ExternalLink className="size-3.5" />}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 mb-1 text-xl font-bold">{t3('Demo akkauntlar', 'Демо-аккаунты', 'Demo accounts')}</h2>
      <p className="mb-4 flex items-center gap-2 text-ink-3">
        <FlaskConical className="size-4" />
        {t3('Barcha parollar: demo1234', 'Все пароли: demo1234', 'Every password: demo1234')}
      </p>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
        <table className="w-full min-w-[760px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-line text-sm text-ink-3">
              {[t3('Rol', 'Роль', 'Role'), t3('Nomi', 'Имя', 'Name'), t3('Login', 'Логин', 'Login'), t3('Holat', 'Статус', 'Status'), ''].map((h, i) => (
                <th key={i} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-line [&_td]:px-4 [&_td]:py-2.5">
            {db.mods.map((m) => (
              <AccountRow key={m.id} role={t3('Moderator', 'Модератор', 'Moderator')} name={m.name} login={m.email} status={<Badge tone="info">Sayohat</Badge>} onGo={() => go({ label: '', to: '/mod', mod: m.id })} />
            ))}
            {db.orgs.map((o) => (
              <AccountRow key={o.id} role={t3('Tashkilotchi', 'Организатор', 'Organizer')} name={`${o.name} · ${kindsText(o.kinds)}`} login={o.email} status={<OrgStatusBadge status={o.status} />} onGo={() => go({ label: '', to: '/org', org: o.id })} />
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog open={reset} onClose={() => setReset(false)} tone="danger" title={t3('Demo maʼlumotlar tiklansinmi?', 'Сбросить демо-данные?', 'Reset the demo data?')} text={t3('Barcha sotuvlar, oʻzgarishlar va yangi tashkilotchilar shu brauzerning barcha varaqlarida oʻchiriladi.', 'Все продажи, изменения и новые организаторы удалятся во всех вкладках этого браузера.', 'All sales, changes and new organizers are removed in every tab of this browser.')} okLabel={t3('Tiklash', 'Сбросить', 'Reset')} onOk={doReset} />
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <b className="block text-[15px]">{label}</b>
        <span className="text-sm text-ink-3">{hint}</span>
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-1 h-6 w-11 shrink-0 rounded-full bg-line-2 transition-colors peer-checked:bg-ok peer-focus-visible:outline-2 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

function AccountRow({ role, name, login, status, onGo }: { role: string; name: string; login: string; status: ReactNode; onGo: () => void }) {
  const { t3 } = useI18n();
  return (
    <tr>
      <td className="text-sm text-ink-3">{role}</td>
      <td className="font-medium">{name}</td>
      <td className="font-mono text-sm">{login}</td>
      <td>{status}</td>
      <td className="text-right">
        <Button size="sm" variant="dark" onClick={onGo}>
          <UserRound className="size-4" />
          {t3('Kirish', 'Войти', 'Sign in')}
        </Button>
      </td>
    </tr>
  );
}
