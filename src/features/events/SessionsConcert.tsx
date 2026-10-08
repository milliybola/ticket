/* Concert, sport, event: one-off dates (US-13), postponement with buyer notifications (US-39, US-40), delete without sales (US-20). */
import { CalendarClock, Plus } from 'lucide-react';
import { useState } from 'react';
import { plw, useI18n } from '../../lib/i18n';
import { dateKey, fmtDT, hhmm, now, tkMs, todayKey } from '../../lib/time';
import { byId } from '../../lib/util';
import { tx, useDb } from '../../store/db';
import { addSession, eventSessions, evTitle, KIND, logAct, postponeSession, sessionSold } from '../../domain/rules';
import type { EventItem, Session } from '../../domain/types';
import { Badge, Button, Field, Input, Modal, Textarea, toast } from '../../components/ui';
import { dateErr, fmtStampTk, ordersOf, parseLocalDT, timeErr } from './helpers';
import { confirmBox, DeleteSessionButton, infoBox, pubConfirm, Section, SoldCell } from './ui';

const nBuyers = (n: number) => `${n} ${plw(n, 'xaridor', ['покупателя', 'покупателей', 'покупателей'], ['buyer', 'buyers'])}`;

export function ConcertSessions({ ev, ro }: { ev: EventItem; ro: boolean }) {
  const { t3 } = useI18n();
  useDb();
  const all = eventSessions(ev.id);
  const fut = all.filter((s) => s.startsAt > now());
  const past = all.filter((s) => s.startsAt <= now());
  const [moving, setMoving] = useState<Session | null>(null);
  const canMove = KIND[ev.kind].postpone;

  const table = (list: Session[], isPast: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-line text-sm text-ink-3">
            <th className="py-2 pr-3 font-medium">{t3('Sana va vaqt', 'Дата и время', 'Date and time')}</th>
            <th className="py-2 pr-3 font-medium">{t3('Kirish', 'Вход', 'Doors')}</th>
            <th className="py-2 pr-3 font-medium">{t3('Sotuv tugashi', 'Продажи до', 'Sales until')}</th>
            <th className="py-2 pr-3 font-medium">{t3('Sotilgan', 'Продано', 'Sold')}</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id} className="border-b border-line align-top last:border-0">
              <td className="py-3 pr-3">
                <b>{fmtDT(s.startsAt)}</b>
                {s.postponed.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {s.postponed
                      .slice()
                      .reverse()
                      .map((p, i) => (
                        <li key={i} className="text-xs text-ink-3">
                          <Badge tone="warn" className="mr-1">
                            {t3('Koʻchirildi', 'Перенесено', 'Moved')}
                          </Badge>
                          {fmtStampTk(p.from)} → {fmtStampTk(p.to)}
                          {p.reason && ` · «${p.reason}»`}
                          {' · '}
                          {t3('xabar: {n}', 'уведомлено: {n}', 'notified: {n}', { n: p.notified })}
                          {p.failed > 0 && `, ${t3('yetkazilmadi: {n}', 'не доставлено: {n}', 'failed: {n}', { n: p.failed })}`}
                        </li>
                      ))}
                  </ul>
                )}
              </td>
              <td className="py-3 pr-3">{s.doorsAt ? hhmm(s.doorsAt) : '—'}</td>
              <td className="py-3 pr-3 text-sm">{s.salesUntil ? fmtDT(s.salesUntil) : t3('boshlanishigacha', 'до начала', 'until the start')}</td>
              <td className="py-3 pr-3">
                <SoldCell sid={s.id} />
              </td>
              <td className="py-3 text-right whitespace-nowrap">
                {!isPast && !ro && canMove && (
                  <Button variant="outline" size="sm" onClick={() => setMoving(s)}>
                    <CalendarClock className="size-4" />
                    {t3('Koʻchirish', 'Перенести', 'Postpone')}
                  </Button>
                )}{' '}
                {!isPast && <DeleteSessionButton s={s} ro={ro} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <Section
        title={t3('Sanalar', 'Даты', 'Dates')}
        sub={t3(
          'Har bir sanada tadbir sxemasi nusxasi boʻyicha oʻz joylar qoldigʻi bor. «Sotuv tugashi»da sayt va kassa sotuvni oʻzi yopadi.',
          'У каждой даты свой остаток мест по копии схемы мероприятия. В «Продажи до» сайт и касса закрывают продажу сами.',
          'Each date has its own stock from the event’s plan copy. At "Sales until" the site and the box office stop selling.',
        )}
      >
        {fut.length ? table(fut, false) : <p className="text-ink-3">{t3('Hozircha kelgusi sanalar yoʻq.', 'Будущих дат пока нет.', 'No upcoming dates yet.')}</p>}
        {past.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-ink-3">
              {t3('Oʻtganlar', 'Прошедшие', 'Past')} ({past.length})
            </summary>
            <div className="mt-2">{table(past, true)}</div>
          </details>
        )}
      </Section>
      {!ro && <AddDate ev={ev} />}
      {moving && <PostponeModal s={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}

function AddDate({ ev }: { ev: EventItem }) {
  const { t3 } = useI18n();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [doors, setDoors] = useState('');
  const [until, setUntil] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const add = async () => {
    const e: Record<string, string> = {};
    const de = dateErr(date);
    const te = timeErr(time);
    if (de) e.date = de;
    if (te) e.time = te;
    let start = 0;
    let doorsAt: number | null = null;
    let salesUntil: number | null = null;
    if (!de && !te) {
      start = tkMs(date, time);
      if (start <= now()) e.time = t3('Vaqt oʻtib ketgan', 'Время уже прошло', 'This time has passed');
      if (doors) {
        doorsAt = tkMs(date, doors);
        if (doorsAt >= start) e.doors = t3('Kirish boshlanishdan oldin ochiladi', 'Вход открывается до начала', 'Doors must open before the start');
      }
      if (until) {
        salesUntil = parseLocalDT(until);
        if (salesUntil == null) e.until = t3('Sana va vaqtni kiriting', 'Укажите дату и время', 'Enter a date and time');
        else if (salesUntil > start) e.until = t3('Sotuv boshlanishdan kechikmay yopiladi', 'Продажи закрываются не позже начала', 'Sales must close by the start');
        else if (salesUntil <= now()) e.until = t3('Vaqt oʻtib ketgan', 'Время уже прошло', 'This time has passed');
      }
    }
    setErr(e);
    if (Object.keys(e).length) return;
    if (eventSessions(ev.id).some((s) => s.startsAt === start)) {
      const ok = await confirmBox({
        title: t3('Bu sana allaqachon bor', 'Такая дата уже есть', 'This date already exists'),
        text: t3('{w} seansi roʻyxatda bor. Baribir yana bittasini qoʻshasizmi?', 'Сеанс {w} уже есть в списке. Всё равно добавить ещё один?', 'A session on {w} is already listed. Add another one anyway?', { w: fmtDT(start) }),
        ok: t3('Qoʻshish', 'Добавить', 'Add'),
      });
      if (!ok) return;
    }
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      addSession(d, x, start, { doorsAt, salesUntil });
      logAct('session-add', evTitle(x), fmtStampTk(start));
    });
    toast(t3('Sana qoʻshildi: {w}', 'Дата добавлена: {w}', 'Date added: {w}', { w: fmtDT(start) }), 'ok');
    setDate('');
    setDoors('');
    setUntil('');
  };
  return (
    <Section title={t3('Sana qoʻshish', 'Добавить дату', 'Add a date')}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t3('Sana', 'Дата', 'Date')} required error={err.date}>
          <Input type="date" min={todayKey()} value={date} invalid={!!err.date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t3('Boshlanish vaqti', 'Время начала', 'Start time')} required error={err.time}>
          <Input type="time" value={time} invalid={!!err.time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={t3('Kirish ochilishi', 'Открытие входа', 'Doors open')} error={err.doors}>
          <Input type="time" value={doors} invalid={!!err.doors} onChange={(e) => setDoors(e.target.value)} />
        </Field>
        <Field label={t3('Sotuv tugashi', 'Продажи до', 'Sales until')} error={err.until} hint={t3('Boʻsh — boshlanishigacha', 'Пусто — до начала', 'Empty: until the start')}>
          <Input type="datetime-local" value={until} invalid={!!err.until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={add}>
          <Plus className="size-4" />
          {t3('Sana qoʻshish', 'Добавить дату', 'Add the date')}
        </Button>
      </div>
    </Section>
  );
}

function PostponeModal({ s, onClose }: { s: Session; onClose: () => void }) {
  const { t3 } = useI18n();
  const [date, setDate] = useState(dateKey(s.startsAt));
  const [time, setTime] = useState(hhmm(s.startsAt));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const buyers = ordersOf(s.id).length;
  const sold = sessionSold(s.id);
  const submit = async () => {
    const e: Record<string, string> = {};
    const de = dateErr(date);
    const te = timeErr(time);
    if (de) e.date = de;
    if (te) e.time = te;
    let start = 0;
    if (!de && !te) {
      start = tkMs(date, time);
      if (start <= now()) e.date = t3('Sana oʻtib ketgan', 'Дата уже прошла', 'This date has passed');
      else if (start === s.startsAt) e.date = t3('Yangi sana hozirgisi bilan bir xil', 'Новая дата совпадает с текущей', 'The new date is the same as the current one');
    }
    setErr(e);
    if (Object.keys(e).length) return;
    const ok = await confirmBox({
      title: t3('Seansni koʻchirasizmi?', 'Перенести сеанс?', 'Postpone the session?'),
      text: buyers
        ? t3('{n}ning chiptalari amal qiladi, ularga xabar boradi.', 'Билеты {n} останутся действительными, им придёт уведомление.', 'The tickets of {n} stay valid and they’ll be notified.', { n: nBuyers(buyers) })
        : t3('Bu seansga hali chipta sotilmagan.', 'На этот сеанс ещё не продано билетов.', 'No tickets sold for this session yet.'),
      extra: (
        <p className="text-[15px]">
          <s className="text-ink-3">{fmtDT(s.startsAt)}</s> → <b>{fmtDT(start)}</b>
        </p>
      ),
      ok: t3('Koʻchirish', 'Перенести', 'Postpone'),
    });
    if (!ok) return;
    const r = postponeSession(s.id, start, reason.trim().slice(0, 200));
    onClose();
    infoBox(
      t3('Seans koʻchirildi', 'Сеанс перенесён', 'Session postponed'),
      <>
        <p>{t3('Yangi sana: {w}. Vitrina va chiptalarda «Koʻchirildi» belgisi koʻrinadi.', 'Новая дата: {w}. На витрине и в билетах видна пометка «Перенесено».', 'New date: {w}. The storefront and tickets show a "Postponed" mark.', { w: fmtDT(start) })}</p>
        <p className="mt-2">{r.notified ? t3('Xabar yuborildi: {n} (SMS va email xarid tilida).', 'Уведомлено: {n} (SMS и email на языке покупки).', 'Notified: {n} (SMS and email in the language of purchase).', { n: nBuyers(r.notified) }) : t3('Xabar yuboriladigan xaridorlar yoʻq.', 'Уведомлять некого.', 'There is no one to notify.')}</p>
      </>,
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t3('Seansni koʻchirish', 'Перенос сеанса', 'Postpone the session')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t3('Bekor qilish', 'Отмена', 'Cancel')}
          </Button>
          <Button onClick={submit}>{t3('Koʻchirish', 'Перенести', 'Postpone')}</Button>
        </>
      }
    >
      <p className="mb-4">
        {t3('Hozir', 'Сейчас', 'Now')}: <b>{fmtDT(s.startsAt, { year: true })}</b> · {t3('{n} ta chipta sotilgan', 'продано билетов: {n}', '{n} tickets sold', { n: sold })}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t3('Yangi sana', 'Новая дата', 'New date')} required error={err.date}>
          <Input type="date" min={todayKey()} value={date} invalid={!!err.date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t3('Boshlanish vaqti', 'Время начала', 'Start time')} required error={err.time}>
          <Input type="time" value={time} invalid={!!err.time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field className="mt-4" label={t3('Xaridorlar uchun sabab', 'Причина для покупателей', 'Reason for buyers')} hint={`${reason.length} / 200`}>
        <Textarea rows={2} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <p className="mt-3 text-sm text-ink-3">
        {t3(
          'Kirish vaqti boshlanish bilan birga suriladi. Sotuv davom etadi, joylar xaridorlarda qoladi. Xaridorlarga SMS va email xarid tilida boradi.',
          'Открытие входа сдвинется вместе с началом. Продажи продолжаются, места остаются за покупателями. Покупателям уйдут SMS и email на языке покупки.',
          'Doors move together with the start. Sales go on and seats stay with their buyers. Buyers get an SMS and an email in the language of purchase.',
        )}
      </p>
    </Modal>
  );
}
