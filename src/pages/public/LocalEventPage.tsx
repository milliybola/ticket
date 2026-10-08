/*
 * Sayohat event page (US-25 – US-29): card, venue, sessions (list; cinema by day and hall; museum calendar → slots →
 * ticket types) and, on /e/:eventId/:sid, the seating plan of one session.
 */
import { ArrowLeft, CalendarDays, Clock, Eye, Info, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { tl, useI18n } from '../../lib/i18n';
import { sum } from '../../lib/format';
import { dateKey, dayMonth, fmtDate, fmtDT, hhmm, now, relDay, tkMs } from '../../lib/time';
import { uniq } from '../../lib/util';
import { useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { cityName, eventSessions, getEvent, getVenue, kindName, minPrice, parseSid, salesOpen, typeReq, unitInfo, unitStock, visibleTypes } from '../../domain/rules';
import { catsUsed } from '../../domain/scheme';
import type { EventItem, Hold, Session } from '../../domain/types';
import { Poster } from '../../components/common';
import { Badge, Button, cn, Empty, LinkButton, Notice } from '../../components/ui';
import { SchemeLegend, SchemeView } from '../../components/scheme/SchemeView';
import { SeatPicker } from '../../components/purchase/SeatPicker';
import { firstMuseumDate, MuseumCalendar, MuseumTypes, SlotList } from '../../components/purchase/MuseumPicker';
import { useNow } from '../../components/purchase/state';
import { PlanLoader } from '../../components/PlanLoader';

export default function LocalEventPage() {
  const { t3 } = useI18n();
  useDb();
  const { eventId, sid } = useParams();
  const orgId = useAuth((s) => s.orgId);
  const modId = useAuth((s) => s.modId);
  const ev = getEvent(eventId);
  const preview = !!ev && ev.status !== 'published' && ((!!orgId && ev.orgId === orgId) || !!modId);
  if (!ev || (ev.status !== 'published' && !preview))
    return (
      <Empty title={t3('Tadbir topilmadi', 'Мероприятие не найдено', 'Event not found')} className="min-h-[50vh]" action={<LinkButton to="/">{t3('Afishaga', 'В афишу', 'Back to listings')}</LinkButton>}>
        {t3('Ehtimol, u hali eʼlon qilinmagan yoki oʻtib ketgan.', 'Возможно, оно ещё не опубликовано или уже прошло.', 'It may not be published yet or may be over.')}
      </Empty>
    );
  if (sid && !parseSid(sid).museum) return <SessionBuy ev={ev} sid={sid} preview={preview} />;
  return <EventView ev={ev} preview={preview} initialSid={sid || null} />;
}

function PreviewBanner() {
  const { t3 } = useI18n();
  return (
    <Notice tone="warn" className="mb-5" title={<span className="inline-flex items-center gap-2"><Eye className="size-4" />{t3('Oldindan koʻrish', 'Предпросмотр', 'Preview')}</span>}>
      {t3('Sahifani xaridor eʼlon qilingandan keyin shunday koʻradi. Sotib olish oʻchirilgan.', 'Так страницу увидит покупатель после публикации. Покупка отключена.', 'This is how buyers will see the page once it is published. Buying is off.')}
    </Notice>
  );
}

function EventView({ ev, preview, initialSid }: { ev: EventItem; preview: boolean; initialSid: string | null }) {
  const { t3 } = useI18n();
  const venue = getVenue(ev.venueId);
  const desc = tl(ev.card.desc);
  const reqTypes = ev.kind === 'museum' || ev.kind === 'theatre' || ev.kind === 'cinema' ? visibleTypes(ev).filter((t) => typeReq(t)) : [];
  const from = minPrice(ev);
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 md:py-8 lg:px-5">
      {preview && <PreviewBanner />}
      <header className="grid gap-5 md:grid-cols-[minmax(0,340px)_1fr] md:gap-8">
        <div className="aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] md:aspect-[3/4]">
          <Poster card={ev.card} showTitle={false} />
        </div>
        <div className="flex min-w-0 flex-col justify-end gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{kindName(ev.kind)}</Badge>
            {ev.card.age && <Badge>{ev.card.age}</Badge>}
            {ev.card.duration > 0 && ev.kind !== 'museum' && (
              <Badge>
                <Clock className="size-3" />
                {t3('{n} daqiqa', '{n} мин', '{n} min', { n: ev.card.duration })}
              </Badge>
            )}
            {ev.card.lang && <Badge>{ev.card.lang}</Badge>}
          </div>
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight md:text-5xl" style={{ textWrap: 'balance' }}>
            {tl(ev.card.title)}
          </h1>
          {venue && (
            <div className="flex items-start gap-2 text-ink-2">
              <MapPin className="mt-0.5 size-5 shrink-0" />
              <span>
                <b className="text-ink">{venue.name}</b>, {cityName(venue.city)}, {venue.address}
                {venue.point && (
                  <>
                    {' · '}
                    <a className="underline" href={`https://maps.google.com/?q=${venue.point.lat},${venue.point.lng}`} target="_blank" rel="noopener noreferrer">
                      {t3('Xaritada', 'На карте', 'Map')} ↗
                    </a>
                  </>
                )}
              </span>
            </div>
          )}
          {from && <div className="text-lg font-bold">{t3('{p} dan', 'от {p}', 'from {p}', { p: sum(from) })}</div>}
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="min-w-0 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-6">
          {ev.kind === 'museum' ? <MuseumBlock ev={ev} preview={preview} initialSid={initialSid} /> : ev.kind === 'cinema' ? <CinemaSessions ev={ev} preview={preview} /> : <SessionList ev={ev} preview={preview} />}
        </section>
        <aside className="space-y-4 rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-6">
          <h2 className="text-xl font-bold">{t3('Tadbir haqida', 'О мероприятии', 'About')}</h2>
          {desc ? <p className="leading-relaxed whitespace-pre-line text-ink-2">{desc}</p> : <p className="text-ink-3">{t3('Tavsif keyinroq paydo boʻladi.', 'Описание появится позже.', 'The description will appear later.')}</p>}
          {reqTypes.length > 0 && (
            <div>
              <h3 className="font-bold">{t3('Imtiyozli chiptalar', 'Льготные билеты', 'Concession tickets')}</h3>
              <ul className="mt-2 space-y-1.5 text-[15px]">
                {reqTypes.map((t) => (
                  <li key={t.id}>
                    <b>{tl(t.name)}</b> — {typeReq(t)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-ink-3">{t3('Imtiyozni kirishda xodim tekshiradi.', 'Льготу проверяет сотрудник на входе.', 'Staff check concessions at the entrance.')}</p>
            </div>
          )}
          <p className="text-sm text-ink-3">{t3('Vaqt Toshkent vaqti boʻyicha (UTC+5).', 'Время указано по Ташкенту (UTC+5).', 'Times are Tashkent time (UTC+5).')}</p>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sessions: concert, sport, event, theatre

function SessionList({ ev, preview }: { ev: EventItem; preview: boolean }) {
  const { t3 } = useI18n();
  useNow(30_000);
  const [all, setAll] = useState(false);
  const ss = eventSessions(ev.id).filter((s) => s.startsAt > now());
  return (
    <>
      <h2 className="text-xl font-bold">{t3('Sana va vaqt', 'Даты и время', 'Dates and times')}</h2>
      {ss.length ? (
        <>
          <ul className="mt-3 divide-y divide-line">
            {(all ? ss : ss.slice(0, 12)).map((s) => (
              <SessionRow key={s.id} s={s} ev={ev} preview={preview} />
            ))}
          </ul>
          {ss.length > 12 && !all && (
            <Button variant="ghost" className="mt-2" onClick={() => setAll(true)}>
              {t3('Barcha sanalarni koʻrsatish ({n})', 'Показать все даты ({n})', 'Show all dates ({n})', { n: ss.length })}
            </Button>
          )}
        </>
      ) : (
        <p className="mt-3 text-ink-3">{t3('Kelgusi seanslar yoʻq.', 'Будущих сеансов нет.', 'No upcoming sessions.')}</p>
      )}
    </>
  );
}

function SessionRow({ s, ev, preview }: { s: Session; ev: EventItem; preview: boolean }) {
  const { t3 } = useI18n();
  const u = unitInfo(s.id);
  if (!u) return null;
  const open = salesOpen(u, 'online');
  const st = unitStock(u);
  const sold = st.free === 0;
  const pp = s.postponed?.length ? s.postponed[s.postponed.length - 1] : null;
  const dm = dayMonth(s.startsAt);
  const rel = relDay(dateKey(s.startsAt));
  const can = (open || preview) && !sold;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
      <div className="grid w-14 shrink-0 place-items-center rounded-2xl bg-page py-1.5 text-center leading-none">
        <span className="text-xl font-extrabold">{dm.day}</span>
        <span className="mt-0.5 text-xs text-ink-3 uppercase">{dm.month}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {rel ? `${rel}, ` : `${dm.dow}, `}
          <span className="tabular-nums">{hhmm(s.startsAt)}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-3">
          {u.hall && u.venue && u.venue.halls.length > 1 && <span>{u.hall.name}</span>}
          {s.doorsAt && <span>{t3('kirish {t} dan', 'вход с {t}', 'doors {t}', { t: hhmm(s.doorsAt) })}</span>}
          {pp && <Badge tone="warn">{t3('{d} dan koʻchirildi', 'Перенесено с {d}', 'Moved from {d}', { d: fmtDT(pp.from) })}</Badge>}
          {!sold && open && <span>{t3('{n} ta boʻsh', '{n} своб.', '{n} free', { n: st.free })}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {sold ? <Badge tone="bad">{t3('Sotib boʻlingan', 'Распродано', 'Sold out')}</Badge> : !open && !preview ? <Badge>{t3('Sotuv yopilgan', 'Продажи закрыты', 'Sales closed')}</Badge> : null}
        {can && (
          <LinkButton to={`/e/${ev.id}/${s.id}`} size="sm" variant={preview ? 'outline' : 'primary'}>
            {preview ? t3('Sxema', 'Схема', 'Plan') : t3('Joy tanlash', 'Выбрать места', 'Choose seats')}
          </LinkButton>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- cinema: by day, then by hall

function CinemaSessions({ ev, preview }: { ev: EventItem; preview: boolean }) {
  const { t3 } = useI18n();
  useNow(30_000);
  const venue = getVenue(ev.venueId);
  const ss = eventSessions(ev.id).filter((s) => s.startsAt > now());
  const days = uniq(ss.map((s) => dateKey(s.startsAt))).slice(0, 14);
  const [pick, setPick] = useState<string | null>(null);
  const day = pick && days.includes(pick) ? pick : days[0];
  const halls = venue ? [...venue.halls].sort((a, b) => a.order - b.order) : [];
  const dayS = ss.filter((s) => dateKey(s.startsAt) === day);
  const hallIds = uniq([...halls.map((h) => h.id), ...dayS.map((s) => s.hallId || '')]);
  return (
    <>
      <h2 className="text-xl font-bold">{t3('Seanslar', 'Сеансы', 'Showtimes')}</h2>
      {days.length ? (
        <>
          <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
            {days.map((dd) => {
              const dm = dayMonth(tkMs(dd, '12:00'));
              return (
                <button key={dd} type="button" role="tab" aria-selected={dd === day} onClick={() => setPick(dd)} className={cn('flex min-w-16 shrink-0 flex-col items-center rounded-2xl px-3 py-2 transition-colors', dd === day ? 'bg-brand' : 'bg-page hover:bg-black/5')}>
                  <b className="text-sm">{relDay(dd) || dm.dow}</b>
                  <span className="text-sm text-ink-2">
                    {dm.day} {dm.month}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-5">
            {hallIds.map((hid) => {
              const hs = dayS.filter((s) => (s.hallId || '') === hid);
              if (!hs.length) return null;
              const h = halls.find((x) => x.id === hid);
              return (
                <div key={hid}>
                  <h3 className="mb-2 font-bold">{h?.name || t3('Zal', 'Зал', 'Hall')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {hs.map((s) => (
                      <TimeChip key={s.id} s={s} ev={ev} preview={preview} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-3 text-ink-3">{t3('Kelgusi seanslar yoʻq.', 'Будущих сеансов нет.', 'No upcoming showtimes.')}</p>
      )}
    </>
  );
}

function TimeChip({ s, ev, preview }: { s: Session; ev: EventItem; preview: boolean }) {
  const { t3 } = useI18n();
  const u = unitInfo(s.id);
  const pmin = useMemo(() => {
    if (!u?.scheme) return Infinity;
    const cats = catsUsed(u.scheme);
    return Math.min(...visibleTypes(ev).flatMap((t) => cats.map((c) => (t.prices || {})[c.id] || Infinity)));
  }, [u?.scheme, ev]);
  if (!u) return null;
  const free = unitStock(u).free;
  const open = salesOpen(u, 'online') || preview;
  const ok = free > 0 && open;
  const body = (
    <>
      <b className="text-lg tabular-nums">{hhmm(s.startsAt)}</b>
      <span className="text-xs">{!free ? t3('Sotib boʻlingan', 'Распродано', 'Sold out') : !open ? t3('Sotuv yopilgan', 'Продажи закрыты', 'Sales closed') : isFinite(pmin) ? sum(pmin) : ''}</span>
    </>
  );
  return ok ? (
    <Link to={`/e/${ev.id}/${s.id}`} className="flex min-w-24 flex-col items-center rounded-2xl bg-white px-4 py-2 ring-1 ring-line-2 transition-colors hover:bg-brand hover:ring-brand">
      {body}
    </Link>
  ) : (
    <span className="flex min-w-24 cursor-not-allowed flex-col items-center rounded-2xl bg-black/[0.03] px-4 py-2 text-ink-3" aria-disabled>
      {body}
    </span>
  );
}

// ---------------------------------------------------------------- museum: date → slot → ticket types

function MuseumBlock({ ev, preview, initialSid }: { ev: EventItem; preview: boolean; initialSid: string | null }) {
  const { t3 } = useI18n();
  const nav = useNavigate();
  const clientId = useAuth((s) => s.clientId);
  const init = initialSid ? parseSid(initialSid) : null;
  const [date, setDate] = useState<string | null>(init && init.museum && init.evId === ev.id ? init.date : () => firstMuseumDate(ev));
  const [sid, setSid] = useState<string | null>(init && init.museum && init.evId === ev.id ? initialSid : null);
  const u = sid ? unitInfo(sid) : null;
  if (!ev.museum) return null;
  return (
    <>
      <h2 className="text-xl font-bold">{t3('Tashrif sanasi va vaqti', 'Дата и время посещения', 'Date and time of your visit')}</h2>
      <p className="mt-1 text-sm text-ink-3">{t3('Chipta faqat tanlangan slotda amal qiladi.', 'Билет действует только в выбранном слоте.', 'Your ticket is valid only in the slot you choose.')}</p>
      <div className="mt-4">
        <MuseumCalendar
          ev={ev}
          date={date}
          onDate={(d) => {
            setDate(d);
            setSid(null);
          }}
        />
      </div>
      {date && (
        <div className="mt-6">
          <h3 className="mb-3 flex items-center gap-2 font-bold">
            <CalendarDays className="size-5" />
            {relDay(date) ? `${relDay(date)}, ` : ''}
            {fmtDate(date)}
          </h3>
          <SlotList ev={ev} date={date} sid={sid} onSlot={setSid} />
        </div>
      )}
      {u && (
        <div className="mt-6">
          <h3 className="mb-1 font-bold">{t3('Chiptalar · {t}', 'Билеты · {t}', 'Tickets · {t}', { t: `${u.start}–${u.end}` })}</h3>
          {preview ? (
            <Notice tone="warn" className="mt-2">
              {t3('Oldindan koʻrishda sotib olib boʻlmaydi.', 'В предпросмотре покупка недоступна.', 'Buying is off in preview.')}
            </Notice>
          ) : (
            <MuseumTypes u={u} channel="online" holder={clientId} onHold={(h: Hold) => nav(`/checkout/${h.id}`)} />
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- one session: the seating plan

function SessionBuy({ ev, sid, preview }: { ev: EventItem; sid: string; preview: boolean }) {
  const { t3 } = useI18n();
  const nav = useNavigate();
  const clientId = useAuth((s) => s.clientId);
  useNow(15_000);
  const u = unitInfo(sid);
  if (!u || u.ev.id !== ev.id || !u.session)
    return (
      <Empty title={t3('Seans topilmadi', 'Сеанс не найден', 'Session not found')} className="min-h-[50vh]" action={<LinkButton to={`/e/${ev.id}`}>{tl(ev.card.title)}</LinkButton>} />
    );
  const open = salesOpen(u, 'online');
  const pp = u.session.postponed?.length ? u.session.postponed[u.session.postponed.length - 1] : null;
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-5 md:py-6 lg:px-5">
      {preview && <PreviewBanner />}
      <Link to={`/e/${ev.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" />
        {t3('Barcha seanslar', 'Все сеансы', 'All sessions')}
      </Link>
      <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight md:text-3xl">{tl(ev.card.title)}</h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <CalendarDays className="size-4" />
          {fmtDT(u.startsAt)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4" />
          {u.venue?.name}
          {u.hall && u.venue && u.venue.halls.length > 1 ? ` · ${u.hall.name}` : ''}
        </span>
        {pp && <Badge tone="warn">{t3('{d} dan koʻchirildi', 'Перенесено с {d}', 'Moved from {d}', { d: fmtDT(pp.from) })}</Badge>}
      </div>
      <div className="mt-5">
        {preview ? (
          <PlanLoader sid={u.sid}>{u.scheme && (
            <div className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)]">
              <SchemeView scheme={u.scheme} mode="preview" height="clamp(320px, 60vh, 560px)" />
              <div className="mt-3">
                <SchemeLegend scheme={u.scheme} />
              </div>
            </div>
          )}</PlanLoader>
        ) : !open ? (
          <Notice tone="neutral" title={t3('Sotuv yopilgan', 'Продажи закрыты', 'Sales are closed')} action={<LinkButton to={`/e/${ev.id}`} variant="outline" size="sm">{t3('Boshqa seans', 'Другой сеанс', 'Another session')}</LinkButton>}>
            <span className="inline-flex items-center gap-1.5">
              <Info className="size-4" />
              {t3('Bu seansga onlayn sotuv tugagan.', 'Онлайн-продажа на этот сеанс завершена.', 'Online sales for this session have ended.')}
            </span>
          </Notice>
        ) : (
          <PlanLoader sid={u.sid}>
            {u.scheme ? (
              <SeatPicker u={u} channel="online" holder={clientId} onHold={(h) => nav(`/checkout/${h.id}`)} />
            ) : (
              <Notice tone="warn">{t3('Zal sxemasi topilmadi.', 'Схема зала не найдена.', 'The seating plan was not found.')}</Notice>
            )}
          </PlanLoader>
        )}
      </div>
    </div>
  );
}
