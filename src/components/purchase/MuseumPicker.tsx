/* Museum: calendar of dates → time slots with what is left → ticket types with counters (US-29). Storefront and box office. */
import { FileText, Info } from 'lucide-react';
import { useState } from 'react';
import { getLang, nTickets, tl, useI18n } from '../../lib/i18n';
import { sum, usd } from '../../lib/format';
import { addDays, dowOf, DOW_SHORT, MONTHS_NOM, tk, tkMs, todayKey } from '../../lib/time';
import { useDb } from '../../store/db';
import { createHold, itemCount, itemsTotal, MAX_PER_ORDER, museumDay, museumSlots, salesOpen, typeReq, unitStock, visibleTypes, type Unit } from '../../domain/rules';
import { buildItems, heldBy, limitText } from '../../domain/purchase';
import type { Channel, EventItem, Hold } from '../../domain/types';
import { Button, cn, Stepper, toast } from '../ui';
import { useNow, useSel } from './state';

/** First date from today that still has a slot to sell. */
export function firstMuseumDate(ev: EventItem): string | null {
  const t = todayKey();
  for (let i = 0; i <= (ev.museum?.ahead || 30); i++) {
    const d = addDays(t, i);
    if (museumSlots(ev, d).some((s) => !s.past && s.left > 0)) return d;
  }
  return null;
}

/** Monday-first calendar from today to the end of the sales horizon; closed days grey with the reason. */
export function MuseumCalendar({ ev, date, onDate }: { ev: EventItem; date: string | null; onDate: (d: string) => void }) {
  const { lang, t3 } = useI18n();
  useDb();
  useNow(30_000);
  const t = todayKey();
  const ahead = ev.museum?.ahead || 30;
  const days: string[] = [];
  const last = addDays(t, ahead);
  const lastDow = (dowOf(last) + 6) % 7;
  // show the rest of the last week too, so the horizon ("sales not open yet") is visible
  for (let i = 0; i <= ahead + (6 - lastDow); i++) days.push(addDays(t, i));
  const lead = (dowOf(days[0]) + 6) % 7;
  const head = [1, 2, 3, 4, 5, 6, 0].map((d) => DOW_SHORT[lang][d]);
  return (
    <div role="grid" aria-label={t3('Sana', 'Дата', 'Date')}>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-xs font-semibold text-ink-3">
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={'p' + i} />
        ))}
        {days.map((dd, i) => {
          const st = museumDay(ev, dd);
          const p = tk(tkMs(dd, '12:00'));
          const slots = st.open ? museumSlots(ev, dd).filter((x) => !x.past) : [];
          const soldOut = st.open && slots.every((x) => x.left === 0);
          const avail = st.open && slots.length > 0 && !soldOut;
          const why = !st.open ? st.reason : soldOut ? t3('Sotib boʻlingan', 'Распродано', 'Sold out') : '';
          const showMon = i === 0 || p.d === 1;
          return (
            <button
              key={dd}
              type="button"
              disabled={!avail}
              onClick={() => onDate(dd)}
              title={why || undefined}
              aria-label={`${p.d} ${MONTHS_NOM[getLang()][p.m - 1]}${why ? ' — ' + why : ''}`}
              aria-pressed={dd === date}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-start rounded-xl px-0.5 pt-1.5 pb-1 text-center transition-colors',
                dd === date ? 'bg-brand font-bold' : avail ? 'bg-white ring-1 ring-line-2 hover:ring-ink' : 'cursor-not-allowed bg-black/[0.03] text-ink-3',
                st.special && 'bg-bad-soft/60 text-bad',
              )}
            >
              <span className="text-[15px] leading-none font-semibold tabular-nums">{p.d}</span>
              {showMon && <span className="mt-0.5 text-[10px] leading-none uppercase">{MONTHS_NOM[lang][p.m - 1].slice(0, 3)}</span>}
              {st.special && <span className="mt-0.5 line-clamp-1 w-full text-[9px] leading-tight">{st.reason}</span>}
              {soldOut && <span className="mt-0.5 text-[9px] leading-tight">{t3('yoʻq', 'нет', 'none')}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Slots of a day: "10:00–11:00 · 12 left"; past and sold-out slots are disabled. */
export function SlotList({ ev, date, sid, onSlot }: { ev: EventItem; date: string; sid: string | null; onSlot: (sid: string) => void }) {
  const { t3 } = useI18n();
  useDb();
  useNow(15_000);
  const slots = museumSlots(ev, date);
  if (!slots.length) return <p className="text-ink-3">{museumDay(ev, date).reason || t3('Bu kunda slotlar yoʻq', 'В этот день нет слотов', 'No time slots on this day')}</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {slots.map((sl) => {
        const dis = sl.past || sl.left === 0;
        return (
          <button
            key={sl.sid}
            type="button"
            disabled={dis}
            onClick={() => onSlot(sl.sid)}
            aria-pressed={sl.sid === sid}
            className={cn('flex flex-col items-start rounded-2xl px-3.5 py-2.5 text-left transition-colors', sl.sid === sid ? 'bg-ink text-white' : dis ? 'cursor-not-allowed bg-black/[0.03] text-ink-3' : 'bg-white ring-1 ring-line-2 hover:ring-ink')}
          >
            <b className="tabular-nums">
              {sl.start}–{sl.end}
            </b>
            <span className={cn('text-sm', sl.sid === sid ? 'text-white/80' : !dis && sl.left < 10 ? 'font-semibold text-warn' : '')}>
              {sl.past ? t3('oʻtdi', 'прошёл', 'over') : sl.left === 0 ? t3('sotib boʻlingan', 'распродан', 'sold out') : t3('{n} ta qoldi', 'осталось {n}', '{n} left', { n: sl.left })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Ticket types of a slot with counters; the sum can't exceed the slot's stock or the purchase limit. */
export function MuseumTypes({ u, channel, holder, onHold, block }: { u: Unit; channel: Channel; holder: string; onHold: (h: Hold) => void; block?: string | null }) {
  const { t3 } = useI18n();
  useDb();
  useNow(5000);
  const [sel, setSel] = useSel(channel, u.sid);
  const [busy, setBusy] = useState(false);
  const mine = heldBy(holder, u.sid);
  const free = unitStock(u).free + (mine ? itemCount(mine.items) : 0);
  const total = Object.values(sel.types).reduce((a, b) => a + b, 0);
  const max = Math.min(free, MAX_PER_ORDER);
  const items = buildItems(u, sel);
  const sumT = itemsTotal(items);
  const types = visibleTypes(u.ev);
  const setQty = (id: string, v: number) => {
    if (v > (sel.types[id] || 0) && total >= max) return toast(total >= MAX_PER_ORDER ? limitText() : t3('Slotda {n} ta qoldi', 'В слоте осталось {n}', 'Only {n} left in this slot', { n: free }), 'bad');
    setSel((s) => ({ ...s, types: { ...s.types, [id]: Math.max(0, v) } }));
  };
  const proceed = () => {
    if (busy) return;
    if (block) return toast(block, 'bad');
    if (!salesOpen(u, channel)) return toast(t3('Bu slotga sotuv yopilgan', 'Продажи на этот слот закрыты', 'Sales for this slot are closed'), 'bad');
    if (!items.length) return;
    setBusy(true);
    const res = createHold(u.sid, items, channel, holder);
    setBusy(false);
    if (!res.ok) return toast(t3('Slotda faqat {n} ta chipta qoldi — sonini kamaytiring', 'В слоте осталось только {n} — уменьшите количество', 'Only {n} left in this slot: reduce the number', { n: unitStock(u).free }), 'bad');
    onHold(res.hold);
  };
  const cta = channel === 'box' ? t3('Sotuvni rasmiylashtirish', 'Оформить продажу', 'Check out') : t3('Davom etish', 'Продолжить', 'Continue');
  return (
    <div>
      <ul className="divide-y divide-line">
        {types.map((t) => {
          const q = sel.types[t.id] || 0;
          return (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{tl(t.name)}</div>
                <div className="font-bold tabular-nums">{sum(t.price || 0)}</div>
                {typeReq(t) && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-warn">
                    <Info className="mt-0.5 size-4 shrink-0" />
                    {typeReq(t)}
                  </p>
                )}
                {t.passport !== 'none' && (
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-info">
                    <FileText className="mt-0.5 size-4 shrink-0" />
                    {t3('Pasport maʼlumotlari kerak boʻladi', 'Понадобятся паспортные данные', 'Passport details will be needed')}
                  </p>
                )}
              </div>
              <Stepper value={q} min={0} max={q + Math.max(0, max - total)} onChange={(v) => setQty(t.id, v)} />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-ink-3">{t3('Slotda {n} ta qoldi. Bir xaridda koʻpi bilan {m} ta.', 'В слоте осталось {n}. Всего в покупке — не больше {m}.', '{n} left in this slot. Up to {m} per purchase.', { n: free, m: MAX_PER_ORDER })}</p>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3">
        <span className="text-ink-2">
          {t3('Jami', 'Итого', 'Total')} · {nTickets(total)}
        </span>
        <b className="text-xl tabular-nums">{sum(sumT)}</b>
        {channel === 'online' && <span className="w-full text-right text-sm text-ink-3">{usd(sumT)}</span>}
      </div>
      {block && total > 0 && <p className="mt-3 text-sm font-medium text-bad">{block}</p>}
      <Button block size="lg" className="mt-4" disabled={!total || !!block} loading={busy} onClick={proceed}>
        {cta}
        {total ? ` · ${sum(sumT)}` : ''}
      </Button>
    </div>
  );
}
