/*
 * Renders a seating plan as SVG, with zoom and pan (wheel, drag, pinch, buttons). One component for every screen:
 *  - overview: sectors filled with their category colour, price "from" and free seats (buyer, first step);
 *  - seats:    individual seats free / taken / mine, fan zones and tables clickable (buyer, box office);
 *  - preview:  the plan as the buyer will see it, without stock (organizer preview, moderator);
 *  - editor:   seats coloured by category, elements selectable and draggable (organizer editor).
 */
import { Maximize2, Minus, Plus } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { t3, tl, useI18n } from '../../lib/i18n';
import { sum } from '../../lib/format';
import { r1 } from '../../lib/util';
import { arcFramePath, catOf, catsUsed, elTransform, fitBox, labelPoint, localBox, removedSlots, rowLabelPoints, seatsOf, SEAT_R, SELLABLE, stageName, tableRadius } from '../../domain/scheme';
import type { BBox, Scheme, SchemeEl, Seat } from '../../domain/types';
import type { Occupancy } from '../../domain/rules';

export type SchemeMode = 'overview' | 'seats' | 'preview' | 'editor';

export type SchemeViewProps = {
  scheme: Scheme;
  mode: SchemeMode;
  occ?: Occupancy;
  /** Seat keys selected by the buyer / cashier. */
  sel?: Set<string>;
  /** Price of a seat; without a row it is the lowest price of the element ("from"). */
  price?: (el: SchemeEl, cat: string, row?: number | string) => number | null;
  /** Colour of a seat for buyers (e.g. by price level, like iticket); falls back to the seat category colour. */
  seatColor?: (el: SchemeEl, seat: Seat) => string | null | undefined;
  /** Zoom to this element when it changes. */
  focus?: string | null;
  bad?: Set<string>;
  onSeat?: (key: string, el: SchemeEl, seat: Seat) => void;
  onElement?: (el: SchemeEl) => void;
  // editor
  edSel?: string | null;
  seatEdit?: boolean;
  seatSel?: Set<string>;
  onEdSeat?: (el: SchemeEl, id: string, e: RPointerEvent) => void;
  onElPointerDown?: (e: RPointerEvent<SVGGElement>, el: SchemeEl) => void;
  onBgPointerDown?: (e: RPointerEvent<SVGSVGElement>, toPlan: (cx: number, cy: number) => { x: number; y: number }) => void;
  /** Extra SVG drawn on top in plan coordinates (editor selection box, guides). */
  overlay?: ReactNode;
  className?: string;
  /** Hide zoom buttons. */
  bare?: boolean;
  height?: number | string;
  /** Changing it fits the whole plan into view again. */
  viewKey?: string | number;
};

const EMPTY_OCC: Occupancy = { seats: new Map(), zones: {}, wholeTables: new Set(), slot: 0 };
const EMPTY_SET = new Set<string>();

export function SchemeView(p: SchemeViewProps) {
  useI18n();
  const { scheme: sc } = p;
  const fit = useMemo(() => fitBox(sc), [sc, sc.els.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const svgRef = useRef<SVGSVGElement>(null);
  const [vb, setVb] = useState<BBox>(fit);
  const fitKey = `${r1(fit.x)}|${r1(fit.y)}|${r1(fit.w)}|${r1(fit.h)}`;
  // Refit when the plan changes, except in the editor: there every edit makes a new plan object and the view
  // must stay where the organizer zoomed; the editor refits explicitly by changing `viewKey`.
  const viewKey = p.viewKey ?? (p.mode === 'editor' ? 'editor' : fitKey);
  useEffect(() => setVb(fit), [viewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // zoom to a focused element
  useEffect(() => {
    if (!p.focus) return;
    const el = sc.els.find((e) => e.id === p.focus);
    if (!el) return;
    const b = localBox(el);
    const m = 30;
    const box = { x: (el.x || 0) + b.x - m, y: (el.y || 0) + b.y - m, w: b.w + m * 2, h: b.h + m * 2 };
    setVb(box);
  }, [p.focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const toPlan = useCallback(
    (cx: number, cy: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = cx;
      pt.y = cy;
      const m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const r = pt.matrixTransform(m.inverse());
      return { x: r.x, y: r.y };
    },
    [],
  );

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setVb((v) => {
      const svg = svgRef.current;
      let px = v.x + v.w / 2;
      let py = v.y + v.h / 2;
      if (svg && cx != null && cy != null) {
        const pt = svg.createSVGPoint();
        pt.x = cx;
        pt.y = cy;
        const m = svg.getScreenCTM();
        if (m) {
          const r = pt.matrixTransform(m.inverse());
          px = r.x;
          py = r.y;
        }
      }
      const w = Math.min(Math.max(v.w * factor, 40), fit.w * 4);
      const h = (w / v.w) * v.h;
      return { x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h };
    });
  }, [fit.w]);

  // wheel zoom (needs a non-passive listener)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // drag to pan, pinch to zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; vb: BBox; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; vb: BBox } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (p.mode === 'editor' && p.onBgPointerDown && e.target === svgRef.current && e.button === 0 && !e.altKey && pointers.current.size === 0) {
      p.onBgPointerDown(e, toPlan);
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) panStart.current = { x: e.clientX, y: e.clientY, vb, moved: false };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), vb };
      panStart.current = null;
    }
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = svgRef.current;
    if (!svg) return;
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const f = pinch.current.d / Math.max(d, 1);
      const v0 = pinch.current.vb;
      const w = Math.min(Math.max(v0.w * f, 40), fit.w * 4);
      const h = (w / v0.w) * v0.h;
      setVb({ x: v0.x + (v0.w - w) / 2, y: v0.y + (v0.h - h) / 2, w, h });
      suppressClick.current = true;
      return;
    }
    const st = panStart.current;
    if (!st) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.moved && Math.hypot(dx, dy) < 5) return;
    if (!st.moved) {
      st.moved = true;
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const rect = svg.getBoundingClientRect();
    const scale = Math.max(st.vb.w / rect.width, st.vb.h / rect.height);
    setVb({ ...st.vb, x: st.vb.x - dx * scale, y: st.vb.y - dy * scale });
    suppressClick.current = true;
  };
  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      panStart.current = null;
      setTimeout(() => (suppressClick.current = false), 0);
    }
  };
  // stable, so the memoised plan body doesn't re-render while panning
  const guard = useCallback(
    (fn: () => void) => () => {
      if (suppressClick.current) return;
      fn();
    },
    [],
  );

  // the overlay, size and refit key are not part of the plan body: changing them must not redraw every seat
  const { overlay: _o, className: _c, bare: _b, height: _h, viewKey: _v, ...bodyProps } = p;
  return (
    <div className={'relative overflow-hidden rounded-2xl bg-[#fbfaf8] ' + (p.className || '')} style={{ height: p.height ?? 460 }}>
      <svg
        ref={svgRef}
        className={`scheme mode-${p.mode}`}
        viewBox={`${r1(vb.x)} ${r1(vb.y)} ${r1(vb.w)} ${r1(vb.h)}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t3('Zal sxemasi', 'Схема зала', 'Seating plan')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#f3f0ea" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#e2ddd2" strokeWidth="3" />
          </pattern>
        </defs>
        <SchemeBody {...bodyProps} guard={guard} />
        {p.overlay}
      </svg>
      {!p.bare && (
        <div className="no-print absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl bg-white shadow-md">
          <button type="button" className="grid size-9 place-items-center hover:bg-black/5" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
          <button type="button" className="grid size-9 place-items-center border-y border-line hover:bg-black/5" onClick={() => zoomAt(1.4)} aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <button type="button" className="grid size-9 place-items-center hover:bg-black/5" onClick={() => setVb(fit)} aria-label="Fit">
            <Maximize2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

type BodyProps = SchemeViewProps & { guard: (fn: () => void) => () => void };

/** The plan elements. Memoised: a big hall (2 000 seats) re-renders only when its inputs change. */
const SchemeBody = memo(function SchemeBody(p: BodyProps) {
  const { scheme: sc, mode } = p;
  const occ = p.occ || EMPTY_OCC;
  const sel = p.sel || EMPTY_SET;
  const order = sc.els.slice().sort((a, b) => (a.type === 'stage' || a.type === 'unknown' ? -1 : 0) - (b.type === 'stage' || b.type === 'unknown' ? -1 : 0));
  const out: ReactNode[] = [];
  for (const el of order) {
    const lb = localBox(el);
    const cat = catOf(sc, el.cat);
    const isSel = mode === 'editor' && p.edSel === el.id;
    // texts stay readable whatever the element's rotation (stands on the far side are turned 180°)
    const up = (x: number, y: number) => (el.rot ? `rotate(${-el.rot} ${r1(x)} ${r1(y)})` : undefined);
    const clickable = (mode === 'overview' && SELLABLE.includes(el.type)) || ((el.type === 'fan' || el.type === 'table') && mode === 'seats');
    const parts: ReactNode[] = [];
    const cx = lb.x + lb.w / 2;
    const cy = lb.y + lb.h / 2;
    if (el.type === 'stage') {
      parts.push(el.shape ? <ShapeNode key="s" el={el} cls="stage" /> : <rect key="s" x={0} y={0} width={el.w} height={el.h} rx={8} className="stage" />);
      parts.push(
        <text key="t" className="lbl lbl-stage" x={r1(cx)} y={r1(cy + 5)} transform={up(cx, cy + 5)} textAnchor="middle">
          {stageName(el.name).toUpperCase()}
        </text>,
      );
    } else if (el.type === 'unknown') {
      parts.push(el.shape ? <ShapeNode key="s" el={el} cls="unk" /> : <rect key="s" width={el.w || 100} height={el.h || 60} className="unk" />);
      parts.push(
        <text key="t" className="lbl" x={r1(cx)} y={r1(cy + 4)} transform={up(cx, cy + 4)} textAnchor="middle">
          ?
        </text>,
      );
    } else if (el.type === 'fan') {
      const soldN = occ.zones[el.id] || 0;
      const left = Math.max(0, (el.limit || 0) - soldN);
      const soldOut = (mode === 'overview' || mode === 'seats') && left <= 0;
      const style = soldOut ? undefined : ({ '--c': cat.color } as React.CSSProperties);
      const cls = 'zone' + (soldOut ? ' sold' : '');
      parts.push(el.shape ? <ShapeNode key="s" el={el} cls={cls} fill={soldOut ? undefined : 'url(#hatch)'} style={style} /> : <rect key="s" width={el.w} height={el.h} rx={14} className={cls} fill={soldOut ? undefined : 'url(#hatch)'} style={style} />);
      let sub = t3('Tik turish joylari', 'Стоячие места', 'Standing');
      if (mode === 'overview' || mode === 'seats') {
        const pr = p.price?.(el, el.cat || 'std');
        sub = soldOut ? t3('Sotib boʻlingan', 'Распродано', 'Sold out') : `${pr ? sum(pr) + ' · ' : ''}${t3('{n} ta qoldi', 'осталось {n}', '{n} left', { n: left })}`;
      } else if (mode === 'editor') sub = el.limit ? t3('limit {n}', 'лимит {n}', 'limit {n}', { n: el.limit }) : t3('limitni kiriting', 'укажите лимит', 'set a limit');
      parts.push(
        <text key="t" className="lbl" x={r1(cx)} y={r1(cy - 6)} transform={up(cx, cy - 6)} textAnchor="middle">
          {el.name}
        </text>,
        <text key="u" className="lbl-sub" x={r1(cx)} y={r1(cy + 12)} transform={up(cx, cy + 12)} textAnchor="middle">
          {sub}
        </text>,
      );
    } else if (el.type === 'table') {
      const ss = seatsOf(el);
      const whole = occ.wholeTables.has(el.id);
      const anyTaken = ss.some((s) => occ.seats.has(s.key));
      parts.push(<circle key="c" r={tableRadius(el.tableSeats || 0)} className={'table' + (whole || (anyTaken && el.mode === 'whole') ? ' sold' : '')} style={{ '--c': cat.color } as React.CSSProperties} />);
      parts.push(
        <text key="t" className="lbl lbl-table" y={4} textAnchor="middle">
          {el.name}
        </text>,
      );
      for (const s of ss) parts.push(<SeatMark key={s.key} p={p} el={el} s={s} occ={occ} sel={sel} isTable />);
    } else {
      const ss = seatsOf(el);
      if (mode === 'overview') {
        const free = ss.filter((s) => !occ.seats.has(s.key)).length;
        const soldOut = free === 0 && ss.length > 0;
        const pr = p.price?.(el, el.cat || 'std');
        const style = soldOut ? undefined : ({ '--c': cat.color } as React.CSSProperties);
        const cls = 'sector-fill' + (soldOut ? ' sold' : '');
        parts.push(
          el.layout === 'arc' && el.rows?.length ? (
            <path key="s" d={arcFramePath(el)} className={cls} style={style} />
          ) : el.shape && !(el.rows && el.rows.length) ? (
            <ShapeNode key="s" el={el} cls={cls} style={style} />
          ) : (
            <rect key="s" x={r1(lb.x)} y={r1(lb.y)} width={r1(lb.w)} height={r1(lb.h)} rx={10} className={cls} style={style} />
          ),
        );
        const lp = labelPoint(el);
        const [cx, cy] = [lp.x, lp.y];
        parts.push(
          <text key="t" className="lbl lbl-big" x={r1(cx)} y={r1(cy - 4)} transform={up(cx, cy - 4)} textAnchor="middle">
            {el.name}
          </text>,
          <text key="u" className="lbl-sub" x={r1(cx)} y={r1(cy + 16)} transform={up(cx, cy + 16)} textAnchor="middle">
            {soldOut ? t3('Sotib boʻlingan', 'Распродан', 'Sold out') : `${pr ? t3('{p} dan', 'от {p}', 'from {p}', { p: sum(pr) }) + ' · ' : ''}${t3('{n} boʻsh', '{n} своб.', '{n} free', { n: free })}`}
          </text>,
        );
      } else {
        const isArc = el.layout === 'arc' && !!el.rows?.length;
        parts.push(
          isArc ? (
            <path key="f" d={arcFramePath(el)} className="sector-frame" />
          ) : el.shape && !(el.rows && el.rows.length) ? (
            <ShapeNode key="f" el={el} cls="sector-frame" />
          ) : (
            <rect key="f" x={r1(lb.x)} y={r1(lb.y)} width={r1(lb.w)} height={r1(lb.h)} rx={10} className="sector-frame" />
          ),
        );
        if (el.gridFromSvg && el.shape) parts.push(<ShapeNode key="g" el={el} cls="sector-frame" />);
        parts.push(
          isArc ? (
            <text key="n" className="lbl-sector" x={r1(labelPoint(el).x)} y={r1(labelPoint(el).y + 4)} transform={up(labelPoint(el).x, labelPoint(el).y + 4)} textAnchor="middle" opacity={0.55}>
              {el.name}
            </text>
          ) : (
            <text key="n" className="lbl-sector" x={r1(lb.x + 8)} y={r1(lb.y + 13)} transform={up(lb.x + 8, lb.y + 13)}>
              {el.name}
            </text>
          ),
        );
        // row labels at the start of every row
        for (const rl of rowLabelPoints(el))
          parts.push(
            <text key={'r' + rl.row} className="rowno" x={rl.x} y={rl.y} transform={up(rl.x, rl.y)} textAnchor={rl.anchor}>
              {rl.row}
            </text>,
          );
        for (const s of ss) parts.push(<SeatMark key={s.key} p={p} el={el} s={s} occ={occ} sel={sel} />);
        if (mode === 'editor' && p.seatEdit && p.edSel === el.id)
          for (const r of removedSlots(el))
            parts.push(
              <circle key={'x' + r.id} cx={r1(r.x)} cy={r1(r.y)} r={el.seatR || SEAT_R} className="seat-removed" onPointerDown={(e) => p.onEdSeat?.(el, r.id, e)}>
                <title>{t3('{r}-qator, {n}-joy — olib tashlangan', 'Ряд {r}, место {n} — убрано', 'Row {r}, seat {n} — removed', { r: r.row, n: r.n })}</title>
              </circle>,
            );
      }
    }
    if (isSel) parts.push(<rect key="sel" x={r1(lb.x - 4)} y={r1(lb.y - 4)} width={r1(lb.w + 8)} height={r1(lb.h + 8)} rx={12} className="sel-box" />);
    out.push(
      <g
        key={el.id}
        className={`el el-${el.type}${isSel ? ' is-sel' : ''}${p.focus === el.id ? ' is-focus' : ''}${p.bad?.has(el.id) ? ' is-bad' : ''}`}
        transform={elTransform(el)}
        data-el={el.id}
        style={mode === 'editor' ? { cursor: p.seatEdit && p.edSel === el.id ? 'default' : 'move' } : clickable ? { cursor: 'pointer' } : undefined}
        onPointerDown={mode === 'editor' && p.onElPointerDown ? (e) => p.onElPointerDown!(e, el) : undefined}
        onClick={clickable && p.onElement ? p.guard(() => p.onElement!(el)) : undefined}
      >
        {parts}
      </g>,
    );
  }
  if (!sc.els.length)
    out.push(
      <text key="empty" x={sc.w / 2} y={sc.h / 2} textAnchor="middle" className="lbl-empty">
        {t3('Sxema boʻsh: SVG yuklang yoki sektor qoʻshing', 'Схема пуста: загрузите SVG или добавьте сектор', 'The plan is empty: upload an SVG or add a sector')}
      </text>,
    );
  return <>{out}</>;
});

function SeatMark({ p, el, s, occ, sel, isTable }: { p: BodyProps; el: SchemeEl; s: Seat; occ: Occupancy; sel: Set<string>; isTable?: boolean }) {
  const cat = catOf(p.scheme, s.cat);
  const id = `${s.row}|${s.n}`;
  const style = { '--c': (p.mode === 'seats' && p.seatColor?.(el, s)) || cat.color } as React.CSSProperties;
  const label = isTable ? t3('Stol {t}, {n}-joy', 'Стол {t}, место {n}', 'Table {t}, seat {n}', { t: el.name, n: s.n }) : t3('{r}-qator, {n}-joy', 'Ряд {r}, место {n}', 'Row {r}, seat {n}', { r: s.row, n: s.n });
  if (p.mode === 'editor' || p.mode === 'preview') {
    const picked = p.mode === 'editor' && p.seatEdit && p.edSel === el.id && p.seatSel?.has(id);
    const canEdit = p.mode === 'editor' && p.seatEdit && p.edSel === el.id && !isTable;
    return (
      <circle cx={r1(s.x)} cy={r1(s.y)} r={el.seatR || SEAT_R} className={'seat ed' + (picked ? ' picked' : '')} style={style} onPointerDown={canEdit ? (e) => p.onEdSeat?.(el, id, e) : undefined}>
        <title>{`${label} · ${tl(cat.name)}`}</title>
      </circle>
    );
  }
  const st = occ.seats.get(s.key);
  const mine = sel.has(s.key);
  const taken = !!st && !mine;
  const cls = mine ? 'seat mine' : taken ? 'seat taken' : 'seat free';
  const tableBlocked = isTable && (el.mode === 'whole' || occ.wholeTables.has(el.id));
  const canPick = p.mode === 'seats' && !taken && !tableBlocked;
  const pr = p.price ? p.price(el, s.cat, s.row) : null;
  const act = canPick && p.onSeat ? p.guard(() => p.onSeat!(s.key, el, s)) : isTable && p.mode === 'seats' && p.onElement ? p.guard(() => p.onElement!(el)) : null;
  return (
    <circle
      cx={r1(s.x)}
      cy={r1(s.y)}
      r={el.seatR || SEAT_R}
      className={cls}
      style={style}
      // a table seat sits inside the clickable table group: don't let the click fire onElement a second time
      onClick={
        act
          ? (e) => {
              e.stopPropagation();
              act();
            }
          : undefined
      }
    >
      <title>{`${label} · ${tl(cat.name)}${pr && !taken ? ' · ' + sum(pr) : taken ? ' · ' + t3('band', 'занято', 'taken') : ''}`}</title>
    </circle>
  );
}

function ShapeNode({ el, cls, fill, style }: { el: SchemeEl; cls: string; fill?: string; style?: React.CSSProperties }) {
  const s = el.shape!;
  const Tag = s.tag as 'path';
  const attrs = Object.fromEntries(Object.entries(s.a).map(([k, v]) => [k, v])) as Record<string, string | number>;
  return (
    <g transform={`matrix(${s.m.join(' ')})`}>
      <Tag {...attrs} className={cls} fill={fill} style={style} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/** Category legend with prices; "taken / selected / standing" states for buyers. */
export function SchemeLegend({ scheme, priceOfCat, states }: { scheme: Scheme; priceOfCat?: (catId: string) => string | null; states?: boolean }) {
  useI18n();
  const cats = catsUsed(scheme);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-2">
      {cats.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-3.5 rounded-full" style={{ background: c.color }} />
          {tl(c.name)}
          {priceOfCat?.(c.id) && <b className="font-semibold text-ink">{priceOfCat(c.id)}</b>}
        </span>
      ))}
      {states && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3.5 rounded-full bg-seat-taken" />
            {t3('Band', 'Занято', 'Taken')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3.5 rounded-full border-2 border-brand bg-seat-mine" />
            {t3('Tanlangan', 'Выбрано', 'Selected')}
          </span>
        </>
      )}
      {scheme.els.some((e) => e.type === 'fan') && (
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-3.5 w-5 rounded border border-dashed border-[#1fa187] bg-[#f3f0ea]" />
          {t3('Tik turish joylari', 'Стоячие места', 'Standing')}
        </span>
      )}
    </div>
  );
}
