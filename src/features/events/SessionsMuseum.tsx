/* Museum: opening hours per weekday, slot length, limit per slot, sales horizon (US-15); per-slot limits; closed days (US-19). */
import { CalendarOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { addDays, DOW_LONG, DOW_SHORT, dowOf, fmtDate, minOf, todayKey } from '../../lib/time';
import { byId, uniq } from '../../lib/util';
import { tx, useDb } from '../../store/db';
import { dayCfg, evTitle, logAct, museumDay, museumSlots, museumSlotTimes, parseSid } from '../../domain/rules';
import type { DayHours, EventItem, MuseumCfg } from '../../domain/types';
import { Badge, Button, Checkbox, cn, Field, Input, Select, toast } from '../../components/ui';
import { dateErr, DOW_ORDER, museumHeldOn, museumSoldBySid, museumSoldOn, sameDayCfg, SLOT_LENGTHS, TIME_RE } from './helpers';
import { confirmBox, ErrText, infoBox, pubConfirm, Section } from './ui';

export function MuseumSessions({ ev, ro }: { ev: EventItem; ro: boolean }) {
  useDb();
  const mu = ev.museum!;
  return (
    <div className="space-y-6">
      <HoursForm key={JSON.stringify([mu.hours, mu.slot, mu.limit, mu.ahead])} ev={ev} ro={ro} />
      <DaySlots ev={ev} ro={ro} />
      <OffDays ev={ev} ro={ro} />
    </div>
  );
}

const slotName = (n: number, t3: (u: string, r: string, e: string, v?: Record<string, string | number>) => string) =>
  n === 30 ? t3('30 daqiqa', '30 минут', '30 minutes') : n === 60 ? t3('1 soat', '1 час', '1 hour') : t3('{n} soat', '{n} часа', '{n} hours', { n: n / 60 });

function HoursForm({ ev, ro }: { ev: EventItem; ro: boolean }) {
  const { t3, lang } = useI18n();
  const mu = ev.museum!;
  const [hours, setHours] = useState<Record<number, DayHours>>(() => {
    const h: Record<number, DayHours> = {};
    for (let i = 0; i < 7; i++) h[i] = { ...(mu.hours[i] || { open: '09:00', close: '18:00', off: true }) };
    return h;
  });
  const [slot, setSlot] = useState(String(mu.slot));
  const [limit, setLimit] = useState(String(mu.limit));
  const [ahead, setAhead] = useState(String(mu.ahead));
  const [err, setErr] = useState<Record<string, string>>({});
  const t = todayKey();
  const keptDays = Object.keys(mu.keep || {})
    .filter((d) => d >= t)
    .sort();
  const setDay = (x: number, p: Partial<DayHours>) => setHours((h) => ({ ...h, [x]: { ...h[x], ...p } }));

  const save = async () => {
    const e: Record<string, string> = {};
    for (const x of DOW_ORDER) {
      const h = hours[x];
      if (!h.off && (!TIME_RE.test(h.open) || !TIME_RE.test(h.close) || minOf(h.close) <= minOf(h.open))) e['h' + x] = t3('Ish vaqtini kiriting', 'Укажите часы работы', 'Enter the opening hours');
    }
    if (DOW_ORDER.every((x) => hours[x].off)) e.hours = t3('Kamida bitta kun uchun ish vaqtini kiriting', 'Укажите часы работы хотя бы для одного дня', 'Enter the hours for at least one day');
    const sl = Number(slot);
    if (!SLOT_LENGTHS.includes(sl)) e.slot = t3('Slot uzunligini tanlang', 'Выберите длину слота', 'Choose the slot length');
    const lim = Number(limit);
    if (!(Number.isInteger(lim) && lim > 0)) e.limit = t3('Limitni kiriting', 'Укажите лимит', 'Enter the limit');
    const ah = Number(ahead);
    if (!(Number.isInteger(ah) && ah >= 1 && ah <= 365)) e.ahead = t3('1 dan 365 kungacha', 'От 1 до 365 дней', 'From 1 to 365 days');
    // The limit can't go below what a slot without its own limit has already sold (US-15, acceptance 4).
    const sold = museumSoldBySid(ev.id, t);
    if (!e.limit) {
      let worst: { n: number; date: string; start: string } | null = null;
      for (const [sid, n] of Object.entries(sold)) {
        const p = parseSid(sid);
        if (!p.museum || mu.overrides[`${p.date}|${p.start}`] != null) continue;
        if (n > lim && (!worst || n > worst.n)) worst = { n, date: p.date, start: p.start };
      }
      if (worst)
        e.limit = t3('{d}, {t} slotida {n} ta sotilgan — limit undan kam boʻlolmaydi', 'В слоте {d}, {t} уже продано {n} — лимит не может быть меньше', '{n} already sold in the {d}, {t} slot: the limit can’t be lower', {
          d: fmtDate(worst.date, { weekday: false }),
          t: worst.start,
          n: worst.n,
        });
    }
    setErr(e);
    if (Object.keys(e).length) return;

    // Days with sales keep the plan they were sold under.
    const soldDates = uniq(Object.keys(sold).map((sid) => (parseSid(sid) as { date: string }).date));
    const keep: NonNullable<MuseumCfg['keep']> = {};
    for (const [dd, k] of Object.entries(mu.keep || {})) if (dd >= t) keep[dd] = k;
    for (const dd of soldDates) {
      const old = dayCfg(ev, dd);
      const next = { h: hours[dowOf(dd)], slot: sl };
      if (sameDayCfg(old, next)) delete keep[dd];
      else if (!keep[dd] && old.h) keep[dd] = { h: old.h, slot: old.slot };
    }
    const newKept = Object.keys(keep)
      .filter((dd) => !(mu.keep || {})[dd])
      .sort();
    const uneven = DOW_ORDER.filter((x) => !hours[x].off && (minOf(hours[x].close) - minOf(hours[x].open)) % sl !== 0).map((x) => {
      const last = museumSlotTimes(hours[x], sl).slice(-1)[0];
      return `${DOW_SHORT[lang][x]} ${last.start}–${last.end}`;
    });
    if (uneven.length) {
      const ok = await confirmBox({
        title: t3('Oxirgi slot qisqaroq boʻladi', 'Последний слот будет короче', 'The last slot will be shorter'),
        text: t3('Ish vaqti slotlarga teng boʻlinmaydi: {s}. Saqlaysizmi yoki vaqtni oʻzgartirasizmi?', 'Часы работы не делятся на слоты нацело: {s}. Сохранить так или изменить время?', 'The hours don’t divide into whole slots: {s}. Save as is or change the hours?', { s: uneven.join(', ') }),
        ok: t3('Shunday saqlash', 'Сохранить так', 'Save as is'),
        cancel: t3('Vaqtni oʻzgartirish', 'Изменить время', 'Change the hours'),
      });
      if (!ok) return;
    }
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      const m2 = x.museum!;
      const was = `${m2.slot}′, limit ${m2.limit}, ${m2.ahead}d`;
      const oldLimit = m2.limit;
      Object.assign(m2, { hours, slot: sl, limit: lim, ahead: ah, keep });
      logAct('museum-hours', evTitle(x), `${was} → ${sl}′, limit ${lim}, ${ah}d; ${DOW_ORDER.map((y) => `${DOW_SHORT.uz[y]} ${hours[y].off ? '—' : hours[y].open + '–' + hours[y].close}`).join(', ')}`);
      if (oldLimit !== lim) logAct('museum-limit', evTitle(x), `${oldLimit} → ${lim}`);
    });
    toast(t3('Grafik saqlandi', 'График сохранён', 'Hours saved'), 'ok');
    if (newKept.length)
      infoBox(
        t3('Grafik saqlandi', 'График сохранён', 'Hours saved'),
        t3('Bu kunlarga chipta sotilgan, shuning uchun ular avvalgi grafik boʻyicha qoladi: {d}.', 'На эти дни уже проданы билеты, поэтому они остаются по прежнему графику: {d}.', 'Tickets are sold for these days, so they keep the previous hours: {d}.', {
          d: newKept.map((dd) => fmtDate(dd, { weekday: false })).join(', '),
        }),
      );
  };

  return (
    <Section
      title={t3('Ish vaqti va slotlar', 'Часы работы и слоты', 'Opening hours and slots')}
      sub={t3('Chipta faqat oʻz slotida amal qiladi. Joriy slot tugaguncha sotiladi. Limit sayt va kassa uchun umumiy.', 'Билет действует только в своём слоте. Текущий слот продаётся до его окончания. Лимит общий для сайта и кассы.', 'A ticket is valid only in its slot. The current slot is sold until it ends. The limit is shared by the site and the box office.')}
    >
      <div className="divide-y divide-line">
        {DOW_ORDER.map((x) => {
          const h = hours[x];
          return (
            <div key={x} className="flex flex-wrap items-center gap-3 py-2.5">
              <b className="w-32 capitalize">{DOW_LONG[lang][x]}</b>
              <Checkbox checked={h.off} onChange={(v) => setDay(x, { off: v })} label={t3('Dam olish', 'Выходной', 'Closed')} />
              <div className={cn('flex items-center gap-2', h.off && 'pointer-events-none opacity-40')}>
                <Input type="time" className="w-32" value={h.open} invalid={!!err['h' + x]} onChange={(e) => setDay(x, { open: e.target.value })} aria-label={t3('Ochilish', 'Открытие', 'Opens')} />
                <span>—</span>
                <Input type="time" className="w-32" value={h.close} invalid={!!err['h' + x]} onChange={(e) => setDay(x, { close: e.target.value })} aria-label={t3('Yopilish', 'Закрытие', 'Closes')} />
              </div>
              <ErrText>{err['h' + x]}</ErrText>
            </div>
          );
        })}
      </div>
      <ErrText>{err.hours}</ErrText>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label={t3('Slot uzunligi', 'Длина слота', 'Slot length')} required error={err.slot}>
          <Select value={slot} invalid={!!err.slot} onChange={(e) => setSlot(e.target.value)}>
            {SLOT_LENGTHS.map((n) => (
              <option key={n} value={n}>
                {slotName(n, t3)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t3('Slot limiti', 'Лимит на слот', 'Limit per slot')} required error={err.limit} hint={t3('Bitta slotga nechta chipta sotish mumkin', 'Сколько билетов можно продать на один слот', 'How many tickets one slot can sell')}>
          <Input type="number" min={1} value={limit} invalid={!!err.limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <Field label={t3('Oldindan sotuv, kun', 'Продажа вперёд, дней', 'Sell ahead, days')} required error={err.ahead}>
          <Input type="number" min={1} max={365} value={ahead} invalid={!!err.ahead} onChange={(e) => setAhead(e.target.value)} />
        </Field>
      </div>
      {keptDays.length > 0 && (
        <p className="mt-4 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
          {t3('Sotuvi bor kunlar avvalgi grafik boʻyicha: {d}.', 'Дни с продажами идут по прежнему графику: {d}.', 'Days that already have sales keep their previous hours: {d}.', { d: keptDays.map((dd) => fmtDate(dd, { weekday: false })).join(', ') })}
        </p>
      )}
      {!ro && (
        <div className="mt-4 flex justify-end">
          <Button onClick={save}>{t3('Grafikni saqlash', 'Сохранить график', 'Save the hours')}</Button>
        </div>
      )}
    </Section>
  );
}

/** Slots of one date with sales, and a limit override per slot (US-15 rule 3). */
function DaySlots({ ev, ro }: { ev: EventItem; ro: boolean }) {
  const { t3 } = useI18n();
  const mu = ev.museum!;
  const t = todayKey();
  const [date, setDate] = useState(t);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const day = museumDay(ev, date);
  const off = mu.offDays.find((o) => o.date === date);
  const cfg = dayCfg(ev, date);
  const closed = !!off || !cfg.h || cfg.h.off;
  const slots = closed ? [] : museumSlots(ev, date, { any: true });
  const ovs = Object.entries(mu.overrides)
    .filter(([k]) => k.split('|')[0] >= t)
    .sort();
  const val = (start: string) => vals[start] ?? (mu.overrides[`${date}|${start}`] != null ? String(mu.overrides[`${date}|${start}`]) : '');
  const pick = (d: string) => {
    setDate(d < t ? t : d);
    setVals({});
    setErr({});
  };
  const save = async () => {
    const e: Record<string, string> = {};
    const next: Record<string, number | null> = {};
    for (const s of slots.filter((x) => !x.past)) {
      const raw = val(s.start).trim();
      if (!raw) {
        next[s.start] = null;
        continue;
      }
      const n = Number(raw);
      if (!(Number.isInteger(n) && n > 0)) e[s.start] = t3('Limitni kiriting', 'Укажите лимит', 'Enter the limit');
      else if (n < s.sold) e[s.start] = t3('{n} ta sotilgan', 'Продано {n}', '{n} sold', { n: s.sold });
      else next[s.start] = n;
    }
    for (const s of slots.filter((x) => !x.past)) if (next[s.start] == null && !e[s.start] && s.sold > mu.limit) e[s.start] = t3('{n} ta sotilgan', 'Продано {n}', '{n} sold', { n: s.sold });
    setErr(e);
    if (Object.keys(e).length) return;
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      const ov = x.museum!.overrides;
      const changes: string[] = [];
      for (const [start, n] of Object.entries(next)) {
        const k = `${date}|${start}`;
        const was = ov[k] ?? null;
        if (n == null || n === x.museum!.limit) delete ov[k];
        else ov[k] = n;
        const now2 = ov[k] ?? null;
        if (was !== now2) changes.push(`${start}: ${was ?? x.museum!.limit} → ${now2 ?? x.museum!.limit}`);
      }
      if (changes.length) logAct('museum-limit', evTitle(x), `${date}: ${changes.join(', ')}`);
    });
    setVals({});
    toast(t3('Kun limitlari saqlandi', 'Лимиты дня сохранены', 'Day limits saved'), 'ok');
  };
  return (
    <Section
      title={t3('Kun slotlari', 'Слоты дня', 'Slots of a day')}
      sub={t3('Sana boʻyicha slotlar va sotuvlar. Alohida slot uchun limitni oʻzgartirish mumkin, masalan, ekskursiya guruhi kuni. Boʻsh — umumiy limit ({n}).', 'Слоты и продажи на дату. Лимит можно изменить для отдельного слота, например в день экскурсионной группы. Пусто — общий лимит ({n}).', 'Slots and sales on a date. A single slot can get its own limit, e.g. on a tour group’s day. Empty: the general limit ({n}).', { n: mu.limit })}
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t3('Sana', 'Дата', 'Date')}>
          <Input type="date" min={t} value={date} onChange={(e) => e.target.value && pick(e.target.value)} className="w-48" />
        </Field>
        {ovs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 text-sm">
            <span className="text-ink-3">{t3('Maxsus limitlar:', 'Особые лимиты:', 'Special limits:')}</span>
            {uniq(ovs.map(([k]) => k.split('|')[0])).map((d) => (
              <button key={d} type="button" onClick={() => pick(d)} className={cn('rounded-full px-2.5 py-0.5', d === date ? 'bg-ink text-white' : 'bg-black/5 hover:bg-black/10')}>
                {fmtDate(d, { weekday: false })}
              </button>
            ))}
          </div>
        )}
      </div>
      {cfg.kept && !closed && <p className="mb-3 text-sm text-info">{t3('Bu kun avvalgi grafik boʻyicha: unga chipta sotilgan.', 'Этот день идёт по прежнему графику: на него проданы билеты.', 'This day keeps the previous hours: tickets are sold for it.')}</p>}
      {closed ? (
        <p className="text-ink-3">{off ? off.reason || t3('Ishlamaydigan kun', 'Нерабочий день', 'Closed') : t3('Dam olish kuni', 'Выходной', 'Closed')}</p>
      ) : (
        <>
          {!day.open && day.reason && <p className="mb-3 text-sm text-warn">{day.reason}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-line text-sm text-ink-3">
                  <th className="py-2 pr-3 font-medium">{t3('Slot', 'Слот', 'Slot')}</th>
                  <th className="py-2 pr-3 font-medium">{t3('Sotilgan', 'Продано', 'Sold')}</th>
                  <th className="py-2 pr-3 font-medium">{t3('Qoldi', 'Осталось', 'Left')}</th>
                  <th className="py-2 font-medium">{t3('Limit', 'Лимит', 'Limit')}</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.start} className={cn('border-b border-line last:border-0', s.past && 'text-ink-3')}>
                    <td className="py-2 pr-3 tabular-nums">
                      {s.start}–{s.end}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{s.sold}</td>
                    <td className="py-2 pr-3 tabular-nums">{s.past ? '—' : s.left}</td>
                    <td className="py-2">
                      <Input type="number" min={1} className="h-9 w-28" disabled={ro || s.past} placeholder={String(mu.limit)} value={val(s.start)} invalid={!!err[s.start]} onChange={(e) => setVals((o) => ({ ...o, [s.start]: e.target.value }))} />
                      <ErrText>{err[s.start]}</ErrText>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!ro && slots.some((s) => !s.past) && (
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={save}>
                {t3('Kun limitlarini saqlash', 'Сохранить лимиты дня', 'Save the day’s limits')}
              </Button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function OffDays({ ev, ro }: { ev: EventItem; ro: boolean }) {
  const { t3 } = useI18n();
  const mu = ev.museum!;
  const t = todayKey();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const list = mu.offDays.filter((o) => o.date >= t).sort((a, b) => (a.date < b.date ? -1 : 1));
  const add = async () => {
    let e = dateErr(date);
    if (!e && mu.offDays.some((o) => o.date === date)) e = t3('Bu kun allaqachon ishlamaydigan', 'Этот день уже нерабочий', 'This day is already closed');
    if (!e) {
      const n = museumSoldOn(ev.id, date);
      if (n) e = t3('Bu kunga {n} ta chipta sotilgan. Qaytarishlardan keyin uni ishlamaydigan qilish mumkin.', 'На этот день продано билетов: {n}. Сделать его нерабочим можно после возвратов.', '{n} tickets are sold for this day. It can be closed after refunds.', { n });
      else if (museumHeldOn(ev.id, date)) e = t3('Xarid davom etmoqda, 10 daqiqadan keyin urinib koʻring', 'Идёт покупка, попробуйте через 10 минут', 'Someone is paying right now, try again in 10 minutes');
    }
    setErr(e);
    if (e) return;
    if (!(await pubConfirm(ev))) return;
    const r = reason.trim().slice(0, 60);
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      x.museum!.offDays.push({ date, reason: r });
      logAct('museum-offday', evTitle(x), `+ ${date}${r ? ' · ' + r : ''}`);
    });
    toast(t3('{d}: ishlamaydigan kun', '{d}: нерабочий день', '{d}: closed', { d: fmtDate(date, { weekday: false }) }), 'ok');
    setDate('');
    setReason('');
  };
  const remove = async (dd: string) => {
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      x.museum!.offDays = x.museum!.offDays.filter((o) => o.date !== dd);
      logAct('museum-offday', evTitle(x), `− ${dd}`);
    });
    toast(t3('{d}: slotlar yana sotuvda', '{d}: слоты снова в продаже', '{d}: slots are back on sale', { d: fmtDate(dd, { weekday: false }) }), 'ok');
  };
  const soldOnPick = date && date >= t ? museumSoldOn(ev.id, date) : 0;
  return (
    <Section
      title={t3('Ishlamaydigan kunlar', 'Нерабочие дни', 'Closed days')}
      sub={t3('Bir martalik yopilishlar va bayramlar. Muntazam dam olish kunlari ish vaqtida belgilanadi. Sababni xaridor kalendarda koʻradi.', 'Разовые закрытия и праздники. Регулярные выходные задаются в часах работы. Причину покупатель увидит в календаре.', 'One-off closures and holidays. Regular days off are set in the opening hours. Buyers see the reason in the calendar.')}
    >
      {list.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {list.map((o) => (
            <li key={o.date} className="flex items-center gap-3 py-2">
              <CalendarOff className="size-4 shrink-0 text-ink-3" />
              <span className="flex-1">
                <b>{fmtDate(o.date, { year: true })}</b>
                {o.reason && <span className="text-ink-3"> · {o.reason}</span>}
              </span>
              {!ro && (
                <Button variant="ghost" size="sm" onClick={() => remove(o.date)}>
                  <Trash2 className="size-4" />
                  {t3('Olib tashlash', 'Снять', 'Remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-ink-3">{t3('Ishlamaydigan kunlar yoʻq.', 'Нерабочих дней нет.', 'No closed days.')}</p>
      )}
      {!ro && (
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-start">
          <Field label={t3('Sana', 'Дата', 'Date')} required error={err}>
            <Input type="date" min={t} max={addDays(t, 366)} value={date} invalid={!!err} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t3('Sabab', 'Причина', 'Reason')} hint={soldOnPick ? <Badge tone="warn">{t3('Sotilgan: {n}', 'Продано: {n}', 'Sold: {n}', { n: soldOnPick })}</Badge> : undefined}>
            <Input maxLength={60} placeholder={t3('Sanitariya kuni', 'Санитарный день', 'Maintenance day')} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="sm:pt-7">
            <Button variant="outline" onClick={add}>
              {t3('Ishlamaydigan deb belgilash', 'Отметить нерабочим', 'Mark as closed')}
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
