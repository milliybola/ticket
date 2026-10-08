/* Step 4: prices. Concert-like events price each plan element (US-17); theatre, cinema and museums sell ticket types (US-18). */
import { ArrowDown, ArrowRight, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { tl, useI18n } from '../../lib/i18n';
import { nfmt, sum, usd } from '../../lib/format';
import { byId, clone } from '../../lib/util';
import { getDb, tx, useDb } from '../../store/db';
import { eventCats, evTitle, logAct, pricingOf, rowNumber } from '../../domain/rules';
import { catOf, elTypeName, seatCount, seatsOf, sellables } from '../../domain/scheme';
import type { EventItem, PriceTier, SchemeEl, TicketType } from '../../domain/types';
import { SchemeLegend, SchemeView } from '../../components/scheme/SchemeView';
import { Badge, Button, cn, Empty, Field, IconButton, Notice, Select, toast } from '../../components/ui';
import { adultType, empty3, has3, PASSPORT, trim3 } from './helpers';
import { ErrText, L3Input, parsePrice, priceError, PriceInput, priceStr, pubConfirm, Section } from './ui';

export function PricesStep({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  return pricingOf(ev.kind) === 'element' ? <ElementPrices key={ev.schemeId || ''} ev={ev} ro={ro} onNext={onNext} /> : <TypePrices key={ev.venueId || ''} ev={ev} ro={ro} onNext={onNext} />;
}

// ---------------------------------------------------------------- per element (concert, sport, event)

const tableModeName = (el: SchemeEl, t3: (u: string, r: string, e: string) => string) =>
  ({ whole: t3('butun', 'целиком', 'whole'), seats: t3('joylar boʻyicha', 'по местам', 'by seat'), both: t3('butun va joylar boʻyicha', 'целиком и по местам', 'whole and by seat') })[el.mode || 'seats'];

function ElementPrices({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const sc = ev.schemeId ? db.schemes[ev.schemeId] : undefined;
  const els = useMemo(() => (sc ? sellables(sc) : []), [sc]);
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const el of els) {
      if (el.type === 'table') {
        o['pw_' + el.id] = priceStr(ev.prices.tables[el.id]?.whole);
        o['ps_' + el.id] = priceStr(ev.prices.tables[el.id]?.seat);
      } else o['p_' + el.id] = priceStr(ev.prices.els[el.id]);
    }
    return o;
  });
  // price tiers by row range, kept as text while editing
  const [tiers, setTiers] = useState<Record<string, TierText[]>>(() => {
    const o: Record<string, TierText[]> = {};
    for (const [id, list] of Object.entries(ev.prices.rows || {})) o[id] = list.map((t) => ({ from: String(t.from), to: String(t.to), price: priceStr(t.price) }));
    return o;
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const bad = useMemo(() => new Set(Object.keys(err).filter((k) => err[k]).map((k) => k.replace(/^p[ws]?_/, '').replace(/^t_(.+)_d+$/, '$1'))), [err]);
  if (!sc || !els.length)
    return <Empty title={t3('Sxemada sektorlar yoʻq', 'В схеме нет секторов', 'The plan has no sectors')}>{t3('Maydon sxemasini sozlang va «Sxema» qadamida qayta nusxalang.', 'Настройте схему площадки и скопируйте её заново на шаге «Схема».', 'Set up the venue plan and copy it again on the "Seating plan" step.')}</Empty>;

  const setV = (k: string, v: string) => {
    setVals((o) => ({ ...o, [k]: v }));
    if (err[k]) setErr((e) => ({ ...e, [k]: '' }));
  };
  const save = async (next: boolean) => {
    const e: Record<string, string> = {};
    const np: EventItem['prices'] = { els: {}, tables: {}, rows: {} };
    const chk = (k: string) => {
      const m = priceError(vals[k] || '');
      if (m) e[k] = m;
      return parsePrice(vals[k] || '') || 0;
    };
    for (const el of els) {
      if (el.type === 'table') {
        np.tables[el.id] = {};
        if (el.mode !== 'seats') np.tables[el.id].whole = chk('pw_' + el.id);
        if (el.mode !== 'whole') np.tables[el.id].seat = chk('ps_' + el.id);
      } else if ((tiers[el.id] || []).length && el.type !== 'fan') {
        // with row tiers the base price is optional: it covers only the rows no tier names
        const [lo, hi] = rowSpan(el);
        const list: PriceTier[] = [];
        (tiers[el.id] || []).forEach((t, i) => {
          const k = `t_${el.id}_${i}`;
          const from = rowNumber(t.from.trim());
          const to = rowNumber(t.to.trim());
          const pe = priceError(t.price);
          if (!(from >= lo && to <= hi && from <= to)) e[k] = t3('Qatorlar {a}–{b} oraligʻida boʻlsin', 'Ряды должны быть в пределах {a}–{b}', 'Rows must be within {a}–{b}', { a: lo, b: hi });
          else if (pe) e[k] = pe;
          else if (list.some((x) => from <= x.to && to >= x.from)) e[k] = t3('Qatorlar oraligʻi boshqasi bilan kesishadi', 'Диапазон рядов пересекается с другим', 'This row range overlaps another one');
          else list.push({ from, to, price: parsePrice(t.price) || 0 });
        });
        np.rows![el.id] = list.sort((a, b) => a.from - b.from);
        const covered = (r: number) => list.some((x) => r >= x.from && r <= x.to);
        const needBase = seatsOf(el).some((st) => !covered(rowNumber(st.row)));
        if (needBase || (vals['p_' + el.id] || '').trim()) np.els[el.id] = chk('p_' + el.id);
      } else np.els[el.id] = chk('p_' + el.id);
    }
    setErr(e);
    const firstBad = Object.keys(e)[0];
    if (firstBad) {
      setFocus(firstBad.replace(/^p[ws]?_/, '').replace(/^t_(.+)_\d+$/, '$1'));
      toast(t3('Belgilangan narxlarni tekshiring', 'Проверьте подсвеченные цены', 'Check the highlighted prices'), 'bad');
      return;
    }
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      const old = x.prices;
      const changes: string[] = [];
      for (const el of els) {
        if (el.type === 'table') {
          for (const k of ['whole', 'seat'] as const) {
            const a = old.tables[el.id]?.[k];
            const b = np.tables[el.id]?.[k];
            if (a && b && a !== b) changes.push(`${t3('Stol', 'Стол', 'Table')} ${el.name} (${k === 'whole' ? t3('butun', 'целиком', 'whole') : t3('joy', 'место', 'seat')}): ${nfmt(a)} → ${nfmt(b)}`);
          }
        } else if (old.els[el.id] && old.els[el.id] !== np.els[el.id]) changes.push(`${el.name}: ${nfmt(old.els[el.id])} → ${nfmt(np.els[el.id])}`);
      }
      x.prices = np;
      if (changes.length && x.status === 'published') logAct('price-change', evTitle(x), changes.join('; '));
      else logAct('event-update', evTitle(x), t3('narxlar', 'цены', 'prices'));
    });
    toast(t3('Narxlar saqlandi', 'Цены сохранены', 'Prices saved'), 'ok');
    if (next) onNext();
  };

  const priceCell = (k: string, label?: string) => (
    <div className="min-w-40">
      {label && <span className="mb-1 block text-xs text-ink-3">{label}</span>}
      <PriceInput value={vals[k] || ''} invalid={!!err[k]} onChange={(v) => setV(k, v)} />
      {!err[k] && parsePrice(vals[k] || '') ? <span className="mt-0.5 block text-xs text-ink-3">{usd(parsePrice(vals[k] || '') || 0)}</span> : null}
      <ErrText>{err[k]}</ErrText>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Section title={t3('Sektorlar boʻyicha narxlar', 'Цены по секторам', 'Prices by sector')} sub={t3('Narx konsertning barcha seanslari uchun bitta. Xaridor narxni soʻmda, turist esa dollardagi taxminini koʻradi.', 'Цена одна для всех сеансов. Покупатель видит цену в сумах, турист — ориентир в долларах.', 'The price is the same for all sessions. Buyers see it in soʻm, tourists also see a dollar estimate.')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-line text-sm text-ink-3">
                  <th className="py-2 pr-3 font-medium">{t3('Sektor yoki zona', 'Сектор или зона', 'Sector or zone')}</th>
                  <th className="py-2 pr-3 font-medium">{t3('Joy / limit', 'Мест / лимит', 'Seats / limit')}</th>
                  <th className="py-2 font-medium">{t3('Narx', 'Цена', 'Price')}</th>
                </tr>
              </thead>
              <tbody>
                {els.map((el) => (
                  <tr key={el.id} className={cn('border-b border-line align-top last:border-0', focus === el.id && 'bg-brand-soft/50')} onMouseEnter={() => setFocus(el.id)} onFocus={() => setFocus(el.id)}>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2">
                        <i className="inline-block size-3 shrink-0 rounded-full" style={{ background: catOf(sc, el.cat).color }} />
                        <b>{el.type === 'table' ? t3('Stol {n}', 'Стол {n}', 'Table {n}', { n: el.name }) : el.name}</b>
                      </span>
                      <span className="text-xs text-ink-3">
                        {elTypeName(el.type)}
                        {el.type === 'table' && ' · ' + tableModeName(el, t3)}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-sm tabular-nums">{el.type === 'fan' ? t3('limit {n}', 'лимит {n}', 'limit {n}', { n: el.limit || 0 }) : t3('{n} joy', '{n} мест', '{n} seats', { n: seatCount(el) })}</td>
                    <td className="py-3">
                      {el.type === 'table' ? (
                        <div className="flex flex-wrap gap-3">
                          {el.mode !== 'seats' && priceCell('pw_' + el.id, t3('Butun stol', 'Весь стол', 'Whole table'))}
                          {el.mode !== 'whole' && priceCell('ps_' + el.id, t3('Bitta joy', 'Одно место', 'One seat'))}
                        </div>
                      ) : el.type === 'fan' ? (
                        priceCell('p_' + el.id)
                      ) : (
                        <RowTiers el={el} base={priceCell('p_' + el.id, (tiers[el.id] || []).length ? t3('Qolgan qatorlar', 'Остальные ряды', 'Other rows') : undefined)} tiers={tiers[el.id] || []} err={err} ro={ro} onChange={(list) => setTiers((o) => ({ ...o, [el.id]: list }))} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ev.status === 'published' && <p className="mt-3 text-xs text-ink-3">{t3('Sotilgan chiptalar va bronlar eski narxda qoladi.', 'Проданные билеты и брони остаются по старой цене.', 'Sold tickets and holds keep their price.')}</p>}
        </Section>
        <div className="xl:sticky xl:top-6 xl:self-start">
          <Section title={t3('Sxema', 'Схема', 'Plan')}>
            <SchemeView scheme={sc} mode="preview" focus={focus} bad={bad} height={400} />
            <div className="mt-3">
              <SchemeLegend scheme={sc} />
            </div>
          </Section>
        </div>
      </div>
      {!ro && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => save(false)}>
            {t3('Saqlash', 'Сохранить', 'Save')}
          </Button>
          <Button onClick={() => save(true)}>
            {t3('Saqlash va davom etish', 'Сохранить и дальше', 'Save and continue')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

type TierText = { from: string; to: string; price: string };

/** First and last row number of a sector. */
function rowSpan(el: SchemeEl): [number, number] {
  const ns = seatsOf(el).map((st) => rowNumber(st.row));
  return ns.length ? [Math.min(...ns), Math.max(...ns)] : [1, 1];
}

/** Prices by row range inside one sector: "rows 1–5: 500 000, 6–12: 350 000, 13–20: 250 000". */
function RowTiers({ el, base, tiers, err, ro, onChange }: { el: SchemeEl; base: React.ReactNode; tiers: TierText[]; err: Record<string, string>; ro: boolean; onChange: (t: TierText[]) => void }) {
  const { t3 } = useI18n();
  const [lo, hi] = rowSpan(el);
  const split = (n: number) => {
    const total = hi - lo + 1;
    const out: TierText[] = [];
    for (let i = 0; i < n; i++) {
      const a = lo + Math.round((i * total) / n);
      const b = lo + Math.round(((i + 1) * total) / n) - 1;
      if (b >= a) out.push({ from: String(a), to: String(b), price: tiers[i]?.price || '' });
    }
    onChange(out);
  };
  return (
    <div className="max-w-sm space-y-2">
      {base}
      {tiers.length > 0 && (
        <div className="space-y-2 rounded-xl bg-black/[0.03] p-2">
          {tiers.map((t, i) => {
            const k = `t_${el.id}_${i}`;
            const set = (patch: Partial<TierText>) => onChange(tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i}>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="text-ink-3">{t3('Qator', 'Ряды', 'Rows')}</span>
                  <input disabled={ro} value={t.from} onChange={(e) => set({ from: e.target.value })} className="h-9 w-12 rounded-lg border border-line-2 bg-white px-2 text-center" aria-label={t3('dan', 'с', 'from')} />
                  <span>–</span>
                  <input disabled={ro} value={t.to} onChange={(e) => set({ to: e.target.value })} className="h-9 w-12 rounded-lg border border-line-2 bg-white px-2 text-center" aria-label={t3('gacha', 'по', 'to')} />
                  <div className="min-w-36 flex-1">
                    <PriceInput value={t.price} invalid={!!err[k]} onChange={(v) => set({ price: v })} />
                  </div>
                  {!ro && (
                    <IconButton label={t3('Oʻchirish', 'Удалить', 'Remove')} className="size-8" onClick={() => onChange(tiers.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  )}
                </div>
                <ErrText>{err[k]}</ErrText>
              </div>
            );
          })}
        </div>
      )}
      {!ro && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="soft" onClick={() => onChange([...tiers, { from: String(lo), to: String(hi), price: '' }])}>
            <Plus className="size-3.5" />
            {t3('Qatorlar boʻyicha narx', 'Цена по рядам', 'Price by rows')}
          </Button>
          {[2, 3].map((n) => (
            <Button key={n} size="sm" variant="ghost" onClick={() => split(n)}>
              {t3('{n} ta zona', '{n} зоны', '{n} zones', { n })}
            </Button>
          ))}
        </div>
      )}
      <span className="block text-xs text-ink-3">{t3('Qatorlar: {a}–{b}', 'Ряды: {a}–{b}', 'Rows: {a}–{b}', { a: lo, b: hi })}</span>
    </div>
  );
}

// ---------------------------------------------------------------- ticket types (theatre, cinema, museum)

const typeSold = (evId: string, typeId: string) => getDb().tickets.filter((t) => t.ev === evId && t.ty === typeId).length;

function TypePrices({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  const { t3 } = useI18n();
  useDb();
  const museum = ev.kind === 'museum';
  const cats = museum ? [] : eventCats(ev);
  const [list, setList] = useState<TicketType[]>(() => clone(ev.types).sort((a, b) => a.order - b.order));
  const [pv, setPv] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const t of ev.types) {
      if (museum) o[t.id + '|'] = priceStr(t.price);
      else for (const c of cats) o[t.id + '|' + c.id] = priceStr((t.prices || {})[c.id]);
    }
    return o;
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const sc = ev.kind === 'cinema' ? undefined : ev.schemeId ? getDb().schemes[ev.schemeId] : undefined;

  const patch = (i: number, p: Partial<TicketType>) => setList((l) => l.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const move = (i: number, d: number) =>
    setList((l) => {
      const n = l.slice();
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const add = () => setList((l) => [...l, { ...adultType(ev.kind, l.length), name: empty3(), passport: museum ? 'citizen' : 'none' }]);
  const remove = (i: number) => {
    const t = list[i];
    if (typeSold(ev.id, t.id)) {
      patch(i, { hidden: true });
      toast(t3('Bu tur sotilgan — u sotuvdan yashirildi, sotilgan chiptalar amal qiladi', 'Тип уже продавался — он скрыт из продажи, проданные билеты действуют', 'This type has sales, so it’s hidden from sale; sold tickets stay valid'), 'warn');
    } else setList((l) => l.filter((_, j) => j !== i));
  };

  const save = async (next: boolean) => {
    const e: Record<string, string> = {};
    const out: TicketType[] = list.map((t, i) => {
      const nt: TicketType = { ...t, name: trim3(t.name), req: t.req && has3(t.req) ? trim3(t.req) : null, order: i };
      if (!has3(nt.name)) e[t.id + ':name'] = t3('Nomini kiriting', 'Укажите название', 'Enter a name');
      else if ([nt.name.uz, nt.name.ru, nt.name.en].some((s) => s.length > 40)) e[t.id + ':name'] = t3('40 belgidan oshmasin', 'Не больше 40 символов', 'Up to 40 characters');
      if (museum) {
        const k = t.id + '|';
        const m = priceError(pv[k] || '');
        if (m) e[k] = m;
        nt.price = parsePrice(pv[k] || '') || 0;
        nt.prices = undefined;
      } else {
        const ps: Record<string, number> = { ...(t.prices || {}) };
        for (const c of cats) {
          const k = t.id + '|' + c.id;
          if (priceError(pv[k] || '')) e[k] = t3('«{c}» toifasi uchun narxni kiriting', 'Укажите цену для категории «{c}»', 'Enter a price for "{c}"', { c: tl(c.name) });
          ps[c.id] = parsePrice(pv[k] || '') || 0;
        }
        nt.prices = ps;
        nt.price = undefined;
      }
      return nt;
    });
    setErr(e);
    if (Object.keys(e).length) {
      toast(t3('Belgilangan maydonlarni tekshiring', 'Проверьте подсвеченные поля', 'Check the highlighted fields'), 'bad');
      return;
    }
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      const changes: string[] = [];
      let priceChanged = false;
      for (const t of out) {
        const old = x.types.find((o) => o.id === t.id);
        if (!old) {
          changes.push(t3('yangi tur «{t}»', 'новый тип «{t}»', 'new type "{t}"', { t: tl(t.name) }));
          continue;
        }
        if (museum && old.price && old.price !== t.price) {
          changes.push(`${tl(t.name)}: ${nfmt(old.price)} → ${nfmt(t.price || 0)}`);
          priceChanged = true;
        }
        for (const c of cats) {
          const a = (old.prices || {})[c.id];
          const b = (t.prices || {})[c.id];
          if (a && a !== b) {
            changes.push(`${tl(t.name)} / ${tl(c.name)}: ${nfmt(a)} → ${nfmt(b || 0)}`);
            priceChanged = true;
          }
        }
        if (!old.hidden && t.hidden) changes.push(t3('«{t}» yashirildi', '«{t}» скрыт', '"{t}" hidden', { t: tl(t.name) }));
        if (old.hidden && !t.hidden) changes.push(t3('«{t}» sotuvga qaytdi', '«{t}» снова в продаже', '"{t}" back on sale', { t: tl(t.name) }));
      }
      for (const old of x.types) if (!out.some((t) => t.id === old.id)) changes.push(t3('«{t}» oʻchirildi', 'удалён «{t}»', 'deleted "{t}"', { t: tl(old.name) }));
      x.types = out;
      logAct(priceChanged && x.status === 'published' ? 'price-change' : 'type-change', evTitle(x), changes.join('; ') || t3('chipta turlari', 'типы билетов', 'ticket types'));
    });
    setList(clone(out));
    toast(t3('Chipta turlari saqlandi', 'Типы билетов сохранены', 'Ticket types saved'), 'ok');
    if (next) onNext();
  };

  return (
    <div className="space-y-6">
      <Section
        title={t3('Chipta turlari', 'Типы билетов', 'Ticket types')}
        sub={
          museum
            ? t3('Har bir tur uchun kimga moʻljallanganini belgilang: xaridordan qaysi pasport maʼlumotlari soʻralishi shunga bogʻliq.', 'Для каждого типа отметьте, для кого он: от этого зависит, какие паспортные данные спросят у покупателя.', 'Mark who each type is for: it decides which passport details the buyer is asked for.')
            : t3('Har bir tur uchun har bir joy toifasiga narx kiriting. Talab xaridorga toʻlovdan oldin, kassirga va kirishda koʻrsatiladi.', 'Для каждого типа задайте цену на каждую категорию мест. Требование видят покупатель до оплаты, кассир и контролёр на входе.', 'Set a price per seat category for each type. The requirement is shown to the buyer before paying, to the cashier and at the entry.')
        }
      >
        {!museum && cats.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <span className="text-ink-3">{t3('Joy toifalari:', 'Категории мест:', 'Seat categories:')}</span>
            {cats.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5">
                <i className="inline-block size-3 rounded-full" style={{ background: c.color }} />
                {tl(c.name)}
              </span>
            ))}
          </div>
        )}
        <div className="space-y-4">
          {list.map((t, i) => {
            const sold = typeSold(ev.id, t.id);
            return (
              <fieldset key={t.id} className={cn('rounded-2xl border border-line p-4', t.hidden && 'bg-page')}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="flex">
                    <IconButton label={t3('Yuqoriga', 'Выше', 'Up')} disabled={i === 0} onClick={() => move(i, -1)} className="size-8">
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton label={t3('Pastga', 'Ниже', 'Down')} disabled={i === list.length - 1} onClick={() => move(i, 1)} className="size-8">
                      <ArrowDown className="size-4" />
                    </IconButton>
                  </span>
                  <b className="min-w-0 flex-1 truncate">{tl(t.name) || t3('Yangi tur', 'Новый тип', 'New type')}</b>
                  {t.hidden && <Badge tone="warn">{t3('Sotuvdan yashirilgan', 'Скрыт из продажи', 'Hidden from sale')}</Badge>}
                  {sold > 0 && <Badge>{t3('{n} sotilgan', 'продано {n}', '{n} sold', { n: sold })}</Badge>}
                  <Button variant="ghost" size="sm" onClick={() => patch(i, { hidden: !t.hidden })}>
                    {t.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    {t.hidden ? t3('Sotuvga qaytarish', 'Вернуть в продажу', 'Back on sale') : t3('Yashirish', 'Скрыть', 'Hide')}
                  </Button>
                  <IconButton label={t3('Oʻchirish', 'Удалить', 'Delete')} onClick={() => remove(i)} className="size-8 text-bad">
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 text-sm font-medium text-ink-2">
                      {t3('Nomi', 'Название', 'Name')}
                      <span className="text-bad"> *</span>
                    </div>
                    <L3Input value={t.name} max={40} invalid={!!err[t.id + ':name']} onChange={(v) => patch(i, { name: v })} />
                    <ErrText>{err[t.id + ':name']}</ErrText>
                  </div>
                  {museum ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t3('Narx', 'Цена', 'Price')} required>
                        <PriceInput value={pv[t.id + '|'] || ''} invalid={!!err[t.id + '|']} onChange={(v) => setPv((o) => ({ ...o, [t.id + '|']: v }))} />
                        <ErrText>{err[t.id + '|']}</ErrText>
                      </Field>
                      <Field label={t3('Pasport', 'Паспорт', 'Passport')} required>
                        <Select value={t.passport} onChange={(e) => patch(i, { passport: e.target.value as TicketType['passport'] })}>
                          {(['citizen', 'foreigner', 'none'] as const).map((p) => (
                            <option key={p} value={p}>
                              {tl(PASSPORT[p])}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {cats.map((c) => {
                        const k = t.id + '|' + c.id;
                        return (
                          <Field
                            key={c.id}
                            label={
                              <span className="inline-flex items-center gap-1.5">
                                <i className="inline-block size-3 rounded-full" style={{ background: c.color }} />
                                {tl(c.name)}
                              </span>
                            }
                            required
                          >
                            <PriceInput value={pv[k] || ''} invalid={!!err[k]} onChange={(v) => setPv((o) => ({ ...o, [k]: v }))} />
                            <ErrText>{err[k]}</ErrText>
                          </Field>
                        );
                      })}
                    </div>
                  )}
                  <div>
                    <div className="mb-1.5 text-sm font-medium text-ink-2">{t3('Talab', 'Требование', 'Requirement')}</div>
                    <L3Input value={t.req || empty3()} max={200} placeholder={t3('Masalan, talabalik guvohnomasini koʻrsating', 'Например, предъявите студенческий', 'E.g. show your student ID')} onChange={(v) => patch(i, { req: v })} />
                    <span className="mt-1 block text-xs text-ink-3">{t3('Xaridorga toʻlovdan oldin, kassirga va kirishdagi xodimga koʻrsatiladi.', 'Показывается покупателю до оплаты, кассиру и сотруднику на входе.', 'Shown to the buyer before paying, to the cashier and at the entry.')}</span>
                  </div>
                </div>
              </fieldset>
            );
          })}
          {!list.length && <Notice tone="warn">{t3('Kamida bitta chipta turini qoʻshing', 'Добавьте хотя бы один тип билета', 'Add at least one ticket type')}</Notice>}
        </div>
        {!ro && (
          <div className="mt-4">
            <Button variant="outline" onClick={add}>
              <Plus className="size-4" />
              {t3('Tur qoʻshish', 'Добавить тип', 'Add a type')}
            </Button>
          </div>
        )}
        {ev.status === 'published' && <p className="mt-3 text-xs text-ink-3">{t3('Sotilgan chiptalar va bronlar eski narxda qoladi.', 'Проданные билеты и брони остаются по старой цене.', 'Sold tickets and holds keep their price.')}</p>}
      </Section>
      {sc && (
        <Section title={t3('Tadbir sxemasi', 'Схема мероприятия', 'Event plan')}>
          <SchemeView scheme={sc} mode="preview" height={340} />
          <div className="mt-3">
            <SchemeLegend scheme={sc} priceOfCat={(cid) => {
              const first = list.find((t) => !t.hidden);
              const p = first ? parsePrice(pv[first.id + '|' + cid] || '') : null;
              return p ? sum(p) : null;
            }} />
          </div>
        </Section>
      )}
      {!ro && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => save(false)}>
            {t3('Saqlash', 'Сохранить', 'Save')}
          </Button>
          <Button onClick={() => save(true)}>
            {t3('Saqlash va davom etish', 'Сохранить и дальше', 'Save and continue')}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
