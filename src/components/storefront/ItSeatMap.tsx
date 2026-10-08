/*
 * Live seat map of an iticket.uz session. The venue plan is iticket's own SVG (seats are
 * <g id="seat-{id}" data-row data-seat data-sector class="seat">, sectors <g data-sector data-is_ga>);
 * it is fetched from the CDN, sanitized and injected once, then painted from the manifest by mutating
 * attributes directly — no React render per seat. Zoom and pan change the SVG viewBox (wheel, drag, pinch,
 * + / − / fit buttons).
 */
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ItSeat, ItSector } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { nfmt } from '../../lib/format';
import { Button, Spinner } from '../ui';
import { sanitizeSvg } from './sanitize';

export const SOLD_FILL = '#d3d5da';
const SEL_FILL = '#111111';
const SEL_STROKE = '#ffdd00';
const SCOPE = 'itm-scope';

type VB = { x: number; y: number; w: number; h: number };

/** SVG text of a plan; when `url` fails (iticket has no file for some sectors) the `fallback` plan is used. */
async function loadSvg(url: string, fallback: string | undefined, signal: AbortSignal) {
  const get = async (u: string) => {
    const r = await fetch(u, { signal });
    if (!r.ok) throw new Error(`svg ${r.status}`);
    return r.text();
  };
  try {
    return { text: await get(url), fallback: false };
  } catch (e) {
    if (!fallback || fallback === url || signal.aborted) throw e;
    return { text: await get(fallback), fallback: true };
  }
}

function seatShapes(g: Element): SVGElement[] {
  if (g.tagName.toLowerCase() !== 'g') return [g as SVGElement];
  const all = Array.from(g.querySelectorAll('path,rect,circle,ellipse,polygon,polyline')) as SVGElement[];
  const body = all.filter((s) => !/^number/.test(s.id) && s.getAttribute('data-name') !== 'number');
  return body.length ? body : all;
}

export type SeatMapProps = {
  svgUrl: string;
  /** Plan to use if svgUrl cannot be loaded; the map then zooms to `focusSector`. */
  fallbackUrl?: string;
  seats: ItSeat[];
  /** price_category_id → colour. */
  colors: Record<number, string>;
  selected: number[];
  onSeat: (seat: ItSeat) => void;
  /** Sector-based plans: sectors are clickable groups. */
  sectors?: ItSector[];
  onSector?: (id: number) => void;
  focusSector?: number | null;
  onFailed?: () => void;
  className?: string;
};

export function ItSeatMap({ svgUrl, fallbackUrl, seats, colors, selected, onSeat, sectors, onSector, focusSector, onFailed, className }: SeatMapProps) {
  const { t3 } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<((f: number) => void) | null>(null);
  const svgQ = useQuery({
    queryKey: ['it-svg', svgUrl, fallbackUrl || null],
    queryFn: ({ signal }) => loadSvg(svgUrl, fallbackUrl, signal),
    staleTime: Infinity,
    gcTime: 10 * 60e3,
    retry: 1,
    enabled: !!svgUrl,
  });
  const [ready, setReady] = useState(0);

  // Mutable state of the injected plan (never triggers renders).
  const st = useRef({
    svg: null as SVGSVGElement | null,
    base: { x: 0, y: 0, w: 1, h: 1 } as VB,
    vb: { x: 0, y: 0, w: 1, h: 1 } as VB,
    seatEls: new Map<number, Element>(),
    info: new Map<number, ItSeat>(),
    sel: new Set<number>(),
    colors: {} as Record<number, string>,
    raf: 0,
  });
  const cb = useRef({ onSeat, onSector, sectors });
  cb.current = { onSeat, onSector, sectors };

  const apply = useCallback(() => {
    const s = st.current;
    if (s.raf) return;
    s.raf = requestAnimationFrame(() => {
      s.raf = 0;
      const { x, y, w, h } = s.vb;
      s.svg?.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    });
  }, []);

  const paintSeat = useCallback((id: number) => {
    const s = st.current;
    const el = s.seatEls.get(id);
    if (!el) return;
    const seat = s.info.get(id);
    const free = !!seat?.ticket;
    const sel = s.sel.has(id) && free;
    const fill = sel ? SEL_FILL : free ? s.colors[seat!.ticket!.price_category_id] || '#317e3d' : SOLD_FILL;
    for (const sh of seatShapes(el)) {
      sh.style.fill = fill;
      sh.style.stroke = sel ? SEL_STROKE : free ? 'rgba(0,0,0,.35)' : '#c3c6cc';
      sh.style.strokeWidth = sel ? '6px' : '1px';
    }
    el.classList.toggle('is-free', free);
    el.classList.toggle('is-sel', sel);
    el.setAttribute('aria-pressed', String(sel));
  }, []);

  // ---- inject the plan
  useLayoutEffect(() => {
    const s = st.current;
    const el = host.current;
    if (!el) return;
    el.replaceChildren();
    s.svg = null;
    s.seatEls.clear();
    if (!svgQ.data) return;
    const svg = sanitizeSvg(svgQ.data.text, SCOPE);
    if (!svg) {
      onFailed?.();
      return;
    }
    const node = document.importNode(svg, true) as SVGSVGElement;
    node.removeAttribute('width');
    node.removeAttribute('height');
    node.setAttribute('width', '100%');
    node.setAttribute('height', '100%');
    node.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', t3('Zal sxemasi', 'Схема зала', 'Seating plan'));
    el.appendChild(node);
    s.svg = node;
    const vbA = node.viewBox?.baseVal;
    let base: VB;
    if (vbA && vbA.width > 0) base = { x: vbA.x, y: vbA.y, w: vbA.width, h: vbA.height };
    else {
      const bb = node.getBBox();
      base = { x: bb.x, y: bb.y, w: bb.width || 1000, h: bb.height || 1000 };
    }
    s.base = base;
    s.vb = { ...base };
    node.setAttribute('viewBox', `${base.x} ${base.y} ${base.w} ${base.h}`);
    node.querySelectorAll('[id^="seat-"]').forEach((g) => {
      const id = Number(g.id.slice(5));
      if (id) s.seatEls.set(id, g);
    });
    setReady((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgQ.data]);

  useEffect(() => {
    if (svgQ.isError) onFailed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgQ.isError]);

  // ---- paint seats from the manifest
  useEffect(() => {
    const s = st.current;
    if (!s.svg) return;
    s.colors = colors;
    s.info = new Map(seats.map((x) => [x.id, x]));
    s.sel = new Set(selected);
    for (const id of s.seatEls.keys()) paintSeat(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seats, colors, paintSeat]);

  // ---- selection: repaint only what changed
  useEffect(() => {
    const s = st.current;
    const next = new Set(selected);
    const changed = [...s.sel].filter((id) => !next.has(id)).concat(selected.filter((id) => !s.sel.has(id)));
    s.sel = next;
    for (const id of changed) paintSeat(id);
  }, [selected, paintSeat]);

  // ---- sectors of a sector-based plan
  useEffect(() => {
    const s = st.current;
    if (!s.svg || !sectors?.length || !onSector) return;
    for (const sec of sectors) {
      const g = s.svg.querySelector(`[data-sector="${sec.id}"][data-is_ga]`) || s.svg.querySelector(`[data-sector="${sec.id}"]`);
      if (!(g instanceof SVGElement)) continue;
      const avail = sec.available ? Object.values(sec.available).reduce((a, b) => a + b, 0) : 0;
      const on = sec.os && avail > 0;
      g.style.cursor = on ? 'pointer' : 'not-allowed';
      g.style.opacity = on ? '' : '0.35';
      g.setAttribute('data-on', on ? '1' : '0');
    }
  }, [ready, sectors, onSector]);

  // ---- focus a sector
  useEffect(() => {
    const s = st.current;
    if (!s.svg) return;
    if (focusSector == null) {
      s.vb = { ...s.base };
      apply();
      return;
    }
    const g = s.svg.querySelector(`[data-sector="${focusSector}"][data-is_ga]`) || s.svg.querySelector(`[data-sector="${focusSector}"]`);
    if (!(g instanceof SVGGraphicsElement)) return;
    try {
      const bb = g.getBBox();
      if (!bb.width || !bb.height) return;
      const pad = Math.max(bb.width, bb.height) * 0.08;
      s.vb = { x: bb.x - pad, y: bb.y - pad, w: bb.width + pad * 2, h: bb.height + pad * 2 };
      apply();
    } catch {
      /* not rendered */
    }
  }, [ready, focusSector, apply]);

  // ---- zoom / pan / clicks
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const s = st.current;
    const toSvg = (cx: number, cy: number) => {
      const ctm = s.svg?.getScreenCTM();
      if (!ctm) return null;
      return new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    };
    const scale = () => s.svg?.getScreenCTM()?.a || 1;
    const zoomAt = (cx: number, cy: number, f: number) => {
      const p = toSvg(cx, cy);
      if (!p) return;
      const nw = Math.min(Math.max(s.vb.w * f, s.base.w / 30), s.base.w * 1.6);
      const k = nw / s.vb.w;
      s.vb = { x: p.x - (p.x - s.vb.x) * k, y: p.y - (p.y - s.vb.y) * k, w: nw, h: s.vb.h * k };
      apply();
    };
    const pan = (dx: number, dy: number) => {
      const sc = scale();
      s.vb = { ...s.vb, x: s.vb.x - dx / sc, y: s.vb.y - dy / sc };
      apply();
    };

    const onWheel = (e: WheelEvent) => {
      if (!s.svg) return;
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(e.clientX, e.clientY, Math.exp(Math.max(-60, Math.min(60, d)) * 0.004));
    };

    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let start: { x: number; y: number } | null = null;
    let pinch: { d: number; mx: number; my: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if ((e.target as Element).closest('button')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        start = { x: e.clientX, y: e.clientY };
        moved = 0;
      }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        moved = 99;
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };
    const onMove = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, cur);
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (d > 0) zoomAt(mx, my, pinch.d / d);
        pan(mx - pinch.mx, my - pinch.my);
        pinch = { d, mx, my };
        return;
      }
      if (start) moved = Math.max(moved, Math.hypot(cur.x - start.x, cur.y - start.y));
      if (moved > 5) {
        el.style.cursor = 'grabbing';
        pan(cur.x - prev.x, cur.y - prev.y);
      }
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        el.style.cursor = '';
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (moved > 5) return;
      const t = e.target as Element;
      if (!s.svg || !s.svg.contains(t)) return;
      const g = t.closest('[id^="seat-"]');
      if (g) {
        const seat = s.info.get(Number(g.id.slice(5)));
        if (seat?.ticket) cb.current.onSeat(seat);
        return;
      }
      const { onSector: os, sectors: secs } = cb.current;
      if (os && secs?.length) {
        const sg = t.closest('[data-sector]');
        const id = sg ? Number(sg.getAttribute('data-sector')) : NaN;
        if (id && secs.some((x) => x.id === id)) os(id);
      }
    };
    const onOver = (e: PointerEvent) => {
      const tp = tip.current;
      if (!tp) return;
      const g = e.pointerType === 'mouse' ? (e.target as Element).closest?.('[id^="seat-"]') : null;
      const seat = g ? s.info.get(Number(g.id.slice(5))) : undefined;
      if (!seat) {
        tp.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      tp.textContent = `${seat.sector_label ? seat.sector_label + ' · ' : ''}${t3('{r}-qator, {s}-joy', 'Ряд {r}, место {s}', 'Row {r}, seat {s}', { r: seat.row_label, s: seat.seat_label })}${seat.ticket ? ' · ' + nfmt(seat.ticket.price) + ' ' + t3('soʻm', 'сум', 'UZS') : ' · ' + t3('band', 'занято', 'taken')}`;
      tp.style.display = 'block';
      tp.style.left = Math.min(e.clientX - r.left + 14, r.width - 220) + 'px';
      tp.style.top = e.clientY - r.top + 14 + 'px';
    };
    const onLeave = () => {
      if (tip.current) tip.current.style.display = 'none';
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClick);
    el.addEventListener('pointermove', onOver);
    el.addEventListener('pointerleave', onLeave);
    const zoomBtn = (f: number) => {
      const r = el.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
    };
    zoomRef.current = zoomBtn;
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick);
      el.removeEventListener('pointermove', onOver);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [apply, t3]);

  const zoom = (f: number) => zoomRef.current?.(f);
  const fit = () => {
    st.current.vb = { ...st.current.base };
    apply();
  };

  return (
    <div ref={box} className={clsx('relative touch-none overflow-hidden rounded-[var(--radius-card)] bg-white select-none', className)}>
      <div ref={host} className={clsx('it-map size-full', SCOPE)} />
      {svgQ.isLoading && (
        <div className="absolute inset-0 grid place-items-center bg-white/80 text-ink-3">
          <div className="flex items-center gap-3">
            <Spinner /> {t3('Zal sxemasi yuklanmoqda…', 'Загружаем схему зала…', 'Loading the seating plan…')}
          </div>
        </div>
      )}
      {svgQ.isError && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-ink-3">
          <div>
            <div className="font-semibold text-ink">{t3('Sxema yuklanmadi', 'Схема не загрузилась', 'The plan did not load')}</div>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => svgQ.refetch()}>
              {t3('Qayta urinish', 'Повторить', 'Retry')}
            </Button>
          </div>
        </div>
      )}
      <div ref={tip} className="pointer-events-none absolute z-10 hidden max-w-[220px] rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-lg" />
      <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
        <button type="button" onClick={() => zoom(1 / 1.4)} aria-label={t3('Kattalashtirish', 'Приблизить', 'Zoom in')} className="grid size-10 place-items-center rounded-xl bg-white shadow-[var(--shadow-card)] hover:bg-brand">
          <Plus className="size-5" />
        </button>
        <button type="button" onClick={() => zoom(1.4)} aria-label={t3('Kichiklashtirish', 'Отдалить', 'Zoom out')} className="grid size-10 place-items-center rounded-xl bg-white shadow-[var(--shadow-card)] hover:bg-brand">
          <Minus className="size-5" />
        </button>
        <button type="button" onClick={fit} aria-label={t3('Butun sxema', 'Вся схема', 'Fit to screen')} className="grid size-10 place-items-center rounded-xl bg-white shadow-[var(--shadow-card)] hover:bg-brand">
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  );
}
