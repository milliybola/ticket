/*
 * Seat / fan zone / table selection on a seating plan (US-26 – US-28), shared by the storefront and the box office.
 * Same stock for both channels (US-38): the plan shows sales and other people's holds live.
 */
import { ArrowLeft, Info, Ticket, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { nSeats, nTickets, t3, tl, useI18n } from '../../lib/i18n';
import { sum, usd } from '../../lib/format';
import { refreshDb, useDb } from '../../store/db';
import { createHold, elPrices, priceFor, itemCount, itemsTotal, MAX_PER_ORDER, occupancy, pricingOf, salesOpen, tablePrice, typeReq, visibleTypes, type Occupancy, type Unit } from '../../domain/rules';
import { catOf, seatsOf, sellables } from '../../domain/scheme';
import { buildItems, catPriceRange, heldBy, limitText, planPrice, priceColors, pruneSel, selCount, selectedKeys, seatPrice, zonePrice, type Sel, type SelItem } from '../../domain/purchase';
import type { Channel, Hold, SchemeEl } from '../../domain/types';
import { SchemeLegend, SchemeView } from '../scheme/SchemeView';
import { Badge, Button, cn, Modal, Select, Stepper, toast } from '../ui';
import { useNow, useSel, useStableScheme } from './state';

export type PickerProps = {
  u: Unit;
  channel: Channel;
  /** Hold owner: the browser's client id online, `box:<orgId>` at the box office. */
  holder: string;
  onHold: (h: Hold) => void;
  /** Why the sale can't go on right now (box office offline), shown instead of continuing. */
  block?: string | null;
};

/** "Bu joy hozirgina band qilindi" with the places that went, keeping the rest selected (US-26 AC4, US-38 rule 3). */
export function takenText(labels: string[]) {
  if (labels.length > 1)
    return t3('Hozirgina band qilindi: {s}. Qolgan joylar tanlangan holda qoldi.', 'Только что заняли: {s}. Остальные места остались выбранными.', 'Just taken: {s}. Your other places are still selected.', { s: labels.join(', ') });
  if (labels.length === 1) return t3('Bu joy hozirgina band qilindi: {s}', 'Это место только что заняли: {s}', 'This place was just taken: {s}', { s: labels[0] });
  return t3('Bu joy hozirgina band qilindi', 'Это место только что заняли', 'This place was just taken');
}

export function SeatPicker({ u, channel, holder, onHold, block }: PickerProps) {
  const { t3 } = useI18n();
  const db = useDb();
  const tick = useNow(5000);
  const [sel, setSel] = useSel(channel, u.sid);
  const [zone, setZone] = useState<SchemeEl | null>(null);
  const [table, setTable] = useState<SchemeEl | null>(null);
  const [busy, setBusy] = useState(false);
  const sc = useStableScheme(u.scheme);
  const ev = u.ev;
  const mine = heldBy(holder, u.sid);
  const mineId = mine?.id || null;
  const occ = useMemo(() => occupancy(u.sid, mineId), [db.rev, tick, u.sid, mineId]); // eslint-disable-line react-hooks/exhaustive-deps
  const keys = useMemo(() => selectedKeys(u, sel), [sel, u]);
  const price = useMemo(() => planPrice(ev), [ev, db.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const pc = useMemo(() => priceColors(ev, sc), [ev, sc, db.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live: drop what another buyer or the box office has just taken (US-26 AC4, US-38).
  useEffect(() => {
    const r = pruneSel(u, sel, mineId);
    if (r.sel !== sel) {
      setSel(() => r.sel);
      if (r.gone.length) toast(takenText(r.gone), 'bad');
    }
  }, [db.rev, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sc) return null;
  const overview = sellables(sc).length >= 4 && !sel.focus;
  const focusEl = sel.focus ? sc.els.find((e) => e.id === sel.focus) : null;
  const n = selCount(u, sel);
  const fresh = () => {
    refreshDb();
    return occupancy(u.sid, mineId);
  };

  const toggleSeat = (key: string, el: SchemeEl) => {
    const i = sel.items.findIndex((x) => x.k === 'seat' && x.key === key);
    if (i >= 0) return setSel((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }));
    if (n >= MAX_PER_ORDER) return toast(limitText(), 'bad');
    const o = fresh();
    if (o.seats.has(key) || (el.type === 'table' && o.wholeTables.has(el.id))) return toast(takenText([]), 'bad');
    setSel((s) => ({ ...s, items: [...s.items, { k: 'seat', key, elId: el.id, typeId: null }] }));
  };
  const toggleWhole = (el: SchemeEl) => {
    const i = sel.items.findIndex((x) => x.k === 'table' && x.elId === el.id);
    if (i >= 0) return setSel((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }));
    const o = fresh();
    if (o.wholeTables.has(el.id) || seatsOf(el).some((x) => o.seats.has(x.key))) return toast(t3('Stol band', 'Стол уже занят', 'This table is taken'), 'bad');
    const own = sel.items.filter((x) => x.k === 'seat' && x.elId === el.id).length;
    if (n - own + seatsOf(el).length > MAX_PER_ORDER) return toast(limitText(), 'bad');
    setSel((s) => ({ ...s, items: [...s.items.filter((x) => !(x.k === 'seat' && x.elId === el.id)), { k: 'table', elId: el.id }] }));
  };
  const onElement = (el: SchemeEl) => {
    if (el.type === 'fan') return setZone(el);
    if (el.type === 'table') return el.mode === 'whole' ? toggleWhole(el) : setTable(el);
    setSel((s) => ({ ...s, focus: el.id }));
  };
  const onSeat = (key: string, el: SchemeEl) => {
    if (el.type === 'table' && (el.mode === 'whole' || sel.items.some((x) => x.k === 'table' && x.elId === el.id))) return onElement(el);
    toggleSeat(key, el);
  };

  const proceed = () => {
    if (busy) return;
    if (block) return toast(block, 'bad');
    if (!salesOpen(u, channel)) return toast(t3('Bu seansga sotuv yopilgan', 'Продажи на этот сеанс закрыты', 'Sales for this session are closed'), 'bad');
    const items = buildItems(u, sel);
    if (!items.length) return;
    setBusy(true);
    const res = createHold(u.sid, items, channel, holder);
    setBusy(false);
    if (!res.ok) {
      const r = pruneSel(u, sel, null);
      setSel(() => r.sel);
      toast(takenText(r.gone), 'bad');
      return;
    }
    onHold(res.hold);
  };

  const elementPricing = pricingOf(ev.kind) === 'element';
  const priceOfCat = (catId: string) => {
    const r = catPriceRange(ev, catId);
    return r ? (r.many ? t3('{p} dan', 'от {p}', 'from {p}', { p: sum(r.min) }) : sum(r.min)) : null;
  };
  const tables = sellables(sc).filter((e) => e.type === 'table');
  const tableMin = Math.min(...tables.map((el) => (el.mode !== 'whole' ? tablePrice(ev, el, false) : tablePrice(ev, el, true)) || Infinity));

  return (
    <div className="grid gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:pb-0">
      <div className="min-w-0 rounded-[var(--radius-card)] bg-white p-3 shadow-[var(--shadow-card)] md:p-4">
        <div className="mb-3 flex min-h-10 flex-wrap items-center gap-2">
          {focusEl ? (
            <>
              <Button variant="soft" size="sm" onClick={() => setSel((s) => ({ ...s, focus: null }))}>
                <ArrowLeft className="size-4" />
                {t3('Barcha sektorlar', 'Все секторы', 'All sectors')}
              </Button>
              <b className="text-lg">{focusEl.name}</b>
            </>
          ) : (
            <span className="text-sm text-ink-3">{overview ? t3('Sxemada sektorni tanlang', 'Выберите сектор на схеме', 'Pick a sector on the plan') : t3('Boʻsh joyni bosing', 'Нажмите на свободное место', 'Tap a free seat')}</span>
          )}
        </div>
        <SchemeView key={overview ? 'overview' : 'seats'} scheme={sc} mode={overview ? 'overview' : 'seats'} occ={occ} sel={keys} price={price} seatColor={pc?.seatColor} focus={sel.focus} onSeat={onSeat} onElement={onElement} height="clamp(320px, 58vh, 560px)" />
        <div className="mt-3">
          {pc && !overview ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-2">
              {pc.legend.map((l) => (
                <span key={l.price} className="inline-flex items-center gap-1.5">
                  <i className="inline-block size-3.5 rounded-full" style={{ background: l.color }} />
                  <b className="font-semibold text-ink">{sum(l.price)}</b>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <i className="inline-block size-3.5 rounded-full bg-seat-taken" />
                {t3('Band', 'Занято', 'Taken')}
              </span>
            </div>
          ) : (
            <SchemeLegend scheme={sc} priceOfCat={elementPricing ? undefined : priceOfCat} states={!overview} />
          )}
        </div>
        {elementPricing && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            {sellables(sc)
              .filter((e) => e.type !== 'table')
              .map((el) => {
                const p = el.type === 'fan' ? zonePrice(ev, el) : priceFor(ev, el, el.cat || 'std') || 0;
                const many = el.type !== 'fan' && elPrices(ev, el).length > 1;
                const left = el.type === 'fan' ? (el.limit || 0) - (occ.zones[el.id] || 0) : seatsOf(el).filter((s) => !occ.seats.has(s.key)).length;
                return (
                  <button key={el.id} type="button" onClick={() => onElement(el)} disabled={left <= 0} className={cn('flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors', sel.focus === el.id ? 'border-ink bg-ink text-white' : 'border-line-2 bg-white hover:border-ink', left <= 0 && 'opacity-50')}>
                    <i className="inline-block size-3 rounded-full" style={{ background: catOf(sc, el.cat).color }} />
                    {el.name} · {left > 0 ? (many ? t3('{p} dan', 'от {p}', 'from {p}', { p: sum(p) }) : sum(p)) : t3('Sotib boʻlingan', 'Распродано', 'Sold out')}
                  </button>
                );
              })}
            {tables.length > 0 && isFinite(tableMin) && (
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-black/5 px-3 py-1.5 text-sm font-medium">
                <Users className="size-4" />
                {t3('Stollar · {p} dan', 'Столы · от {p}', 'Tables · from {p}', { p: sum(tableMin) })}
              </span>
            )}
          </div>
        )}
      </div>
      <SelectionPanel u={u} channel={channel} sel={sel} setSel={setSel} occ={occ} onContinue={proceed} busy={busy} block={block} />
      {zone && <ZoneModal u={u} el={zone} sel={sel} setSel={setSel} occ={occ} onClose={() => setZone(null)} />}
      {table && <TableModal u={u} el={table} sel={sel} setSel={setSel} occ={occ} onWhole={() => toggleWhole(table)} onSeat={(k) => toggleSeat(k, table)} onClose={() => setTable(null)} />}
    </div>
  );
}

type SelProps = { u: Unit; sel: Sel; setSel: (fn: (s: Sel) => Sel) => void; occ: Occupancy };

/** The list of selected places with types, prices and the total; sticky on desktop, a bottom bar on phones. */
function SelectionPanel({ u, channel, sel, setSel, occ, onContinue, busy, block }: SelProps & { channel: Channel; onContinue: () => void; busy: boolean; block?: string | null }) {
  const { t3 } = useI18n();
  const ev = u.ev;
  const sc = u.scheme!;
  const items = buildItems(u, sel);
  const total = itemsTotal(items);
  const n = itemCount(items);
  const types = visibleTypes(ev);
  const usesTypes = pricingOf(ev.kind) === 'types';
  const cta = channel === 'box' ? t3('Sotuvni rasmiylashtirish', 'Оформить продажу', 'Check out') : t3('Davom etish', 'Продолжить', 'Continue');
  const rows = sel.items.map((it, i) => ({ it, i, item: buildItems(u, { ...sel, items: [it] })[0] })).filter((r) => r.item);
  const remove = (i: number) => setSel((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }));
  return (
    <>
      <aside id="selection" className="rounded-[var(--radius-card)] bg-white p-4 shadow-[var(--shadow-card)] md:p-5 lg:sticky lg:top-24">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-lg font-bold">{t3('Tanlangan', 'Выбрано', 'Your selection')}</h3>
          <span className="text-xs text-ink-3">{t3('bir xaridda {n} tagacha chipta', 'не больше {n} билетов в одной покупке', 'up to {n} tickets per purchase', { n: MAX_PER_ORDER })}</span>
        </div>
        {rows.length ? (
          <ul className="mt-3 divide-y divide-line">
            {rows.map(({ it, i, item }) => {
              const el = sc.els.find((e) => e.id === it.elId)!;
              const tyId = item.k === 'seat' ? item.typeId : null;
              const ty = tyId ? types.find((x) => x.id === tyId) : null;
              const qty = item.k === 'zone' ? item.qty : 1;
              return (
                <li key={it.k + (it.k === 'seat' ? it.key : it.elId)} className="py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="leading-snug font-semibold">{tl(item.label)}</div>
                      {item.k === 'seat' && (
                        <span className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-ink-3">
                          <i className="inline-block size-2.5 rounded-full" style={{ background: catOf(sc, item.cat).color }} />
                          {tl(catOf(sc, item.cat).name)}
                        </span>
                      )}
                      {item.k === 'table' && (
                        <span className="mt-0.5 block text-sm text-ink-3">
                          {nSeats(item.seats.length)}
                          {channel === 'online' ? ' · ' + t3('har bir joyga alohida QR', 'отдельный QR на каждое место', 'a separate QR per seat') : ''}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{sum(item.price * qty)}</span>
                    <button type="button" onClick={() => remove(i)} className="-mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-black/5 hover:text-ink" aria-label={t3('Olib tashlash', 'Убрать', 'Remove')}>
                      <X className="size-4" />
                    </button>
                  </div>
                  {it.k === 'zone' && item.k === 'zone' && (
                    <div className="mt-2 flex items-center gap-3">
                      <Stepper
                        value={it.qty}
                        min={1}
                        max={Math.max(1, Math.min((el.limit || 0) - (occ.zones[el.id] || 0), MAX_PER_ORDER - (n - it.qty)))}
                        onChange={(v) => setSel((s) => ({ ...s, items: s.items.map((x, j) => (j === i && x.k === 'zone' ? { ...x, qty: v } : x)) }))}
                      />
                      <span className="text-sm text-ink-3">× {sum(item.price)}</span>
                    </div>
                  )}
                  {usesTypes && it.k === 'seat' && item.k === 'seat' && types.length > 0 && (
                    <div className="mt-2">
                      <Select
                        value={item.typeId || ''}
                        onChange={(e) => setSel((s) => ({ ...s, items: s.items.map((x, j) => (j === i && x.k === 'seat' ? { ...x, typeId: e.target.value } : x)) }))}
                        className="h-10 text-sm"
                        aria-label={t3('Chipta turi', 'Тип билета', 'Ticket type')}
                      >
                        {types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {tl(t.name)} — {sum(seatPrice(ev, el, item.cat, t.id))}
                          </option>
                        ))}
                      </Select>
                      {ty && typeReq(ty) && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-sm text-warn">
                          <Info className="mt-0.5 size-4 shrink-0" />
                          {typeReq(ty)}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-ink-3">{t3('Hozircha hech narsa tanlanmagan.', 'Пока ничего не выбрано.', 'Nothing selected yet.')}</p>
        )}
        {n > 0 && (
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3">
            <span className="text-ink-2">
              {t3('Jami', 'Итого', 'Total')} · {nTickets(n)}
            </span>
            <b className="text-xl tabular-nums">{sum(total)}</b>
            {channel === 'online' && <span className="w-full text-right text-sm text-ink-3">{usd(total)}</span>}
          </div>
        )}
        {block && n > 0 && <p className="mt-3 text-sm font-medium text-bad">{block}</p>}
        <Button block size="lg" className="mt-4 hidden lg:inline-flex" disabled={!n || !!block} loading={busy} onClick={onContinue}>
          {cta}
          {n ? ` · ${sum(total)}` : ''}
        </Button>
      </aside>
      {n > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <a href="#selection" className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm text-ink-3">
                <Ticket className="size-4" />
                {nTickets(n)}
              </div>
              <div className="font-bold tabular-nums">{sum(total)}</div>
            </a>
            <Button size="lg" className="px-6" disabled={!!block} loading={busy} onClick={onContinue}>
              {cta}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** Fan zone: "− n +" counter, "Only N left" under 20, never more than stock or the purchase limit (US-27). */
function ZoneModal({ u, el, sel, setSel, occ, onClose }: SelProps & { el: SchemeEl; onClose: () => void }) {
  const { t3 } = useI18n();
  const cur = sel.items.find((x): x is Extract<SelItem, { k: 'zone' }> => x.k === 'zone' && x.elId === el.id);
  const left = Math.max(0, (el.limit || 0) - (occ.zones[el.id] || 0));
  const others = selCount(u, sel) - (cur ? cur.qty : 0);
  const max = Math.max(0, Math.min(left, MAX_PER_ORDER - others));
  const [qty, setQty] = useState(cur ? Math.min(cur.qty, Math.max(max, 1)) : Math.min(1, max));
  const p = zonePrice(u.ev, el);
  const save = () => {
    setSel((s) => {
      const has = s.items.some((x) => x.k === 'zone' && x.elId === el.id);
      return { ...s, items: has ? s.items.map((x) => (x.k === 'zone' && x.elId === el.id ? { ...x, qty } : x)) : [...s.items, { k: 'zone', elId: el.id, qty }] };
    });
    onClose();
  };
  const drop = () => {
    setSel((s) => ({ ...s, items: s.items.filter((x) => !(x.k === 'zone' && x.elId === el.id)) }));
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={el.name}
      footer={
        <>
          {cur && (
            <Button variant="ghost" onClick={drop}>
              {t3('Olib tashlash', 'Убрать', 'Remove')}
            </Button>
          )}
          <Button onClick={save} disabled={!left || qty < 1}>
            {cur ? t3('Saqlash', 'Сохранить', 'Save') : t3('Qoʻshish', 'Добавить', 'Add')} · {sum(p * qty)}
          </Button>
        </>
      }
    >
      <p className="flex items-center gap-2 text-ink-2">
        <Users className="size-5" />
        {t3('Tik turish joylari, raqamsiz', 'Стоячие места, без номеров', 'Standing, no seat numbers')}
      </p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-2xl font-bold tabular-nums">{sum(p)}</span>
        {left > 0 && <Stepper value={qty} min={1} max={Math.max(1, max)} onChange={setQty} />}
      </div>
      <div className="mt-3 space-y-1.5">
        {left === 0 ? (
          <Badge tone="bad">{t3('Sotib boʻlingan', 'Распродано', 'Sold out')}</Badge>
        ) : left < 20 ? (
          <p className="font-semibold text-warn">{t3('{n} ta qoldi', 'Осталось {n}', 'Only {n} left', { n: left })}</p>
        ) : null}
        {left > 0 && max < left && <p className="text-sm text-ink-3">{t3('Bir xarid limiti — {n} ta chipta', 'Лимит одной покупки — {n} билетов', 'Limit per purchase: {n} tickets', { n: MAX_PER_ORDER })}</p>}
      </div>
    </Modal>
  );
}

/** Table: "Whole table — price" and/or "Individual seats — price per seat"; unavailable options greyed with the reason (US-28). */
function TableModal({ u, el, sel, occ, onWhole, onSeat, onClose }: SelProps & { el: SchemeEl; onWhole: () => void; onSeat: (key: string) => void; onClose: () => void }) {
  const { t3 } = useI18n();
  const ss = seatsOf(el);
  const wholeHeld = occ.wholeTables.has(el.id);
  const free = wholeHeld ? [] : ss.filter((x) => !occ.seats.has(x.key));
  const wholeSel = sel.items.some((x) => x.k === 'table' && x.elId === el.id);
  const pw = tablePrice(u.ev, el, true);
  const ps = el.type === 'table' ? seatPrice(u.ev, el, el.cat || 'std', null) : 0;
  const own = sel.items.filter((x) => x.k === 'seat' && x.elId === el.id).length;
  const n = selCount(u, sel);
  let wholeWhy = '';
  if (wholeHeld) wholeWhy = t3('Stol band', 'Стол уже занят', 'The table is taken');
  else if (free.length < ss.length) wholeWhy = t3('{m} ta joydan {n} tasi sotilgan yoki bronda', '{n} из {m} мест уже продано или в брони', '{n} of {m} seats are already sold or on hold', { n: ss.length - free.length, m: ss.length });
  else if (!wholeSel && n - own + ss.length > MAX_PER_ORDER) wholeWhy = limitText();
  const seatsWhy = wholeHeld ? t3('Stol band', 'Стол уже занят', 'The table is taken') : free.length === 0 ? t3('Boʻsh joy yoʻq', 'Свободных мест нет', 'No free seats') : '';
  return (
    <Modal
      open
      onClose={onClose}
      title={t3('Stol {n}', 'Стол {n}', 'Table {n}', { n: el.name })}
      footer={<Button onClick={onClose}>{t3('Tayyor', 'Готово', 'Done')}</Button>}
    >
      <p className="text-ink-2">{t3('Stoldagi joylar: {n}, boʻsh: {f}', 'Мест за столом: {n}, свободно: {f}', 'Seats at the table: {n}, free: {f}', { n: ss.length, f: free.length })}</p>
      <div className="mt-4 space-y-3">
        {el.mode !== 'seats' && (
          <button
            type="button"
            onClick={onWhole}
            disabled={!!wholeWhy && !wholeSel}
            className={cn('flex w-full flex-col items-start gap-0.5 rounded-2xl border-2 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', wholeSel ? 'border-ink bg-brand-soft' : 'border-line hover:border-ink')}
          >
            <span className="flex w-full items-baseline justify-between gap-3">
              <b>{t3('Butun stol', 'Весь стол', 'Whole table')}</b>
              <span className="font-bold tabular-nums">{pw ? sum(pw) : '—'}</span>
            </span>
            <small className={wholeWhy && !wholeSel ? 'text-bad' : 'text-ink-3'}>{wholeWhy && !wholeSel ? wholeWhy : wholeSel ? t3('Tanlangan — bosib bekor qiling', 'Выбрано — нажмите, чтобы снять', 'Selected: tap to remove') : nSeats(ss.length)}</small>
          </button>
        )}
        {el.mode !== 'whole' && (
          <div className={cn('rounded-2xl border-2 border-line p-4', (seatsWhy || wholeSel) && 'opacity-60')}>
            <div className="flex items-baseline justify-between gap-3">
              <b>{t3('Alohida joylar', 'Отдельные места', 'Individual seats')}</b>
              <span className="font-bold tabular-nums">
                {sum(ps)} <span className="text-sm font-normal text-ink-3">{t3('bir joy uchun', 'за место', 'per seat')}</span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ss.map((x) => {
                const on = sel.items.some((i) => i.k === 'seat' && i.key === x.key);
                const taken = (occ.seats.has(x.key) || wholeHeld || wholeSel) && !on;
                return (
                  <button key={x.key} type="button" disabled={taken} onClick={() => onSeat(x.key)} className={cn('grid size-11 place-items-center rounded-xl border-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:border-line disabled:bg-seat-taken disabled:text-ink-3', on ? 'border-ink bg-ink text-white' : 'border-line-2 hover:border-ink')} aria-pressed={on}>
                    {x.n}
                  </button>
                );
              })}
            </div>
            {(seatsWhy || wholeSel) && <small className="mt-2 block text-ink-3">{wholeSel ? t3('Butun stol tanlangan', 'Выбран весь стол', 'The whole table is selected') : seatsWhy}</small>}
          </div>
        )}
      </div>
    </Modal>
  );
}
