/*
 * Arena layouts. One multi-purpose arena (e.g. Humo Arena) looks different for every kind of event, so each layout
 * is a hall of the venue with its own plan; the event copies the layout it uses.
 *
 * The bowl is drawn the way such arenas are built: straight stands along the long sides, curved stands (arcs)
 * around both ends, aisles between sectors, a lower and an upper tier. The floor and closed sectors depend on
 * the event: a concert stage closes the stands behind it, UFC has an octagon with ringside seats, hockey a rink,
 * boxing a ring with ringside VIP rows, a festival big standing zones and only the side stands open.
 */
import { tx3 } from '../lib/i18n';
import { r1, uid } from '../lib/util';
import { CAT_PALETTE, defaultCats, gridSlots, localBox, ROW_GAP, rowLabelOf, SEAT_GAP } from './scheme';
import type { BBox, Scheme, SchemeEl } from './types';

export type ArenaLayout = 'concert' | 'ufc' | 'hockey' | 'boxing' | 'festival';
export const ARENA_LAYOUTS: ArenaLayout[] = ['concert', 'ufc', 'hockey', 'boxing', 'festival'];

/**
 * Puts a straight sector so that the middle of its first row lands on (tx, ty) and its rows run away from there:
 * rotation 0° — rows go down, 180° — up, -90° — right, 90° — left.
 */
export function placeGrid(el: SchemeEl, tx: number, ty: number, rot: number) {
  el.rot = rot;
  el.x = 0;
  el.y = 0;
  const b = localBox(el);
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const first = gridSlots(el).filter((st) => st.row === rowLabelOf(el, 0));
  const p0 = { x: first.reduce((a, st) => a + st.x, 0) / Math.max(1, first.length), y: first[0]?.y || 0 };
  const t = (rot * Math.PI) / 180;
  const d = { x: p0.x - c.x, y: p0.y - c.y };
  el.x = r1(tx - c.x - (d.x * Math.cos(t) - d.y * Math.sin(t)));
  el.y = r1(ty - c.y - (d.x * Math.sin(t) + d.y * Math.cos(t)));
  return el;
}

function sector(name: string, extra: Partial<SchemeEl>): SchemeEl {
  return { id: uid('el'), type: 'seats', name, x: 0, y: 0, rot: 0, cat: 'std', rowStart: 1, rowLabels: 'num', numbering: 'ltr', align: 'center', removed: [], seatCat: {}, src: 'manual', rev: 1, ...extra };
}
function shapeStage(name: string, tag: 'rect' | 'polygon', a: Record<string, string | number>, bb: BBox): SchemeEl {
  return { id: uid('el'), type: 'stage', name, x: 0, y: 0, rot: 0, src: 'manual', rev: 1, shape: { tag, a, m: [1, 0, 0, 1, 0, 0] }, bb };
}
function zone(name: string, x: number, y: number, w: number, h: number, limit: number, cat: string): SchemeEl {
  return { id: uid('el'), type: 'fan', name, x: r1(x), y: r1(y), w: r1(w), h: r1(h), rot: 0, limit, cat, src: 'manual', rev: 1 };
}

export function arenaScheme(layout: ArenaLayout): Scheme {
  const sc: Scheme = { w: 1400, h: 1000, cats: defaultCats(), els: [] };
  sc.cats.push({ id: 'floor', name: tx3('Parter (maydon)', 'Партер (поле)', 'Floor'), color: CAT_PALETTE[4] });
  const CX = 700;
  const CY = 500;
  const L = 230; // half-length of the straight sides
  const R0 = 170; // first row of the lower tier, from the centre line (sides) or the end centres (arcs)
  const rg = ROW_GAP;
  const lowerRows = 12;
  const upperRows = 8;
  const R1 = R0 + lowerRows * rg + 40; // first row of the upper tier
  const tiers = layout === 'festival' ? 1 : 2;
  const stageEnd = layout === 'concert' || layout === 'festival'; // the stage closes the right end
  const leftEnd = layout !== 'festival';

  for (let tier = 0; tier < tiers; tier++) {
    const R = tier ? R1 : R0;
    const rows = tier ? upperRows : lowerRows;
    let no = tier ? 201 : 101;
    const seg = 3;
    const aisle = 26;
    const w = (2 * L - (seg - 1) * aisle) / seg;
    const perRow = Math.floor(w / SEAT_GAP) + 1;
    // top side, left to right; rows run upwards, away from the floor
    for (let i = 0; i < seg; i++) {
      const cx = CX - L + w / 2 + i * (w + aisle);
      sc.els.push(placeGrid(sector(String(no++), { rows: Array(rows).fill(perRow) }), cx, CY - R, 180));
    }
    // right end (arcs around the right end centre)
    const right: [number, number][] = [
      [-88, -32],
      [-28, 28],
      [32, 88],
    ];
    for (const [a, b] of right) {
      if (!stageEnd) sc.els.push(sector(String(no), { layout: 'arc', x: CX + L, y: CY, arcR: R, arcFrom: a, arcTo: b, rows: Array(rows).fill(1) }));
      no++;
    }
    // bottom side, right to left
    for (let i = seg - 1; i >= 0; i--) {
      const cx = CX - L + w / 2 + i * (w + aisle);
      sc.els.push(placeGrid(sector(String(no++), { rows: Array(rows).fill(perRow), numbering: 'rtl' }), cx, CY + R, 0));
    }
    // left end
    const left: [number, number][] = [
      [92, 148],
      [152, 208],
      [212, 268],
    ];
    for (const [a, b] of left) {
      if (leftEnd) sc.els.push(sector(String(no), { layout: 'arc', x: CX - L, y: CY, arcR: R, arcFrom: a, arcTo: b, rows: Array(rows).fill(1) }));
      no++;
    }
  }

  const fieldHalfW = L + R0 - 34;
  const fieldHalfH = R0 - 34;
  if (layout === 'hockey') {
    sc.els.push(shapeStage('Muz maydoni', 'rect', { x: CX - fieldHalfW, y: CY - fieldHalfH, width: fieldHalfW * 2, height: fieldHalfH * 2, rx: 90 }, { x: CX - fieldHalfW, y: CY - fieldHalfH, w: fieldHalfW * 2, h: fieldHalfH * 2 }));
  } else if (layout === 'ufc' || layout === 'boxing') {
    if (layout === 'ufc') {
      const r = 64;
      const pts = Array.from({ length: 8 }, (_, k) => {
        const t = ((k * 45 + 22.5) * Math.PI) / 180;
        return `${r1(CX + r * Math.cos(t))},${r1(CY + r * Math.sin(t))}`;
      }).join(' ');
      sc.els.push(shapeStage('Oktagon', 'polygon', { points: pts }, { x: CX - r, y: CY - r, w: 2 * r, h: 2 * r }));
    } else {
      sc.els.push(shapeStage('Ring', 'rect', { x: CX - 56, y: CY - 56, width: 112, height: 112, rx: 4 }, { x: CX - 56, y: CY - 56, w: 112, h: 112 }));
    }
    // ringside VIP rows on all four sides, then floor rows with a centre aisle
    const near = 88;
    const vipRows = layout === 'ufc' ? 3 : 2;
    sc.els.push(placeGrid(sector('VIP A', { rows: Array(vipRows).fill(14), cat: 'vip' }), CX, CY - near, 180));
    sc.els.push(placeGrid(sector('VIP C', { rows: Array(vipRows).fill(14), cat: 'vip', numbering: 'rtl' }), CX, CY + near, 0));
    sc.els.push(placeGrid(sector('VIP B', { rows: Array(vipRows).fill(7), cat: 'vip' }), CX + near + 10, CY, -90));
    sc.els.push(placeGrid(sector('VIP D', { rows: Array(vipRows).fill(7), cat: 'vip' }), CX - near - 10, CY, 90));
    if (layout === 'ufc') {
      sc.els.push(placeGrid(sector('Parter L', { rows: Array(5).fill(6), cat: 'floor' }), CX - 300, CY, 90));
      sc.els.push(placeGrid(sector('Parter R', { rows: Array(5).fill(6), cat: 'floor' }), CX + 300, CY, -90));
    }
  } else {
    // concert / festival: stage at the right end, standing floor in front of it
    const sx = CX + L - 10;
    sc.els.push(shapeStage('Sahna', 'rect', { x: sx, y: CY - 110, width: 150, height: 220, rx: 8 }, { x: sx, y: CY - 110, w: 150, h: 220 }));
    const fx = CX - fieldHalfW + 10;
    if (layout === 'concert') {
      sc.els.push(zone('VIP fan-zona', sx - 140, CY - 100, 120, 200, 400, 'vip'));
      sc.els.push(zone('Fan-zona', fx, CY - fieldHalfH + 6, sx - 150 - fx, fieldHalfH * 2 - 12, 2000, 'floor'));
    } else {
      sc.els.push(zone('Golden Circle', sx - 160, CY - 120, 140, 240, 800, 'vip'));
      sc.els.push(zone('Tik turish zonasi', fx - 160, CY - fieldHalfH - 10, sx - 170 - fx + 160, fieldHalfH * 2 + 20, 5000, 'floor'));
    }
  }
  return sc;
}

export const arenaLayoutName = (l: ArenaLayout) =>
  ({
    concert: tx3('Konsert', 'Концерт', 'Concert'),
    ufc: tx3('UFC / MMA', 'UFC / MMA', 'UFC / MMA'),
    hockey: tx3('Xokkey', 'Хоккей', 'Hockey'),
    boxing: tx3('Boks', 'Бокс', 'Boxing'),
    festival: tx3('Festival', 'Фестиваль', 'Festival'),
  })[l];
