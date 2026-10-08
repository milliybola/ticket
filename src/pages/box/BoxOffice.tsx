/*
 * Box office (US-36 – US-38): sessions with today first, the same plan/slots and the same stock as the website,
 * buyer and visitor details, cash with change or a QR payment that waits 5 minutes, printing on an 80 mm tape or A4,
 * reprints marked "COPY" with the same QR codes.
 */
import { ArrowLeft, Banknote, CheckCircle2, Clock, FlaskConical, Plus, Printer, QrCode, Search, Wifi, WifiOff, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { nTickets, tl, useI18n } from '../../lib/i18n';
import { digits, nfmt, sum } from '../../lib/format';
import { addDays, dateKey, fmtDate, fmtDT, hhmm, MIN, mmss, now, relDay, todayKey } from '../../lib/time';
import { groupBy, uniq } from '../../lib/util';
import { getDb, tx, useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import {
  BOX_LATE_MIN,
  boxDay,
  completeOrder,
  dropHold,
  eventSessions,
  getEvent,
  getHold,
  getOrder,
  getSession,
  getVenue,
  holdAlive,
  itemsTotal,
  kindName,
  logAct,
  markPaying,
  markPrinted,
  museumDay,
  museumSlots,
  orderTickets,
  salesOpen,
  unitInfo,
  unitStock,
  type Unit,
} from '../../domain/rules';
import { needsVisitors, printFmt, setPrintFmt, type PrintFmt } from '../../domain/purchase';
import type { Buyer, EventItem, Hold, Order, Visitor } from '../../domain/types';
import { Poster, Qr } from '../../components/common';
import { printOrder, ReceiptView, TicketView } from '../../components/tickets';
import { Badge, Button, cn, Empty, Input, Modal, Notice, Segmented, toast } from '../../components/ui';
import { SeatPicker } from '../../components/purchase/SeatPicker';
import { firstMuseumDate, MuseumCalendar, MuseumTypes, SlotList } from '../../components/purchase/MuseumPicker';
import { BuyerForm, VisitorsForm, type VRow } from '../../components/purchase/forms';
import { HoldSummary, HoldTimer, Steps } from '../../components/purchase/parts';
import { clearSel, useNow } from '../../components/purchase/state';
import { PlanLoader } from '../../components/PlanLoader';

const QR_WAIT = 5 * MIN;
const offlineText = () => tl({ uz: 'Aloqa yoʻq. Joyni ikki marta sotmaslik uchun sotuv mumkin emas', ru: 'Нет связи. Продажа невозможна, чтобы не продать место дважды', en: 'No connection. Sales are blocked so a seat can’t be sold twice' });

export default function BoxOffice() {
  useI18n();
  useDb();
  const orgId = useAuth((s) => s.orgId) || '';
  const [sp, setSp] = useSearchParams();
  const key = sp.get('s');
  return key ? <BoxSale key={key} orgId={orgId} k={key} onBack={() => setSp({})} /> : <BoxList orgId={orgId} onPick={(k) => setSp({ s: k })} />;
}

function NetChip() {
  const { t3 } = useI18n();
  const on = getDb().demo.boxOnline;
  return (
    <Badge tone={on ? 'ok' : 'bad'} className="px-3 py-1 text-sm">
      {on ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
      {on ? t3('Aloqa bor', 'Связь есть', 'Online') : t3('Aloqa yoʻq', 'Нет связи', 'Offline')}
    </Badge>
  );
}
function OfflineBanner() {
  const { t3 } = useI18n();
  if (getDb().demo.boxOnline) return null;
  return (
    <Notice tone="bad" className="mb-4" title={offlineText()}>
      {t3('Aloqa «Demo vositalar»da yoqiladi.', 'Связь включается в «Демо-инструментах».', 'Turn the connection back on in Demo tools.')}
    </Notice>
  );
}

// ---------------------------------------------------------------- session list

type Row = { s: { id: string; startsAt: number }; ev: EventItem; u: Unit };
const matchQ = (ev: EventItem, q: string) => !q || [ev.card.title.uz, ev.card.title.ru, ev.card.title.en].some((x) => (x || '').toLowerCase().includes(q));

function BoxList({ orgId, onPick }: { orgId: string; onPick: (k: string) => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  useNow(30_000);
  const [q, setQ] = useState('');
  const [days, setDays] = useState(7);
  const t = todayKey();
  const qq = q.trim().toLowerCase();
  const mine = db.events.filter((e) => e.orgId === orgId && e.status === 'published');
  const rows: Row[] = [];
  for (const ev of mine.filter((e) => e.kind !== 'museum' && matchQ(e, qq)))
    for (const s of eventSessions(ev.id)) {
      const u = unitInfo(s.id);
      if (u && salesOpen(u, 'box')) rows.push({ s, ev, u });
    }
  rows.sort((a, b) => a.s.startsAt - b.s.startsAt);
  const limit = addDays(t, days - 1);
  const shown = qq ? rows : rows.filter((r) => dateKey(r.s.startsAt) <= limit);
  const groups = groupBy(shown, (r) => dateKey(r.s.startsAt));
  const museums = mine.filter((e) => e.kind === 'museum' && matchQ(e, qq));
  const day = boxDay(orgId, t);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{t3('Kassa', 'Касса', 'Box office')}</h1>
          <p className="mt-1 max-w-2xl text-ink-3">{t3('Sayt bilan bir xil qoldiqdan sotuv: kassada tanlangan joy darhol onlayn band boʻladi va aksincha.', 'Продажа из того же остатка, что и на сайте: место, выбранное в кассе, сразу занято онлайн, и наоборот.', 'Sells from the same stock as the website: a seat picked here is taken online at once, and the other way round.')}</p>
        </div>
        <NetChip />
      </div>
      <OfflineBanner />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label={t3('Bugun sotildi', 'Продано сегодня', 'Sold today')} value={nTickets(day.tickets)} />
        <MiniStat label={t3('Naqd', 'Наличные', 'Cash')} value={sum(day.cash)} />
        <MiniStat label="QR" value={sum(day.qr)} />
        <MiniStat label={t3('Qayta chop etish', 'Повторные печати', 'Reprints')} value={String(day.reprints)} />
      </div>
      <label className="relative mb-5 block">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" />
        <Input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t3('Nomi boʻyicha qidirish', 'Поиск по названию', 'Search by title')} className="h-12 pl-11 text-base" />
      </label>
      {!rows.length && !museums.length ? (
        <Empty title={qq ? t3('Hech narsa topilmadi', 'Ничего не найдено', 'Nothing found') : t3('Sotuvda seanslar yoʻq', 'Нет сеансов в продаже', 'No sessions on sale')}>
          {!qq && t3('Kassada eʼlon qilingan tadbirlar sotiladi. Seans boshlanganidan keyin {n} daqiqagacha mavjud.', 'В кассе продаются опубликованные мероприятия. Сеанс доступен до {n} минут после начала.', 'The box office sells published events, up to {n} minutes after a session starts.', { n: BOX_LATE_MIN })}
        </Empty>
      ) : (
        <div className="space-y-6">
          {museums.length > 0 && (
            <section>
              <h2 className="mb-2 font-bold">{t3('Vaqt boʻyicha kirish', 'Вход по времени', 'Timed entry')}</h2>
              <div className="space-y-2">
                {museums.map((ev) => (
                  <MuseumRow key={ev.id} ev={ev} onPick={() => onPick(ev.id)} />
                ))}
              </div>
            </section>
          )}
          {Object.entries(groups).map(([dd, rs]) => (
            <section key={dd}>
              <h2 className="mb-2 font-bold">
                {relDay(dd) ? (
                  <>
                    {relDay(dd)}, <span className="font-normal text-ink-3">{fmtDate(dd)}</span>
                  </>
                ) : (
                  fmtDate(dd)
                )}
              </h2>
              <div className="space-y-2">
                {rs.map((r) => (
                  <SessionRow key={r.s.id} r={r} onPick={() => onPick(r.s.id)} />
                ))}
              </div>
            </section>
          ))}
          {!shown.length && <p className="text-ink-3">{t3('Yaqin {n} kunda seanslar yoʻq.', 'В ближайшие {n} дней сеансов нет.', 'No sessions in the next {n} days.', { n: days })}</p>}
          {!qq && rows.length > shown.length && (
            <Button variant="outline" block onClick={() => setDays((d) => d + 7)}>
              {t3('Yana 7 kunni koʻrsatish', 'Показать ещё 7 дней', 'Show 7 more days')} ({rows.length - shown.length})
            </Button>
          )}
        </div>
      )}
      <TodaySales orders={day.orders} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-[var(--shadow-card)]">
      <div className="text-sm text-ink-3">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function SessionRow({ r, onPick }: { r: Row; onPick: () => void }) {
  const { t3 } = useI18n();
  const st = unitStock(r.u);
  const started = r.s.startsAt <= now();
  const multi = (r.u.venue?.halls.length || 0) > 1;
  return (
    <button type="button" onClick={onPick} className={cn('flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-3.5 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-brand-soft focus-visible:bg-brand-soft', !st.free && 'opacity-60')}>
      <span className="w-16 shrink-0 font-mono text-xl font-bold">{hhmm(r.s.startsAt)}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{tl(r.ev.card.title)}</b>
        <small className="block truncate text-ink-3">
          {kindName(r.ev.kind)} · {r.u.venue?.name}
          {multi && r.u.hall ? ` · ${r.u.hall.name}` : ''}
        </small>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {started && <Badge tone="warn">{t3('davom etmoqda · kassa {t} gacha', 'идёт · касса до {t}', 'started · box office until {t}', { t: hhmm(r.s.startsAt + BOX_LATE_MIN * MIN) })}</Badge>}
        {st.free ? <span className="text-sm font-semibold">{t3('{n} ta boʻsh', '{n} своб.', '{n} free', { n: st.free })}</span> : <Badge tone="bad">{t3('Sotib boʻlingan', 'Распродано', 'Sold out')}</Badge>}
      </span>
    </button>
  );
}

function MuseumRow({ ev, onPick }: { ev: EventItem; onPick: () => void }) {
  const { t3 } = useI18n();
  const t = todayKey();
  const d = museumDay(ev, t);
  const cur = d.open ? museumSlots(ev, t).find((x) => !x.past) : null;
  return (
    <button type="button" onClick={onPick} className="flex w-full items-center gap-4 rounded-2xl bg-white px-4 py-3.5 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-brand-soft focus-visible:bg-brand-soft">
      <span className="grid w-16 shrink-0 place-items-center">
        <Clock className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate">{tl(ev.card.title)}</b>
        <small className="block truncate text-ink-3">
          {kindName(ev.kind)} · {getVenue(ev.venueId)?.name} · {d.open && d.h ? t3('bugun {o}–{c}', 'сегодня {o}–{c}', 'today {o}–{c}', { o: d.h.open, c: d.h.close }) : d.reason || t3('bugun yopiq', 'сегодня закрыто', 'closed today')}
        </small>
      </span>
      <span className="shrink-0 text-sm font-semibold">{cur ? `${cur.start}–${cur.end} · ${t3('{n} ta boʻsh', '{n} своб.', '{n} free', { n: cur.left })}` : t3('sanani tanlash', 'выбрать дату', 'pick a date')}</span>
    </button>
  );
}

/** Today's box office sales with a reprint button (the printer jammed, the buyer lost the ticket). */
function TodaySales({ orders }: { orders: Order[] }) {
  const { t3 } = useI18n();
  const [fmt] = useState<PrintFmt>(printFmt);
  if (!orders.length) return null;
  const list = orders.slice().sort((a, b) => b.at - a.at).slice(0, 15);
  return (
    <section className="mt-10">
      <h2 className="mb-2 font-bold">{t3('Bugungi kassa sotuvlari', 'Продажи кассы сегодня', 'Box office sales today')}</h2>
      <div className="divide-y divide-line rounded-2xl bg-white shadow-[var(--shadow-card)]">
        {list.map((o) => {
          const ev = getEvent(o.ev);
          return (
            <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="font-mono text-sm">{hhmm(o.at)}</span>
              <span className="font-mono text-sm font-semibold">{o.id}</span>
              <span className="min-w-0 flex-1 truncate">{ev ? tl(ev.card.title) : ''}</span>
              <span className="text-sm text-ink-3">
                {nTickets(o.tickets.length)} · {sum(o.total)} · {o.pay.method === 'cash' ? t3('naqd', 'нал.', 'cash') : 'QR'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (printOrder(o, { copy: o.prints > 0, tape: fmt === '80mm', receipt: true })) markPrinted(o.id);
                  else toast(popupText(), 'bad');
                }}
              >
                <Printer className="size-4" />
                {o.prints > 0 ? t3('Nusxa', 'Копия', 'Copy') : t3('Chop etish', 'Печать', 'Print')}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
const popupText = () => tl({ uz: 'Brauzer chop etish oynasini bloklab qoʻydi — qalqib chiquvchi oynalarga ruxsat bering', ru: 'Браузер заблокировал окно печати — разрешите всплывающие окна', en: 'The browser blocked the print window: allow pop-ups' });

// ---------------------------------------------------------------- one sale

type Step = 'data' | 'visitors' | 'pay';
type Result = { kind: 'done'; orderId: string; copy: boolean } | { kind: 'cancelled'; why: 'timeout' | 'refused' };

function BoxSale({ orgId, k, onBack }: { orgId: string; k: string; onBack: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const tick = useNow(1000);
  const holder = `box:${orgId}`;
  const session = getSession(k);
  const ev = session ? getEvent(session.eventId) : getEvent(k);
  const [fmt, setFmt] = useState<PrintFmt>(printFmt);
  const [holdId, setHoldId] = useState<string | null>(null);
  const holdRef = useRef<string | null>(null);
  const [step, setStep] = useState<Step>('data');
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [rows, setRows] = useState<VRow[]>([]);
  const [visitors, setVisitors] = useState<(Visitor | null)[] | null>(null);
  const [method, setMethod] = useState<'cash' | 'qr'>('cash');
  const [recv, setRecv] = useState(0);
  const [qrStart, setQrStart] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [date, setDate] = useState<string | null>(() => (ev && ev.kind === 'museum' ? (museumDay(ev, todayKey()).open ? todayKey() : firstMuseumDate(ev)) : null));
  const [slot, setSlot] = useState<string | null>(null);

  const hold = holdId ? getHold(holdId) : null;
  const alive = holdAlive(hold);

  const reset = () => {
    holdRef.current = null;
    setHoldId(null);
    setStep('data');
    setBuyer(null);
    setRows([]);
    setVisitors(null);
    setMethod('cash');
    setRecv(0);
    setQrStart(null);
  };
  // leaving the sale screen releases what the cashier was holding (also a QR payment that never came)
  useEffect(
    () => () => {
      if (holdRef.current && getHold(holdRef.current)) dropHold(holdRef.current);
    },
    [],
  );
  // the 10-minute hold ran out before payment
  useEffect(() => {
    if (holdId && !result && !holdAlive(getHold(holdId))) {
      reset();
      toast(t3('Bron vaqti tugadi, joylar boʻshatildi', 'Время брони истекло, места освобождены', 'The hold expired and the places were released'), 'bad');
    }
  }, [tick, db.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  // QR payment waits 5 minutes, then it is cancelled and the places are released
  useEffect(() => {
    if (qrStart && !result && now() >= qrStart + QR_WAIT) qrCancel('timeout');
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  // museum: pick the first slot of the day that still has tickets
  const firstSlot = useMemo(() => (ev && date && ev.kind === 'museum' ? museumSlots(ev, date).find((x) => !x.past && x.left > 0)?.sid || null : null), [ev, date, db.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const sid = session ? session.id : slot || firstSlot;

  if (!ev || ev.orgId !== orgId || (!session && ev.kind !== 'museum'))
    return (
      <Empty title={t3('Seans topilmadi', 'Сеанс не найден', 'Session not found')} action={<Button onClick={onBack}>{t3('Barcha seanslar', 'Все сеансы', 'All sessions')}</Button>} />
    );

  const u = sid ? unitInfo(sid) : null;
  const block = getDb().demo.boxOnline ? null : offlineText();
  const onHold = (h: Hold) => {
    holdRef.current = h.id;
    setHoldId(h.id);
    setResult(null);
    setStep('data');
  };
  const withVisitors = hold ? needsVisitors(hold, ev) : false;

  const complete = (pay: Order['pay']) => {
    if (!getDb().demo.boxOnline) return toast(offlineText(), 'bad');
    const h = holdId ? getHold(holdId) : null;
    if (!h) {
      toast(t3('Bron topilmadi', 'Бронь не найдена', 'The hold was not found'), 'bad');
      return reset();
    }
    const res = completeOrder(h, buyer!, withVisitors ? visitors : null, pay);
    if (!res.ok) {
      reset();
      return toast(t3('Joylar allaqachon sotilgan — boshqasini tanlang', 'Места уже проданы — выберите другие', 'Those places are already sold, pick others'), 'bad');
    }
    holdRef.current = null;
    clearSel('box', h.sid);
    if (printOrder(res.order, { tape: fmt === '80mm', receipt: true })) markPrinted(res.order.id);
    else toast(popupText(), 'bad');
    setResult({ kind: 'done', orderId: res.order.id, copy: false });
  };
  const qrBegin = () => {
    if (!getDb().demo.boxOnline) return toast(offlineText(), 'bad');
    if (!hold) return;
    markPaying(hold.id, true);
    tx(() => logAct('box-qr', hold.sid, t3('QR orqali toʻlov kutilmoqda', 'Ждём оплату по QR', 'Waiting for QR payment')));
    setQrStart(now());
  };
  function qrCancel(why: 'timeout' | 'refused') {
    if (holdRef.current) dropHold(holdRef.current);
    tx(() => logAct('box-qr-cancel', sid || '', why === 'timeout' ? t3('QR toʻlov 5 daqiqada kelmadi', 'Оплата по QR не пришла за 5 минут', 'No QR payment within 5 minutes') : t3('Xaridor toʻlovdan voz kechdi', 'Покупатель отказался от оплаты', 'The buyer declined to pay')));
    reset();
    setResult({ kind: 'cancelled', why });
  }
  const cancelSale = () => {
    if (holdRef.current) dropHold(holdRef.current);
    reset();
    setConfirmCancel(false);
    toast(t3('Rasmiylashtirish bekor qilindi, joylar boʻsh', 'Оформление отменено, места свободны', 'Sale cancelled, the places are free again'), 'ok');
  };
  const newSale = () => {
    reset();
    setResult(null);
    window.scrollTo({ top: 0 });
  };
  const venue = getVenue(ev.venueId);
  const steps = [
    { k: 'data', label: t3('Xaridor', 'Покупатель', 'Buyer') },
    ...(withVisitors ? [{ k: 'visitors', label: t3('Tashrif buyuruvchilar', 'Посетители', 'Visitors') }] : []),
    { k: 'pay', label: t3('Toʻlov', 'Оплата', 'Payment') },
  ];
  const waiting = !!qrStart;

  let main: ReactNode;
  if (result?.kind === 'done') main = <BoxDone orderId={result.orderId} copy={result.copy} fmt={fmt} onCopy={() => setResult({ ...result, copy: true })} onNew={newSale} onBack={onBack} />;
  else if (result?.kind === 'cancelled')
    main = (
      <div className="mx-auto max-w-lg rounded-[var(--radius-card)] bg-white p-6 text-center shadow-[var(--shadow-card)]">
        <XCircle className="mx-auto size-12 text-bad" />
        <Badge tone="bad" className="mt-3">
          {t3('Bekor qilindi', 'Отменено', 'Cancelled')}
        </Badge>
        <h2 className="mt-2 text-xl font-bold">{result.why === 'timeout' ? t3('Toʻlov 5 daqiqada kelmadi', 'Оплата не пришла за 5 минут', 'No payment within 5 minutes') : t3('Xaridor toʻlovdan voz kechdi', 'Покупатель отказался от оплаты', 'The buyer declined to pay')}</h2>
        <p className="mt-1 text-ink-3">{t3('Joylar sayt va kassa uchun boʻshatildi.', 'Места уже освобождены для сайта и кассы.', 'The places are already free for the website and the box office.')}</p>
        <Button size="lg" className="mt-5" autoFocus onClick={newSale}>
          {t3('Yangi sotuv', 'Новая продажа', 'New sale')}
        </Button>
      </div>
    );
  else if (hold && alive)
    main = (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Steps steps={steps} cur={step} />
          {step === 'data' && (
            <BuyerForm
              key="data"
              online={false}
              initial={buyer}
              title={t3('Xaridor', 'Покупатель', 'Buyer')}
              submitLabel={t3('Davom etish', 'Продолжить', 'Continue')}
              onSubmit={(b) => {
                setBuyer(b);
                setStep(needsVisitors(hold, ev) ? 'visitors' : 'pay');
              }}
            />
          )}
          {step === 'visitors' && buyer && (
            <VisitorsForm
              box
              hold={hold}
              ev={ev}
              buyerName={buyer.name}
              rows={rows}
              setRows={setRows}
              onBack={() => setStep('data')}
              onDone={(v) => {
                setVisitors(v);
                setStep('pay');
              }}
            />
          )}
          {step === 'pay' && buyer && (
            <BoxPay
              hold={hold}
              method={method}
              setMethod={setMethod}
              recv={recv}
              setRecv={setRecv}
              qrStart={qrStart}
              onBack={() => setStep(withVisitors ? 'visitors' : 'data')}
              onCash={() => complete({ method: 'cash', received: recv, at: now() })}
              onQrStart={qrBegin}
              onQrPaid={() => complete({ method: 'qr', at: now() })}
              onQrRefused={() => qrCancel('refused')}
            />
          )}
        </div>
        <aside className="space-y-3 lg:sticky lg:top-6">
          {!waiting && <HoldTimer hold={hold} />}
          <HoldSummary hold={hold} showUsd={false} />
          {!waiting && (
            <Button variant="outline" block className="text-bad" onClick={() => setConfirmCancel(true)}>
              <X className="size-4" />
              {t3('Rasmiylashtirishni bekor qilish', 'Отменить оформление', 'Cancel this sale')}
            </Button>
          )}
        </aside>
      </div>
    );
  else if (session) {
    const su = unitInfo(session.id)!;
    const st = unitStock(su);
    main = !salesOpen(su, 'box') ? (
      <Empty title={t3('Bu seansga sotuv yopilgan', 'Продажи на этот сеанс закрыты', 'Sales for this session are closed')} action={<Button onClick={onBack}>{t3('Barcha seanslar', 'Все сеансы', 'All sessions')}</Button>}>
        {t3('Kassa seans boshlanganidan keyin {n} daqiqagacha sotadi.', 'Касса продаёт до {n} минут после начала сеанса.', 'The box office sells up to {n} minutes after the start.', { n: BOX_LATE_MIN })}
      </Empty>
    ) : (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>
            {t3('Boʻsh', 'Свободно', 'Free')} <b className="text-lg">{st.free}</b> / {st.total}
          </span>
          {su.startsAt <= now() ? (
            <Badge tone="warn">{t3('Seans davom etmoqda · kassa {t} gacha sotadi', 'Сеанс идёт · касса продаёт до {t}', 'In progress · box office sells until {t}', { t: hhmm(su.startsAt + BOX_LATE_MIN * MIN) })}</Badge>
          ) : (
            <span className="text-sm text-ink-3">{t3('onlayn {t} gacha sotiladi', 'онлайн продаётся до {t}', 'online until {t}', { t: fmtDT(session.salesUntil || session.startsAt) })}</span>
          )}
        </div>
        <PlanLoader sid={su.sid}>{su.scheme ? <SeatPicker u={su} channel="box" holder={holder} onHold={onHold} block={block} /> : null}</PlanLoader>
      </>
    );
  } else
    main = (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-5">
          <h2 className="mb-3 font-bold">{t3('Sana', 'Дата', 'Date')}</h2>
          <MuseumCalendar
            ev={ev}
            date={date}
            onDate={(d) => {
              setDate(d);
              setSlot(null);
            }}
          />
        </section>
        <div className="space-y-4">
          {date && (
            <section className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-5">
              <h2 className="mb-3 font-bold">
                {relDay(date) ? `${relDay(date)}, ` : ''}
                {fmtDate(date)}
              </h2>
              <SlotList ev={ev} date={date} sid={sid} onSlot={setSlot} />
            </section>
          )}
          {u && (
            <section className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-5">
              <h2 className="mb-1 font-bold">{t3('{t} uchun chiptalar', 'Билеты на {t}', 'Tickets for {t}', { t: `${u.start}–${u.end}` })}</h2>
              <MuseumTypes key={u.sid} u={u} channel="box" holder={holder} onHold={onHold} block={block} />
            </section>
          )}
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="size-4" />
        {t3('Barcha seanslar', 'Все сеансы', 'All sessions')}
      </Button>
      <div className="mt-2 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-16 w-12 shrink-0 overflow-hidden rounded-xl">
            <Poster card={ev.card} showTitle={false} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold md:text-2xl">{tl(ev.card.title)}</h1>
            <p className="text-ink-3">
              {session ? fmtDT(session.startsAt) : kindName(ev.kind)} · {venue?.name}
              {session && u?.hall && venue && venue.halls.length > 1 ? ` · ${u.hall.name}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NetChip />
          <span className="inline-flex items-center gap-2 text-sm text-ink-3">
            <Printer className="size-4" />
            <Segmented
              size="sm"
              value={fmt}
              onChange={(v) => {
                setFmt(v);
                setPrintFmt(v);
              }}
              options={[
                { value: '80mm', label: t3('80 mm lenta', 'Лента 80 мм', '80 mm roll') },
                { value: 'A4', label: 'A4' },
              ]}
            />
          </span>
        </div>
      </div>
      <OfflineBanner />
      {main}
      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        size="sm"
        title={t3('Rasmiylashtirish bekor qilinsinmi?', 'Отменить оформление?', 'Cancel this sale?')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              {t3('Qaytish', 'Вернуться', 'Go back')}
            </Button>
            <Button variant="danger" autoFocus onClick={cancelSale}>
              {t3('Bekor qilish', 'Отменить', 'Cancel the sale')}
            </Button>
          </>
        }
      >
        <p className="text-ink-2">{t3('Joylar darhol sayt va kassa uchun boʻshaydi.', 'Места сразу освободятся для сайта и кассы.', 'The places are released at once for the website and the box office.')}</p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- payment (US-37)

function cashQuick(total: number) {
  const r = (step: number, plus = 0) => Math.ceil((total + plus) / step) * step;
  return uniq([total, r(10000), r(50000), r(100000), r(200000), r(100000, 1), r(500000, 1)])
    .filter((v) => v >= total)
    .sort((a, b) => a - b)
    .slice(0, 5);
}

function BoxPay(p: { hold: Hold; method: 'cash' | 'qr'; setMethod: (m: 'cash' | 'qr') => void; recv: number; setRecv: (n: number) => void; qrStart: number | null; onBack: () => void; onCash: () => void; onQrStart: () => void; onQrPaid: () => void; onQrRefused: () => void }) {
  const { t3 } = useI18n();
  const t = useNow(1000);
  const total = itemsTotal(p.hold.items);
  const waiting = !!p.qrStart;
  const enough = p.recv >= total;
  return (
    <div className="space-y-5 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-6">
      <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-xl font-bold">
        {t3('Toʻlovga', 'К оплате', 'To pay')}
        <span className="text-3xl tabular-nums">{sum(total)}</span>
      </h2>
      <div className="grid grid-cols-2 gap-3" role="radiogroup">
        {(
          [
            ['cash', Banknote, t3('Naqd pul', 'Наличные', 'Cash')],
            ['qr', QrCode, t3('QR orqali toʻlov', 'Оплата по QR', 'QR payment')],
          ] as const
        ).map(([k, Icon, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={p.method === k}
            disabled={waiting}
            onClick={() => p.setMethod(k)}
            className={cn('flex h-20 items-center justify-center gap-3 rounded-2xl border-2 text-lg font-bold transition-colors disabled:opacity-50', p.method === k ? 'border-ink bg-brand' : 'border-line hover:border-ink-3')}
          >
            <Icon className="size-7" />
            {label}
          </button>
        ))}
      </div>
      {p.method === 'cash' ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (enough) p.onCash();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-2">{t3('Olindi, soʻm', 'Получено, сум', 'Received, UZS')}</span>
            <Input autoFocus inputMode="numeric" autoComplete="off" value={p.recv ? nfmt(p.recv) : ''} placeholder={nfmt(total)} onChange={(e) => p.setRecv(Number(digits(e.target.value).slice(0, 10)) || 0)} className="h-16 font-mono text-3xl font-bold" />
          </label>
          <div className="flex flex-wrap gap-2">
            {cashQuick(total).map((v) => (
              <button key={v} type="button" onClick={() => p.setRecv(v)} className={cn('rounded-xl border-2 px-3.5 py-2 font-mono font-semibold transition-colors', p.recv === v ? 'border-ink bg-ink text-white' : 'border-line-2 hover:border-ink')}>
                {nfmt(v)}
              </button>
            ))}
          </div>
          <p className={cn('text-lg', !p.recv ? 'text-ink-3' : enough ? 'text-ok' : 'text-bad')}>
            {!p.recv ? (
              t3('Olingan summani kiriting — qaytim oʻzi hisoblanadi', 'Введите полученную сумму — сдача посчитается сама', 'Enter the amount received and the change is worked out for you')
            ) : enough ? (
              <>
                {t3('Qaytim', 'Сдача', 'Change')} <b className="text-2xl tabular-nums">{sum(p.recv - total)}</b>
              </>
            ) : (
              t3('{n} yetmaydi', 'Не хватает {n}', '{n} short', { n: sum(total - p.recv) })
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={p.onBack}>
              <ArrowLeft className="size-4" />
              {t3('Orqaga', 'Назад', 'Back')}
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={!enough}>
              <CheckCircle2 className="size-5" />
              {t3('Pul olindi', 'Деньги получены', 'Cash received')}
            </Button>
          </div>
        </form>
      ) : !waiting ? (
        <div className="space-y-4">
          <p className="text-ink-2">{t3('Xaridorga toʻlov tizimining QR-kodini koʻrsating. Toʻlov 5 daqiqa kutadi, keyin bekor qilinadi.', 'Покажите покупателю QR-код платёжной системы. Оплата ждёт 5 минут, затем отменяется.', 'Show the buyer the payment QR code. It waits 5 minutes and is then cancelled.')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={p.onBack}>
              <ArrowLeft className="size-4" />
              {t3('Orqaga', 'Назад', 'Back')}
            </Button>
            <Button size="lg" className="flex-1" autoFocus onClick={p.onQrStart}>
              <QrCode className="size-5" />
              {t3('QR-kodni koʻrsatish', 'Показать QR-код', 'Show the QR code')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-line p-3">
            <Qr text={`https://pay.sayohat.uz/qr/${p.hold.id}?amount=${total}`} size={200} />
            <span className="font-semibold tabular-nums">{sum(total)}</span>
          </div>
          <div className="space-y-3">
            <Badge tone="warn" className="px-3 py-1 text-sm">
              <Clock className="size-4" />
              {t3('Toʻlov kutilmoqda', 'Ждём оплату', 'Waiting for payment')}
            </Badge>
            <p className="text-lg">
              {t3('Qoldi', 'Осталось', 'Time left')} <b className="font-mono text-2xl">{mmss((p.qrStart || 0) + QR_WAIT - t)}</b>
            </p>
            <p className="flex items-start gap-2 text-sm text-ink-3">
              <FlaskConical className="mt-0.5 size-4 shrink-0" />
              {t3('Demo: toʻlov qanday tugashini tanlang.', 'Демо: выберите, чем закончится оплата.', 'Demo: choose how the payment ends.')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" variant="ok" onClick={p.onQrPaid}>
                <CheckCircle2 className="size-5" />
                {t3('Toʻlov keldi', 'Оплата пришла', 'Payment received')}
              </Button>
              <Button size="lg" variant="outline" onClick={p.onQrRefused}>
                <X className="size-5" />
                {t3('Xaridor rad etdi', 'Покупатель отказался', 'Buyer declined')}
              </Button>
            </div>
          </div>
        </div>
      )}
      <p className="text-sm text-ink-3">{t3('Toʻlovdan keyin kassadagi sotuvni bekor qilib boʻlmaydi: qaytarishlar keyinroq paydo boʻladi.', 'После оплаты продажу в кассе отменить нельзя: возвраты появятся позже.', 'After payment a box office sale can’t be cancelled; refunds will come later.')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- after the sale: printing

function BoxDone({ orderId, copy, fmt, onCopy, onNew, onBack }: { orderId: string; copy: boolean; fmt: PrintFmt; onCopy: () => void; onNew: () => void; onBack: () => void }) {
  const { t3 } = useI18n();
  useDb();
  const o = getOrder(orderId);
  if (!o) return null;
  const ts = orderTickets(o);
  const print = (asCopy: boolean) => {
    if (!printOrder(o, { copy: asCopy, tape: fmt === '80mm', receipt: true })) return toast(popupText(), 'bad');
    markPrinted(o.id);
    if (asCopy) {
      onCopy();
      toast(t3('Nusxa printerga yuborildi', 'Копия отправлена на принтер', 'Copy sent to the printer'), 'ok');
    }
  };
  const fmtName = fmt === 'A4' ? t3('A4 varaq', 'лист A4', 'A4 sheet') : t3('80 mm lenta', 'лента 80 мм', '80 mm roll');
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4 rounded-[var(--radius-card)] bg-ok-soft p-5">
        <CheckCircle2 className="size-10 shrink-0 text-ok" />
        <div>
          <h2 className="text-2xl font-bold">{t3('Sotuv yakunlandi', 'Продажа завершена', 'Sale complete')}</h2>
          <p className="mt-1 text-ink-2">
            {t3('Buyurtma', 'Заказ', 'Order')} <b className="font-mono text-ink">{o.id}</b> · {nTickets(ts.length)} · {sum(o.total)} · {o.pay.method === 'cash' ? t3('naqd', 'наличные', 'cash') : 'QR'}
            {o.pay.received ? (
              <>
                {' · '}
                {t3('qaytim', 'сдача', 'change')} <b className="text-ink">{sum(o.pay.received - o.total)}</b>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <Notice tone="info">
        <span className="inline-flex items-start gap-2">
          <Printer className="mt-0.5 size-4 shrink-0" />
          <span>
            {o.prints === 0
              ? t3('Chop etilmadi — «Chop etish»ni bosing.', 'Ещё не напечатано — нажмите «Печать».', 'Not printed yet: press Print.')
              : copy
                ? t3('Nusxa kassa printeriga yuborildi. QR-kodlar oʻsha, yangi chiptalar yaratilmaydi.', 'Копия отправлена на принтер кассы. QR-коды прежние, новые билеты не создаются.', 'A copy was sent to the box office printer. Same QR codes; no new tickets are created.')
                : t3('Chiptalar va fiskal chek kassa printeriga yuborildi ({f}).', 'Билеты и фискальный чек отправлены на принтер кассы ({f}).', 'The tickets and the fiscal receipt were sent to the box office printer ({f}).', { f: fmtName })}
            {o.buyer.email ? ' ' + t3('Chipta {e} manziliga ham yuborildi.', 'Билет также отправлен на {e}.', 'The ticket was also emailed to {e}.', { e: o.buyer.email }) : ''}
          </span>
        </span>
      </Notice>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" autoFocus onClick={onNew}>
          <Plus className="size-5" />
          {t3('Yangi sotuv', 'Новая продажа', 'New sale')}
        </Button>
        {o.prints === 0 ? (
          <Button size="lg" variant="dark" onClick={() => print(false)}>
            <Printer className="size-5" />
            {t3('Chop etish', 'Печать', 'Print')}
          </Button>
        ) : (
          <Button size="lg" variant="outline" onClick={() => print(true)}>
            <Printer className="size-5" />
            {t3('Qayta chop etish (NUSXA)', 'Напечатать повторно (КОПИЯ)', 'Print again (COPY)')}
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={onBack}>
          {t3('Barcha seanslar', 'Все сеансы', 'All sessions')}
        </Button>
      </div>
      <h3 className="font-bold">
        {t3('Chop shunday koʻrinadi', 'Так выглядит печать', 'Print preview')}{' '}
        <span className="text-sm font-normal text-ink-3">
          ({fmt === 'A4' ? 'A4' : '80 mm'}
          {o.prints > 1 ? ' · ' + t3('{n} marta chop etilgan', 'напечатано {n} раз', 'printed {n} times', { n: o.prints }) : ''})
        </span>
      </h3>
      <div className={cn('flex flex-col items-center gap-4 rounded-[var(--radius-card)] bg-black/[0.04] p-4', fmt === '80mm' && '[&_.ticket]:max-w-[300px] [&_.ticket]:flex-col [&_.ticket>div:last-child]:w-auto [&_.ticket>div:last-child]:border-t-2 [&_.ticket>div:last-child]:border-l-0')}>
        {ts.map((t) => (
          <TicketView key={t.id} t={t} order={o} copy={copy || o.prints > 1} />
        ))}
        <ReceiptView order={o} />
      </div>
    </div>
  );
}
