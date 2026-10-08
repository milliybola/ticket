/* Theatre: weekly schedule with a preview of the dates (US-14), one-off sessions, single session edit and delete (US-20). */
import { AlertTriangle, ArrowLeft, Clock, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { addDays, dateKey, DOW_SHORT, dowOf, fmtDate, fmtDT, hhmm, now, tkMs, todayKey } from '../../lib/time';
import { byId, uid } from '../../lib/util';
import { tx, useDb } from '../../store/db';
import { addSession, eventSessions, evTitle, logAct, sessionSold } from '../../domain/rules';
import type { EventItem, Schedule, Session } from '../../domain/types';
import { Badge, Button, Checkbox, cn, Field, Input, Modal, toast } from '../../components/ui';
import { dateErr, daysText, DOW_ORDER, fmtStampTk, hallOverlaps, maxScheduleEnd, moveSessionStart, overlapText, timeErr } from './helpers';
import { confirmBox, DeleteSessionButton, infoBox, pubConfirm, Section, SoldCell } from './ui';

const hallIdOf = (ev: EventItem, db: ReturnType<typeof useDb>) => ev.hallId || byId(db.venues, ev.venueId)?.halls[0]?.id || null;

export function TheatreSessions({ ev, ro }: { ev: EventItem; ro: boolean }) {
  const { t3 } = useI18n();
  const db = useDb();
  const all = eventSessions(ev.id);
  const fut = all.filter((s) => s.startsAt > now());
  const past = all.filter((s) => s.startsAt <= now());
  const [builder, setBuilder] = useState(false);
  const [one, setOne] = useState(false);
  const [editTime, setEditTime] = useState<Schedule | null>(null);
  const [edit, setEdit] = useState<Session | null>(null);
  const venue = byId(db.venues, ev.venueId);
  const multi = (venue?.halls.length || 0) > 1;

  const table = (list: Session[], isPast: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-line text-sm text-ink-3">
            <th className="py-2 pr-3 font-medium">{t3('Sana', 'Дата', 'Date')}</th>
            <th className="py-2 pr-3 font-medium">{t3('Vaqt', 'Время', 'Time')}</th>
            {multi && <th className="py-2 pr-3 font-medium">{t3('Zal', 'Зал', 'Hall')}</th>}
            <th className="py-2 pr-3 font-medium" />
            <th className="py-2 pr-3 font-medium">{t3('Sotilgan', 'Продано', 'Sold')}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const ov = isPast ? [] : hallOverlaps(s.hallId, s.startsAt, s.duration, s.id).filter((x) => x.eventId !== ev.id);
            return (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3">
                  <b>{fmtDate(s.startsAt)}</b>
                </td>
                <td className="py-2.5 pr-3">
                  {hhmm(s.startsAt)}
                  {ov.length > 0 && (
                    <span className="ml-1 inline-flex align-middle text-warn" title={t3('Zalda kesishuv: {c}', 'Пересечение в зале: {c}', 'Hall overlap: {c}', { c: overlapText(ov) })}>
                      <AlertTriangle className="size-4" />
                    </span>
                  )}
                </td>
                {multi && <td className="py-2.5 pr-3">{venue?.halls.find((h) => h.id === s.hallId)?.name || '—'}</td>}
                <td className="py-2.5 pr-3">{s.scheduleId ? <Badge tone="info">{t3('Jadval boʻyicha', 'По расписанию', 'Scheduled')}</Badge> : <Badge>{t3('Bir martalik', 'Разовый', 'One-off')}</Badge>}</td>
                <td className="py-2.5 pr-3">
                  <SoldCell sid={s.id} />
                </td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  {!isPast && !ro && !sessionSold(s.id) && (
                    <Button variant="ghost" size="sm" onClick={() => setEdit(s)}>
                      <Pencil className="size-4" />
                      <span className="hidden sm:inline">{t3('Oʻzgartirish', 'Изменить', 'Edit')}</span>
                    </Button>
                  )}
                  {!isPast && <DeleteSessionButton s={s} ro={ro} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <Section
        title={t3('Jadval', 'Расписание', 'Schedule')}
        sub={t3('Masalan: har chorshanba 19:00 da mavsum oxirigacha.', 'Например: каждую среду в 19:00 до конца сезона.', 'For example: every Wednesday at 19:00 until the end of the season.')}
        actions={
          !ro && !builder ? (
            <Button variant="outline" size="sm" onClick={() => setBuilder(true)}>
              <Plus className="size-4" />
              {t3('Jadval qoʻshish', 'Добавить расписание', 'Add a schedule')}
            </Button>
          ) : undefined
        }
      >
        {ev.schedules.length > 0 && (
          <ul className="divide-y divide-line">
            {ev.schedules.map((sc) => {
              const ss = fut.filter((s) => s.scheduleId === sc.id);
              const withSales = ss.filter((s) => sessionSold(s.id)).length;
              return (
                <li key={sc.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <b>
                      {t3('Har hafta', 'Каждую неделю', 'Weekly')}: {daysText(sc.days)} · {sc.time}
                    </b>
                    <div className="text-sm text-ink-3">
                      {fmtDate(sc.from, { weekday: false })} — {fmtDate(sc.to, { weekday: false, year: true })} · {t3('kelgusi seanslar: {n}', 'будущих сеансов: {n}', 'upcoming: {n}', { n: ss.length })}
                      {withSales > 0 && ` · ${t3('sotuvi bor: {n}', 'с продажами: {n}', 'with sales: {n}', { n: withSales })}`}
                      {sc.excluded.length > 0 && ` · ${t3('olib tashlangan sanalar: {n}', 'исключено дат: {n}', 'dates excluded: {n}', { n: sc.excluded.length })}`}
                    </div>
                  </div>
                  {!ro && ss.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setEditTime(sc)}>
                      <Clock className="size-4" />
                      {t3('Vaqtni oʻzgartirish', 'Изменить время', 'Change the time')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!ev.schedules.length && !builder && <p className="text-ink-3">{t3('Hozircha jadval yoʻq.', 'Расписания пока нет.', 'No schedule yet.')}</p>}
        {builder && !ro && <ScheduleBuilder ev={ev} onClose={() => setBuilder(false)} />}
      </Section>

      <Section
        title={
          <>
            {t3('Seanslar', 'Сеансы', 'Sessions')} <span className="text-ink-3">({fut.length})</span>
          </>
        }
        actions={
          !ro && !one ? (
            <Button variant="outline" size="sm" onClick={() => setOne(true)}>
              <Plus className="size-4" />
              {t3('Bir martalik seans', 'Разовый сеанс', 'One-off session')}
            </Button>
          ) : undefined
        }
      >
        {one && !ro && <OneOff ev={ev} onClose={() => setOne(false)} />}
        {fut.length ? table(fut, false) : <p className="text-ink-3">{t3('Kelgusi seanslar yoʻq. Jadval yoki bir martalik seans qoʻshing.', 'Будущих сеансов нет. Добавьте расписание или разовый сеанс.', 'No upcoming sessions. Add a schedule or a one-off session.')}</p>}
        {past.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-ink-3">
              {t3('Oʻtganlar', 'Прошедшие', 'Past')} ({past.length})
            </summary>
            <div className="mt-2">{table(past, true)}</div>
          </details>
        )}
      </Section>
      {editTime && <ScheduleTimeModal ev={ev} sc={editTime} onClose={() => setEditTime(null)} />}
      {edit && <EditSessionModal ev={ev} s={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

type PreviewItem = { date: string; exists: boolean; conflict: string };

function ScheduleBuilder({ ev, onClose }: { ev: EventItem; onClose: () => void }) {
  const { t3, lang } = useI18n();
  const db = useDb();
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState('19:00');
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(addDays(todayKey(), 90));
  const [err, setErr] = useState<Record<string, string>>({});
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const hallId = hallIdOf(ev, db);
  const dur = ev.card.duration || 120;

  const preview = () => {
    const e: Record<string, string> = {};
    if (!days.length) e.days = t3('Hafta kunlarini tanlang', 'Выберите дни недели', 'Choose the days of the week');
    const te = timeErr(time);
    if (te) e.time = te;
    const fe = dateErr(from);
    if (fe) e.from = fe;
    if (!to) e.to = t3('Sanani kiriting', 'Укажите дату', 'Enter the date');
    else if (!fe && to < from) e.to = t3('Tugash boshlanishdan oldin', 'Окончание раньше начала', 'The last date is before the first');
    else if (!fe && to > maxScheduleEnd(from)) e.to = t3('Bir yildan oshmasin', 'Не больше года', 'No more than a year');
    if (!Object.keys(e).length) {
      const mine = eventSessions(ev.id);
      const list: PreviewItem[] = [];
      for (let x = from; x <= to; x = addDays(x, 1)) {
        if (!days.includes(dowOf(x))) continue;
        const start = tkMs(x, time);
        if (start <= now()) continue;
        const exists = mine.some((s) => s.startsAt === start);
        const cf = exists ? [] : hallOverlaps(hallId, start, dur);
        list.push({ date: x, exists, conflict: cf.length ? overlapText(cf) : '' });
      }
      if (!list.length) e.days = t3('Bu davrda tanlangan hafta kunlari yoʻq', 'В этот период нет выбранных дней недели', 'None of the chosen weekdays fall in this period');
      else {
        setItems(list);
        setOff(new Set());
      }
    }
    setErr(e);
  };
  const create = async () => {
    if (!items) return;
    const chosen = items.filter((x) => !x.exists && !off.has(x.date)).map((x) => x.date);
    if (!chosen.length) {
      toast(t3('Kamida bitta sanani belgilang', 'Отметьте хотя бы одну дату', 'Tick at least one date'), 'bad');
      return;
    }
    if (!(await pubConfirm(ev))) return;
    const n = tx((d) => {
      const x = byId(d.events, ev.id)!;
      const sc: Schedule = { id: uid('sc'), days: [...days].sort(), time, from, to, excluded: items.filter((i) => !i.exists && off.has(i.date)).map((i) => i.date), hallId: hallId || undefined };
      x.schedules.push(sc);
      let k = 0;
      for (const date of chosen) {
        const start = tkMs(date, time);
        if (start <= now() || d.sessions.some((s) => s.eventId === x.id && s.startsAt === start)) continue;
        addSession(d, x, start, { scheduleId: sc.id });
        k++;
      }
      logAct('schedule-create', evTitle(x), `${daysText(sc.days)} ${sc.time}, ${sc.from} — ${sc.to}: ${k}`);
      return k;
    });
    toast(t3('Yaratilgan seanslar: {n}', 'Создано сеансов: {n}', 'Sessions created: {n}', { n }), 'ok');
    onClose();
  };

  if (items) {
    const nNew = items.filter((x) => !x.exists && !off.has(x.date)).length;
    return (
      <div className="mt-4 rounded-2xl border border-line p-4">
        <h3 className="font-semibold">
          {t3('{n} ta seans boʻladi', 'Получится сеансов: {n}', '{n} sessions', { n: nNew })}: {daysText(days)} · {time}
        </h3>
        <p className="mt-1 text-sm text-ink-3">
          {t3(
            'Spektakl boʻlmaydigan sanalardan belgini olib tashlang. Shu zaldagi boshqa spektakllar bilan kesishuvlar belgilangan — ularni baribir saqlash mumkin.',
            'Снимите галочку с дат, когда спектакля не будет. Пересечения с другими спектаклями в этом зале отмечены — их можно сохранить всё равно.',
            'Untick the dates without a show. Overlaps with other shows in this hall are marked; you can still keep them.',
          )}
        </p>
        <ul className="mt-3 grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {items.map((x) => (
            <li key={x.date} className={cn('rounded-lg px-2 py-1.5', x.conflict && 'bg-warn-soft', x.exists && 'opacity-50')}>
              <Checkbox
                checked={!x.exists && !off.has(x.date)}
                disabled={x.exists}
                onChange={(v) =>
                  setOff((o) => {
                    const n = new Set(o);
                    if (v) n.delete(x.date);
                    else n.add(x.date);
                    return n;
                  })
                }
                label={
                  <span>
                    <b>{fmtDate(x.date, { weekday: true })}</b>
                    {x.exists && <span className="block text-xs text-ink-3">{t3('Seans allaqachon bor', 'Сеанс уже есть', 'Already exists')}</span>}
                    {x.conflict && (
                      <span className="block text-xs text-warn">
                        {t3('Kesishuv', 'Пересечение', 'Overlap')}: {x.conflict}
                      </span>
                    )}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setItems(null)}>
            <ArrowLeft className="size-4" />
            {t3('Jadvalni oʻzgartirish', 'Изменить расписание', 'Change the schedule')}
          </Button>
          <Button onClick={create}>{t3('Seanslarni yaratish', 'Создать сеансы', 'Create the sessions')}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-2xl border border-line p-4">
      <h3 className="mb-3 font-semibold">{t3('Yangi jadval', 'Новое расписание', 'New schedule')}</h3>
      <div className="mb-1.5 text-sm font-medium text-ink-2">
        {t3('Hafta kunlari', 'Дни недели', 'Days of the week')}
        <span className="text-bad"> *</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {DOW_ORDER.map((x) => {
          const on = days.includes(x);
          return (
            <button
              key={x}
              type="button"
              aria-pressed={on}
              onClick={() => setDays((d) => (on ? d.filter((y) => y !== x) : [...d, x]))}
              className={cn('h-10 min-w-12 rounded-xl border px-3 font-semibold capitalize', on ? 'border-ink bg-ink text-white' : 'border-line-2 bg-white text-ink hover:border-ink')}
            >
              {DOW_SHORT[lang][x]}
            </button>
          );
        })}
      </div>
      {err.days && <span className="mt-1 block text-sm text-bad">{err.days}</span>}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label={t3('Boshlanish vaqti', 'Время начала', 'Start time')} required error={err.time}>
          <Input type="time" value={time} invalid={!!err.time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={t3('Boshlanish sanasi', 'Дата начала', 'First date')} required error={err.from}>
          <Input type="date" min={todayKey()} value={from} invalid={!!err.from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t3('Tugash sanasi', 'Дата окончания', 'Last date')} required error={err.to} hint={t3('Bir yildan oshmasin', 'Не больше года', 'Up to a year')}>
          <Input type="date" min={from || todayKey()} max={from ? maxScheduleEnd(from) : undefined} value={to} invalid={!!err.to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t3('Bekor qilish', 'Отмена', 'Cancel')}
        </Button>
        <Button onClick={preview}>{t3('Sanalarni koʻrsatish', 'Показать даты', 'Show the dates')}</Button>
      </div>
    </div>
  );
}

function OneOff({ ev, onClose }: { ev: EventItem; onClose: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [err, setErr] = useState<Record<string, string>>({});
  const add = async () => {
    const e: Record<string, string> = {};
    const de = dateErr(date);
    const te = timeErr(time);
    if (de) e.date = de;
    if (te) e.time = te;
    let start = 0;
    if (!de && !te) {
      start = tkMs(date, time);
      if (start <= now()) e.time = t3('Vaqt oʻtib ketgan', 'Время уже прошло', 'This time has passed');
    }
    setErr(e);
    if (Object.keys(e).length) return;
    const cf = hallOverlaps(hallIdOf(ev, db), start, ev.card.duration || 120);
    if (cf.length) {
      const ok = await confirmBox({
        title: t3('Zalda kesishuv', 'Пересечение в зале', 'Hall overlap'),
        text: t3('Bu vaqtda zalda: {c}. Baribir qoʻshilsinmi?', 'В это время в зале: {c}. Всё равно добавить?', 'The hall is busy at this time: {c}. Add anyway?', { c: overlapText(cf) }),
        ok: t3('Qoʻshish', 'Добавить', 'Add'),
      });
      if (!ok) return;
    }
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      addSession(d, x, start);
      logAct('session-add', evTitle(x), fmtStampTk(start));
    });
    toast(t3('Seans qoʻshildi: {w}', 'Сеанс добавлен: {w}', 'Session added: {w}', { w: fmtDT(start) }), 'ok');
    onClose();
  };
  return (
    <div className="mb-4 grid gap-4 rounded-2xl border border-line p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
      <Field label={t3('Sana', 'Дата', 'Date')} required error={err.date}>
        <Input type="date" min={todayKey()} value={date} invalid={!!err.date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label={t3('Boshlanish vaqti', 'Время начала', 'Start time')} required error={err.time}>
        <Input type="time" value={time} invalid={!!err.time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <div className="flex gap-2 sm:pt-7">
        <Button onClick={add}>{t3('Qoʻshish', 'Добавить', 'Add')}</Button>
        <Button variant="ghost" onClick={onClose}>
          {t3('Bekor qilish', 'Отмена', 'Cancel')}
        </Button>
      </div>
    </div>
  );
}

/** Changing the time of a whole schedule moves only future sessions without sales (US-14 rule 3). */
function ScheduleTimeModal({ ev, sc, onClose }: { ev: EventItem; sc: Schedule; onClose: () => void }) {
  const { t3 } = useI18n();
  const [time, setTime] = useState(sc.time);
  const [err, setErr] = useState('');
  const ss = eventSessions(ev.id).filter((s) => s.scheduleId === sc.id && s.startsAt > now());
  const sold = ss.filter((s) => sessionSold(s.id));
  const save = async () => {
    const te = timeErr(time);
    setErr(te);
    if (te) return;
    if (time === sc.time) {
      onClose();
      return;
    }
    if (!(await pubConfirm(ev))) return;
    const res = tx((d) => {
      const x = byId(d.events, ev.id)!;
      const s0 = x.schedules.find((y) => y.id === sc.id)!;
      const changed: number[] = [];
      const kept: number[] = [];
      for (const s of d.sessions.filter((y) => y.eventId === x.id && y.scheduleId === sc.id && y.startsAt > now())) {
        const ns = tkMs(dateKey(s.startsAt), time);
        if (sessionSold(s.id) || ns <= now()) {
          kept.push(s.startsAt);
          continue;
        }
        moveSessionStart(s, ns);
        changed.push(ns);
      }
      const old = s0.time;
      s0.time = time;
      logAct('schedule-update', evTitle(x), `${daysText(s0.days)}: ${old} → ${time}; ${t3('oʻzgardi {n}, oʻzgarmadi (sotuv bor) {m}', 'изменено {n}, без изменений (есть продажи) {m}', 'changed {n}, unchanged (sales) {m}', { n: changed.length, m: kept.length })}`);
      return { changed, kept: kept.sort((a, b) => a - b) };
    });
    onClose();
    infoBox(
      t3('Vaqt oʻzgartirildi', 'Время изменено', 'Time changed'),
      <>
        <p>{t3('Oʻzgartirilgan seanslar: {n}. Yangi vaqt — {t}.', 'Изменено сеансов: {n}. Новое время — {t}.', 'Sessions changed: {n}. New time: {t}.', { n: res.changed.length, t: time })}</p>
        {res.kept.length > 0 && (
          <>
            <h4 className="mt-3 font-semibold">{t3('Oʻzgarmadi — sotuvlar bor', 'Не изменены — есть продажи', 'Not changed: tickets sold')}</h4>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {res.kept.map((ms) => (
                <li key={ms}>{fmtDT(ms)}</li>
              ))}
            </ul>
          </>
        )}
      </>,
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t3('Jadval vaqti', 'Время расписания', 'Schedule time')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t3('Bekor qilish', 'Отмена', 'Cancel')}
          </Button>
          <Button onClick={save}>{t3('Oʻzgartirish', 'Изменить', 'Change')}</Button>
        </>
      }
    >
      <p className="mb-3">
        {daysText(sc.days)} · {t3('hozir {t} da', 'сейчас в {t}', 'now at {t}', { t: sc.time })}
      </p>
      <Field label={t3('Yangi boshlanish vaqti', 'Новое время начала', 'New start time')} required error={err}>
        <Input type="time" value={time} invalid={!!err} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <p className="mt-3 text-sm text-ink-3">
        {t3('Sotuvsiz kelgusi seanslar oʻzgaradi: {n}.', 'Изменятся будущие сеансы без продаж: {n}.', 'Upcoming sessions without sales will change: {n}.', { n: ss.length - sold.length })}{' '}
        {sold.length > 0 && t3('Sotuvi bor {n} ta seans oʻzgarmaydi.', 'Сеансы с продажами ({n}) не изменятся.', '{n} sessions with sales stay as they are.', { n: sold.length })}
      </p>
    </Modal>
  );
}

function EditSessionModal({ ev, s, onClose }: { ev: EventItem; s: Session; onClose: () => void }) {
  const { t3 } = useI18n();
  const [date, setDate] = useState(dateKey(s.startsAt));
  const [time, setTime] = useState(hhmm(s.startsAt));
  const [err, setErr] = useState<Record<string, string>>({});
  const save = async () => {
    const e: Record<string, string> = {};
    const de = dateErr(date);
    const te = timeErr(time);
    if (de) e.date = de;
    if (te) e.time = te;
    let start = 0;
    if (!de && !te) {
      start = tkMs(date, time);
      if (start <= now()) e.time = t3('Vaqt oʻtib ketgan', 'Время уже прошло', 'This time has passed');
    }
    setErr(e);
    if (Object.keys(e).length) return;
    if (start === s.startsAt) {
      onClose();
      return;
    }
    const cf = hallOverlaps(s.hallId, start, s.duration || ev.card.duration || 120, s.id);
    if (cf.length) {
      const ok = await confirmBox({
        title: t3('Zalda kesishuv', 'Пересечение в зале', 'Hall overlap'),
        text: t3('Bu vaqtda zalda: {c}. Baribir saqlansinmi?', 'В это время в зале: {c}. Всё равно сохранить?', 'The hall is busy at this time: {c}. Save anyway?', { c: overlapText(cf) }),
        ok: t3('Saqlash', 'Сохранить', 'Save'),
      });
      if (!ok) return;
    }
    if (!(await pubConfirm(ev))) return;
    const ok = tx((d) => {
      const cur = byId(d.sessions, s.id);
      if (!cur || sessionSold(cur.id)) return false;
      const from = cur.startsAt;
      moveSessionStart(cur, start);
      logAct('session-update', evTitle(ev), `${fmtStampTk(from)} → ${fmtStampTk(start)}`);
      return true;
    });
    toast(ok ? t3('Seans oʻzgartirildi', 'Сеанс изменён', 'Session updated') : t3('Seansga chipta sotib olingan — oʻzgartirib boʻlmaydi', 'На сеанс уже купили билеты — изменить нельзя', 'Tickets were bought for this session: it can’t be changed'), ok ? 'ok' : 'bad');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t3('Seansni oʻzgartirish', 'Изменить сеанс', 'Edit the session')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t3('Bekor qilish', 'Отмена', 'Cancel')}
          </Button>
          <Button onClick={save}>{t3('Saqlash', 'Сохранить', 'Save')}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-3">{t3('Faqat shu seans oʻzgaradi, jadvalning boshqa seanslari oʻzgarmaydi.', 'Меняется только этот сеанс, остальные сеансы расписания остаются прежними.', 'Only this session changes; the rest of the schedule stays as it is.')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t3('Sana', 'Дата', 'Date')} required error={err.date}>
          <Input type="date" min={todayKey()} value={date} invalid={!!err.date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t3('Boshlanish vaqti', 'Время начала', 'Start time')} required error={err.time}>
          <Input type="time" value={time} invalid={!!err.time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
