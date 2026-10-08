/* Cinema: a week of showtimes, halls by rows and days by columns (US-16). Each showtime copies its hall plan at creation [Р1]. */
import { ChevronLeft, ChevronRight, Eye, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { addDays, dateKey, DOW_SHORT, dowOf, fmtDate, fmtDT, hhmm, now, tkMs, todayKey } from '../../lib/time';
import { byId, groupBy } from '../../lib/util';
import { tx, useDb } from '../../store/db';
import { addSession, CLEANING_MIN, evTitle, hallConflict, logAct, sessionSold, unitInfo, unitStock } from '../../domain/rules';
import { capacityOf } from '../../domain/scheme';
import type { EventItem, Session } from '../../domain/types';
import { SchemeView } from '../../components/scheme/SchemeView';
import { Button, cn, Field, IconButton, Input, Modal, Select, toast } from '../../components/ui';
import { fmtStampTk, sessEnd, timeErr } from './helpers';
import { DeleteSessionButton, pubConfirm, Section } from './ui';

export function CinemaSessions({ ev, ro }: { ev: EventItem; ro: boolean }) {
  const { t3, lang } = useI18n();
  const db = useDb();
  const venue = byId(db.venues, ev.venueId)!;
  const [wk, setWk] = useState(todayKey());
  const [open, setOpen] = useState<Session | null>(null);
  const [form, setForm] = useState({ hall: venue.halls[0]?.id || '', date: todayKey(), time: '', dur: String(ev.card.duration || 110) });
  const [err, setErr] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  const from = tkMs(days[0], '00:00');
  const to = tkMs(addDays(days[6], 1), '00:00');
  const hallIds = new Set(venue.halls.map((h) => h.id));
  const ss = db.sessions.filter((s) => s.hallId && hallIds.has(s.hallId) && s.startsAt >= from && s.startsAt < to).sort((a, b) => a.startsAt - b.startsAt);
  const by = groupBy(ss, (s) => s.hallId + '|' + dateKey(s.startsAt));
  const mineCount = ss.filter((s) => s.eventId === ev.id).length;
  const t = todayKey();

  const prefill = (hall: string, date: string) => {
    setForm((f) => ({ ...f, hall, date, time: '' }));
    setErr({});
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => timeRef.current?.focus({ preventScroll: true }), 300);
  };
  const add = async () => {
    const e: Record<string, string> = {};
    const hall = venue.halls.find((h) => h.id === form.hall);
    if (!hall) e.hall = t3('Zalni tanlang', 'Выберите зал', 'Choose a hall');
    if (!form.date) e.date = t3('Sanani kiriting', 'Укажите дату', 'Enter the date');
    const te = timeErr(form.time);
    if (te) e.time = te;
    const dur = parseInt(form.dur, 10);
    if (!(dur >= 1 && dur <= 600)) e.dur = t3('Davomiylikni kiriting', 'Укажите длительность', 'Enter the duration');
    let start = 0;
    if (!e.date && !te) {
      start = tkMs(form.date, form.time);
      if (start <= now()) e.time = t3('Vaqt oʻtib ketgan', 'Время уже прошло', 'This time has passed');
    }
    if (hall && !e.time && !e.dur && !e.date) {
      const cf = hallConflict(hall.id, start, dur);
      if (cf) {
        const other = byId(db.events, cf.eventId);
        e.time = t3(
          'Zal band: «{f}» {a}–{b}. Seanslar orasida {m} daqiqa tozalash kerak.',
          'Зал занят: «{f}» {a}–{b}. Между сеансами нужно {m} минут на уборку.',
          'The hall is busy: "{f}" {a}–{b}. Showtimes need {m} minutes for cleaning in between.',
          { f: other ? evTitle(other) : '—', a: fmtDT(cf.startsAt), b: hhmm(sessEnd(cf)), m: CLEANING_MIN },
        );
      }
    }
    if (hall && !db.schemes[hall.schemeId]) e.hall = t3('Zalda sxema yoʻq', 'У зала нет схемы', 'The hall has no seating plan');
    setErr(e);
    if (Object.keys(e).length || !hall) return;
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      addSession(d, x, start, { hallId: hall.id, duration: dur });
      logAct('session-add', evTitle(x), `${hall.name} · ${fmtStampTk(start)} · ${dur}′`);
    });
    toast(t3('Seans qoʻshildi: {h}, {w}', 'Сеанс добавлен: {h}, {w}', 'Showtime added: {h}, {w}', { h: hall.name, w: fmtDT(start) }), 'ok');
    setForm((f) => ({ ...f, time: '' }));
  };

  return (
    <div className="space-y-6">
      <Section
        title={
          <>
            {t3('Seanslar haftasi', 'Неделя сеансов', 'Week of showtimes')} <span className="text-ink-3">({mineCount})</span>
          </>
        }
        sub={t3('Zallar qatorlarda, kunlar ustunlarda. Shu film seanslari ajratilgan, boshqa filmlar — kulrang.', 'Залы по строкам, дни по столбцам. Сеансы этого фильма выделены, другие фильмы — серым.', 'Halls in rows, days in columns. This film’s showtimes are highlighted, other films are grey.')}
        actions={
          <div className="flex items-center gap-1">
            <IconButton label={t3('Oldingi hafta', 'Предыдущая неделя', 'Previous week')} onClick={() => setWk(addDays(wk, -7))}>
              <ChevronLeft className="size-5" />
            </IconButton>
            <Button variant="soft" size="sm" onClick={() => setWk(todayKey())}>
              {fmtDate(days[0], { weekday: false })} — {fmtDate(days[6], { weekday: false })}
            </Button>
            <IconButton label={t3('Keyingi hafta', 'Следующая неделя', 'Next week')} onClick={() => setWk(addDays(wk, 7))}>
              <ChevronRight className="size-5" />
            </IconButton>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32" />
                {days.map((d) => (
                  <th key={d} className={cn('px-1 pb-2 text-center font-medium', d === t ? 'text-ink' : 'text-ink-3')}>
                    <span className="block capitalize">{DOW_SHORT[lang][dowOf(d)]}</span>
                    <span className={cn('text-xs', d === t && 'rounded-full bg-brand px-2 py-0.5 font-bold')}>{fmtDate(d, { weekday: false })}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {venue.halls.map((h) => {
                const sc = db.schemes[h.schemeId];
                return (
                  <tr key={h.id} className="border-t border-line align-top">
                    <th className="py-2 pr-2 text-left">
                      <b className="block">{h.name}</b>
                      <span className="text-xs font-normal text-ink-3">{t3('{n} joy', '{n} мест', '{n} seats', { n: sc ? capacityOf(sc) : 0 })}</span>
                    </th>
                    {days.map((d) => {
                      const list = by[h.id + '|' + d] || [];
                      return (
                        <td key={d} className="px-1 py-2">
                          <div className="flex min-h-14 flex-col gap-1">
                            {list.map((s) => {
                              const mine = s.eventId === ev.id;
                              const past = s.startsAt <= now();
                              if (!mine) {
                                const o = byId(db.events, s.eventId);
                                return (
                                  <span key={s.id} title={`${o ? evTitle(o) : ''} · ${hhmm(s.startsAt)}–${hhmm(sessEnd(s))}`} className={cn('block truncate rounded-lg bg-black/5 px-2 py-1 text-xs text-ink-3', past && 'opacity-50')}>
                                    <b>{hhmm(s.startsAt)}</b> {o ? evTitle(o) : ''}
                                  </span>
                                );
                              }
                              const u = unitInfo(s.id);
                              return (
                                <button key={s.id} type="button" onClick={() => setOpen(s)} title={`${hhmm(s.startsAt)}–${hhmm(sessEnd(s))}`} className={cn('block rounded-lg bg-brand px-2 py-1 text-left text-xs hover:bg-brand-hover', past && 'opacity-50')}>
                                  <b className="block">{hhmm(s.startsAt)}</b>
                                  <span className="tabular-nums">
                                    {sessionSold(s.id)} / {u ? unitStock(u).total : 0}
                                  </span>
                                </button>
                              );
                            })}
                            {!ro && d >= t && (
                              <button type="button" onClick={() => prefill(h.id, d)} className="grid h-7 place-items-center rounded-lg border border-dashed border-line-2 text-ink-3 hover:border-ink hover:text-ink" aria-label={t3('Seans qoʻshish', 'Добавить сеанс', 'Add a showtime')}>
                                <Plus className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {!ro && (
        <div ref={formRef}>
          <Section
            title={t3('Seans qoʻshish', 'Добавить сеанс', 'Add a showtime')}
            sub={t3('Seans yaratilganda zal sxemasining nusxasini oladi. Bir zaldagi seanslar orasida {m} daqiqa tozalash kerak.', 'Сеанс получает копию схемы зала на момент создания. Между сеансами в одном зале нужно {m} минут на уборку.', 'A showtime gets a copy of the hall plan when created. Showtimes in one hall need {m} minutes for cleaning in between.', { m: CLEANING_MIN })}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t3('Zal', 'Зал', 'Hall')} required error={err.hall}>
                <Select value={form.hall} invalid={!!err.hall} onChange={(e) => setForm((f) => ({ ...f, hall: e.target.value }))}>
                  {venue.halls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t3('Sana', 'Дата', 'Date')} required error={err.date}>
                <Input type="date" min={t} value={form.date} invalid={!!err.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </Field>
              <Field label={t3('Vaqt', 'Время', 'Time')} required error={err.time}>
                <Input ref={timeRef} type="time" value={form.time} invalid={!!err.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
              </Field>
              <Field label={t3('Davomiyligi, daqiqa', 'Длительность, мин', 'Duration, min')} required error={err.dur} hint={t3('Film kartochkasidan', 'Из карточки фильма', 'From the film card')}>
                <Input type="number" min={1} max={600} value={form.dur} invalid={!!err.dur} onChange={(e) => setForm((f) => ({ ...f, dur: e.target.value }))} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={add}>
                <Plus className="size-4" />
                {t3('Seans qoʻshish', 'Добавить сеанс', 'Add the showtime')}
              </Button>
            </div>
          </Section>
        </div>
      )}
      {open && <ShowtimeModal ev={ev} s={open} ro={ro} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ShowtimeModal({ ev, s, ro, onClose }: { ev: EventItem; s: Session; ro: boolean; onClose: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const cur = byId(db.sessions, s.id);
  if (!cur) return null;
  const venue = byId(db.venues, ev.venueId);
  const hall = venue?.halls.find((h) => h.id === cur.hallId);
  const sc = cur.schemeId ? db.schemes[cur.schemeId] : undefined;
  const u = unitInfo(cur.id);
  const total = u ? unitStock(u).total : 0;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${hall?.name || ''} · ${fmtDT(cur.startsAt)}`}
      footer={
        <>
          {cur.startsAt > now() && <DeleteSessionButton s={cur} ro={ro} onDone={onClose} />}
          {ev.status === 'published' && (
            <Link to={`/e/${ev.id}/${cur.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-2 px-5 font-semibold hover:border-ink">
              <Eye className="size-4" />
              {t3('Xaridor qanday koʻradi', 'Как видит покупатель', 'Buyer view')}
            </Link>
          )}
          <Button onClick={onClose}>{t3('Yopish', 'Закрыть', 'Close')}</Button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
        <dt className="text-ink-3">{t3('Film', 'Фильм', 'Film')}</dt>
        <dd className="font-semibold">{evTitle(ev)}</dd>
        <dt className="text-ink-3">{t3('Vaqt', 'Время', 'Time')}</dt>
        <dd>
          {hhmm(cur.startsAt)}–{hhmm(sessEnd(cur))} ({cur.duration}′)
        </dd>
        <dt className="text-ink-3">{t3('Sotilgan', 'Продано', 'Sold')}</dt>
        <dd>
          {sessionSold(cur.id)} / {total}
        </dd>
        <dt className="text-ink-3">{t3('Sxema', 'Схема', 'Plan')}</dt>
        <dd>{t3('{d} dagi zal nusxasi', 'копия зала от {d}', 'hall copy from {d}', { d: fmtStampTk(cur.createdAt) })}</dd>
      </dl>
      {sc && (
        <div className="mt-4">
          <SchemeView scheme={sc} mode="preview" height={320} />
        </div>
      )}
    </Modal>
  );
}
