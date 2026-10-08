/* Side panels of the seating-plan editor: the element list with seat categories, and the selected element's form. */
import { clsx } from 'clsx';
import { ArrowLeft, Copy, Minus, Plus, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { LANGS, nSeats, plw, t3, tl, useI18n } from '../../lib/i18n';
import { clamp, uid, uniq } from '../../lib/util';
import {
  CAT_PALETTE,
  gridSlots,
  capacityOf,
  catOf,
  elStatus,
  elTypeName,
  gridInside,
  localBox,
  ROW_GAP,
  schemeBox,
  SEAT_GAP,
  SEATED,
  seatCount,
  seatsOf,
} from '../../domain/scheme';
import type { ElType, Numbering, RowAlign, Scheme, SchemeEl } from '../../domain/types';
import { Badge, Button, Field, Input, Segmented, Select, toast } from '../../components/ui';
import { duplicateEl, ensureLoungeCat, type SchemeEditorState } from './useSchemeEditor';

const tone = { ok: 'ok', warn: 'warn', bad: 'bad' } as const;

function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Integer input that commits on blur/Enter and rejects values outside [min, max] with a toast. */
function NumInput({ value, min, max, onCommit, label, id, suffix }: { value: number | null | undefined; min: number; max: number; onCommit: (n: number) => void; label?: string; id?: string; suffix?: string }) {
  const [v, setV] = useState<string | null>(null);
  const shown = v ?? (value == null ? '' : String(value));
  const commit = () => {
    if (v == null) return;
    const n = parseInt(v, 10);
    setV(null);
    if (!(n >= min && n <= max)) {
      toast(t3('{a} dan {b} gacha butun son kiriting', 'Введите целое число от {a} до {b}', 'Enter a whole number from {a} to {b}', { a: min, b: max }), 'bad');
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <div className="relative">
      <Input id={id} aria-label={label} type="number" inputMode="numeric" min={min} max={max} value={shown} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} className={suffix ? 'pr-10' : ''} />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-3">{suffix}</span>}
    </div>
  );
}

function CatSelect({ sc, value, onChange, id }: { sc: Scheme; value: string | undefined; onChange: (v: string) => void; id?: string }) {
  return (
    <Select id={id} value={value || 'std'} onChange={(e) => onChange(e.target.value)}>
      {sc.cats.map((c) => (
        <option key={c.id} value={c.id}>
          {tl(c.name)}
        </option>
      ))}
    </Select>
  );
}

// ---------------------------------------------------------------- element list + categories

export function ListPanel({ ed }: { ed: SchemeEditorState }) {
  useI18n();
  const { sc, errs } = ed;
  const byCat = sc.cats.map((c) => ({ c, n: catPlaces(sc, c.id) }));
  return (
    <div className="space-y-4">
      {ed.summary && (
        <div className="rounded-2xl bg-info-soft p-3 text-sm">
          <div className="font-semibold text-info">{ed.summary.file}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="ok">{t3('Aniqlandi: {n}', 'Распознано: {n}', 'Recognized: {n}', { n: ed.summary.ok })}</Badge>
            {ed.summary.check > 0 && <Badge tone="bad">{t3('Tekshiring: {n}', 'Проверьте: {n}', 'Check: {n}', { n: ed.summary.check })}</Badge>}
            {ed.summary.seats > 0 && <Badge tone="warn">{t3('Joy qoʻshing: {n}', 'Добавьте места: {n}', 'Add seats: {n}', { n: ed.summary.seats })}</Badge>}
          </div>
          {sc.els.some((e) => e.type === 'unknown') && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => ed.change((d) => { d.els = d.els.filter((e) => e.type !== 'unknown'); })}>
              <Trash2 className="size-4" />
              {t3('Aniqlanmagan bezaklarni oʻchirish ({n})', 'Удалить нераспознанные украшения ({n})', 'Delete unrecognized decorations ({n})', { n: sc.els.filter((e) => e.type === 'unknown').length })}
            </Button>
          )}
        </div>
      )}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold">{t3('Sxema elementlari', 'Элементы схемы', 'Plan elements')}</h3>
          <span className="text-sm text-ink-3">{t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: capacityOf(sc) })}</span>
        </div>
        {sc.els.length ? (
          <ul className="space-y-1">
            {sc.els.map((el) => {
              const st = elStatus(el, errs);
              const cnt = el.type === 'fan' ? (el.limit ? t3('limit {n}', 'лимит {n}', 'limit {n}', { n: el.limit }) : '—') : SEATED.includes(el.type) ? nSeats(seatCount(el)) : '';
              const bad = ed.showErrs && errs.some((x) => x.id === el.id);
              return (
                <li key={el.id}>
                  <button type="button" onClick={() => ed.pick(el.id)} className={clsx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-black/5', bad && 'bg-bad-soft')}>
                    <i className="size-3 shrink-0 rounded-full" style={{ background: el.type === 'stage' ? '#2b3142' : el.type === 'unknown' ? '#db4d41' : catOf(sc, el.cat).color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{el.name || '—'}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {elTypeName(el.type)}
                        {cnt ? ' · ' + cnt : ''}
                      </span>
                    </span>
                    {el.type !== 'stage' && <Badge tone={tone[st.k]}>{st.label}</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">{t3('Sxema boʻsh. Shablon tanlang, SVG yuklang yoki yuqoridagi tugmalar bilan sektor qoʻshing.', 'Схема пуста. Выберите шаблон, загрузите SVG или добавьте сектор кнопками сверху.', 'The plan is empty. Pick a template, upload an SVG or add a sector with the buttons above.')}</p>
        )}
        {ed.showErrs && errs.length > 0 && (
          <div className="mt-3 rounded-2xl bg-bad-soft p-3 text-sm text-bad">
            <div className="font-semibold">{t3('Saqlash uchun tuzating:', 'Чтобы сохранить, исправьте:', 'Fix these to save:')}</div>
            <ul className="mt-1 space-y-0.5">
              {errs.slice(0, 8).map((x, i) => (
                <li key={i}>
                  <button type="button" className="underline" onClick={() => ed.pick(x.id)}>
                    {sc.els.find((e) => e.id === x.id)?.name || '—'}
                  </button>
                  : {x.msg}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <Section
        title={t3('Joy toifalari', 'Категории мест', 'Seat categories')}
        aside={
          <Button
            size="sm"
            variant="soft"
            onClick={() => {
              const col = CAT_PALETTE.find((x) => !sc.cats.some((c) => c.color === x));
              if (!col) return toast(t3('Ranglar tugadi: {n} tadan ortiq toifa boʻlmaydi', 'Цвета закончились: не больше {n} категорий', 'Out of colours: up to {n} categories', { n: CAT_PALETTE.length }), 'bad');
              ed.change((d) => {
                d.cats.push({ id: uid('cat'), name: { uz: 'Yangi toifa', ru: 'Новая категория', en: 'New category' }, color: col });
              });
            }}
          >
            <Plus className="size-4" />
            {t3('Toifa', 'Категория', 'Category')}
          </Button>
        }
      >
        <p className="mb-3 text-xs text-ink-3">{t3('Narx tadbirda har bir toifa uchun belgilanadi. Ranglar takrorlanmaydi, toifa legendada yozilgan.', 'Цена задаётся в мероприятии для каждой категории. Цвета не повторяются, категория подписана в легенде.', 'Prices are set per category in each event. Colours never repeat and every category is labelled in the legend.')}</p>
        <ul className="space-y-3">
          {byCat.map(({ c, n }) => (
            <li key={c.id} className="rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2">
                <i className="size-5 shrink-0 rounded-full" style={{ background: c.color }} />
                <CatName
                  value={tl(c.name)}
                  onCommit={(v) =>
                    ed.change((d) => {
                      const cc = d.cats.find((x) => x.id === c.id)!;
                      const nm = { ...cc.name };
                      const L = LANGS.find((l) => tl(c.name) === c.name[l]) || 'uz';
                      nm[L] = v;
                      for (const l of LANGS) if (!nm[l]) nm[l] = v;
                      cc.name = nm;
                    })
                  }
                />
                <span className="shrink-0 text-xs whitespace-nowrap text-ink-3">
                  {n} {plw(n, 'joy', ['место', 'места', 'мест'], ['place', 'places'])}
                </span>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-black/5 hover:text-bad disabled:opacity-30"
                  aria-label={t3('Toifani oʻchirish', 'Удалить категорию', 'Delete category')}
                  disabled={sc.cats.length < 2}
                  onClick={() => {
                    if (n || sc.els.some((e) => (e.type === 'table' || e.type === 'fan' || e.type === 'seats' || e.type === 'lounge') && e.cat === c.id))
                      return toast(t3('Avval bu joylarga boshqa toifa tayinlang', 'Сначала назначьте этим местам другую категорию', 'First assign these places another category'), 'bad');
                    ed.change((d) => {
                      d.cats = d.cats.filter((x) => x.id !== c.id);
                    });
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CAT_PALETTE.map((col) => {
                  const taken = sc.cats.some((o) => o.id !== c.id && o.color === col);
                  return (
                    <button
                      key={col}
                      type="button"
                      disabled={taken}
                      aria-label={col}
                      onClick={() =>
                        ed.change((d) => {
                          d.cats.find((x) => x.id === c.id)!.color = col;
                        })
                      }
                      className={clsx('size-6 rounded-full border-2 disabled:opacity-20', col === c.color ? 'border-ink' : 'border-transparent')}
                      style={{ background: col }}
                    />
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t3('Maslahatlar', 'Подсказки', 'Tips')}>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink-3">
          <li>{t3('Elementlarni sichqoncha bilan suring; boʻsh joyni sudrab — xaritani surish, gʻildirak — masshtab.', 'Перетаскивайте элементы мышью; перетаскивание по пустому месту двигает схему, колесо — масштаб.', 'Drag elements with the mouse; drag empty space to pan, wheel to zoom.')}</li>
          <li>{t3('Ctrl+Z — bekor qilish, Ctrl+Y — qaytarish, Ctrl+D — nusxa, Delete — oʻchirish, strelkalar — siljitish.', 'Ctrl+Z — отменить, Ctrl+Y — повторить, Ctrl+D — копия, Delete — удалить, стрелки — сдвиг.', 'Ctrl+Z undo, Ctrl+Y redo, Ctrl+D duplicate, Delete removes, arrows nudge.')}</li>
          <li>{t3('Yoʻlak yoki ustun uchun joylarni belgilab «Olib tashlash»ni bosing — qolgan raqamlar oʻzgarmaydi.', 'Для прохода или колонны выделите места и нажмите «Убрать» — номера остальных не меняются.', 'For an aisle or a pillar select seats and press "Remove" — the other numbers stay the same.')}</li>
        </ul>
      </Section>
    </div>
  );
}

function CatName({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <Input
      className="h-9 min-w-0 flex-1"
      value={v ?? value}
      maxLength={30}
      aria-label={t3('Toifa nomi', 'Название категории', 'Category name')}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const s = (v ?? '').trim();
        setV(null);
        if (s && s !== value) onCommit(s);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

/** Places of a category: seats, plus fan-zone limits. */
export function catPlaces(sc: Scheme, catId: string) {
  let n = 0;
  for (const el of sc.els) {
    if (el.type === 'fan' && el.cat === catId) n += el.limit || 0;
    else if (SEATED.includes(el.type)) n += seatsOf(el).filter((s) => s.cat === catId).length;
  }
  return n;
}

// ---------------------------------------------------------------- converting kinds

/** Changes the kind of an element (e.g. an unrecognized SVG shape becomes a fan zone), keeping its place on the plan. */
export function convertEl(sc: Scheme, el: SchemeEl, type: ElType) {
  if (type === el.type) return;
  const b = schemeBox(el);
  const wasShape = !!el.shape;
  if (type === 'seats' || type === 'lounge') {
    if (el.type !== 'seats' && el.type !== 'lounge') {
      if (el.type === 'table') {
        delete el.shape;
        delete el.bb;
        el.x = Math.round(b.x);
        el.y = Math.round(b.y);
      }
      if (!wasShape && el.type !== 'table') {
        el.shape = { tag: 'rect', a: { x: 0, y: 0, width: el.w || b.w, height: el.h || b.h, rx: 10 }, m: [1, 0, 0, 1, 0, 0] };
        el.bb = { x: 0, y: 0, w: el.w || b.w, h: el.h || b.h };
      }
      el.pts = [];
      el.rows = undefined;
      el.removed = [];
      el.seatCat = {};
      delete el.tableSeats;
      delete el.mode;
      delete el.limit;
    }
    el.cat = type === 'lounge' ? ensureLoungeCat(sc) : el.cat === 'lounge' ? 'std' : el.cat || 'std';
  } else if (type === 'fan') {
    if (!wasShape) {
      el.w = Math.round(b.w);
      el.h = Math.round(b.h);
      el.x = Math.round(b.x);
      el.y = Math.round(b.y);
    }
    el.limit = el.type === 'fan' ? el.limit : null;
    el.cat = el.cat && sc.cats.some((c) => c.id === el.cat) ? el.cat : 'std';
    delete el.rows;
    delete el.pts;
    delete el.removed;
    delete el.seatCat;
    delete el.mode;
    delete el.tableSeats;
  } else if (type === 'table') {
    el.x = Math.round(b.x + b.w / 2);
    el.y = Math.round(b.y + b.h / 2);
    delete el.shape;
    delete el.bb;
    delete el.rows;
    delete el.pts;
    delete el.removed;
    delete el.seatCat;
    el.tableSeats = 6;
    el.mode = 'both';
    el.cat = 'std';
    const nums = sc.els.filter((e) => e.type === 'table' && e.id !== el.id).map((e) => parseInt(e.name, 10) || 0);
    if (!/^\d+$/.test(String(el.name))) el.name = String((nums.length ? Math.max(...nums) : 0) + 1);
  } else if (type === 'stage') {
    if (!wasShape) {
      el.w = Math.round(b.w);
      el.h = Math.round(b.h);
      el.x = Math.round(b.x);
      el.y = Math.round(b.y);
    }
    delete el.rows;
    delete el.pts;
    delete el.removed;
    delete el.seatCat;
    delete el.mode;
    delete el.limit;
    delete el.tableSeats;
  }
  el.type = type;
  el.notes = [];
}

/** Moves the element offset into its outline so a new seat grid can be laid out in plan coordinates. */
function foldOffset(el: SchemeEl) {
  const ox = el.x || 0;
  const oy = el.y || 0;
  if (!ox && !oy) return;
  if (el.shape) {
    const mm = el.shape.m.slice();
    mm[4] += ox;
    mm[5] += oy;
    el.shape.m = mm;
  }
  if (el.bb) el.bb = { x: el.bb.x + ox, y: el.bb.y + oy, w: el.bb.w, h: el.bb.h };
  el.x = 0;
  el.y = 0;
}

// ---------------------------------------------------------------- selected element

export function ElementPanel({ ed, el }: { ed: SchemeEditorState; el: SchemeEl }) {
  useI18n();
  const { sc, errs } = ed;
  const mine = errs.filter((x) => x.id === el.id);
  const st = elStatus(el, errs);
  const seated = el.type === 'seats' || el.type === 'lounge';
  const hasGrid = !!(el.rows && el.rows.length);
  const hasFileSeats = !!(el.pts && el.pts.length) && !hasGrid;
  const [gridAsk, setGridAsk] = useState(false);
  const [g, setG] = useState({ rows: 6, per: 12 });
  const removedN = (el.removed || []).length;
  const set = (fn: (e: SchemeEl, d: Scheme) => void) => ed.changeEl(el.id, fn);
  const typeOpts: ElType[] = ['seats', 'lounge', 'fan', 'table', 'stage'];

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => ed.pick(null)} className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" />
        {t3('Barcha elementlar', 'Все элементы', 'All elements')}
      </button>
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-lg font-bold">{el.name || elTypeName(el.type)}</h3>
        {el.type !== 'stage' && <Badge tone={tone[st.k]}>{st.label}</Badge>}
      </div>
      {mine.length > 0 && (
        <div className="space-y-1 rounded-2xl bg-bad-soft p-3 text-sm text-bad">
          {mine.map((x, i) => (
            <p key={i}>{x.msg}</p>
          ))}
        </div>
      )}
      {el.notes && el.notes.length > 0 && (
        <div className="space-y-1 rounded-2xl bg-warn-soft p-3 text-sm text-warn">
          {el.notes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
      {el.type === 'unknown' && <p className="rounded-2xl bg-warn-soft p-3 text-sm text-warn">{t3('Fayldagi bu element aniqlanmadi. Bu nima ekanini tanlang yoki uni oʻchiring.', 'Этот элемент из файла не распознан. Выберите, что это, или удалите его.', 'This element from the file wasn’t recognized. Choose what it is or delete it.')}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label={el.type === 'table' ? t3('Stol raqami yoki nomi', 'Номер или название стола', 'Table number or name') : t3('Nomi', 'Название', 'Name')} className="col-span-2" required>
          <NameInput value={el.name} onCommit={(v) => set((e) => (e.name = v))} />
        </Field>
        <Field label={t3('Turi', 'Вид', 'Kind')} className="col-span-2">
          <Select value={el.type} onChange={(e) => set((x, d) => convertEl(d, x, e.target.value as ElType))}>
            {el.type === 'unknown' && <option value="unknown">— {t3('tanlang', 'выберите', 'choose')} —</option>}
            {typeOpts.map((k) => (
              <option key={k} value={k}>
                {elTypeName(k)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {seated && hasGrid && <GridForm ed={ed} el={el} />}

      {seated && hasFileSeats && !gridAsk && (
        <div className="rounded-2xl bg-black/[0.03] p-3 text-sm">
          <p className="text-ink-2">{t3('Fayldagi joylar: {n}. Qator va joy raqamlari belgilashdan olingan.', 'Места из файла: {n}. Номера рядов и мест взяты из разметки.', 'Seats from the file: {n}. Row and seat numbers come from the markup.', { n: seatCount(el) })}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setGridAsk(true)}>
            {t3('Qatorlar toʻri bilan almashtirish', 'Заменить сеткой рядов', 'Replace with a row grid')}
          </Button>
        </div>
      )}
      {seated && ((!hasGrid && !hasFileSeats) || gridAsk) && (
        <div className="rounded-2xl border border-dashed border-line-2 p-3">
          <div className="font-semibold">{t3('Joy qoʻshing', 'Добавьте места', 'Add seats')}</div>
          <p className="mt-1 text-xs text-ink-3">{t3('Qator va joylar sonini kiriting — toʻr sektor konturi ichiga joylashadi. Keyin egrilik, raqamlash va yoʻlaklarni sozlaysiz.', 'Задайте ряды и места — сетка встанет внутрь контура сектора. Потом настроите изгиб, нумерацию и проходы.', 'Set rows and seats: the grid is placed inside the sector outline. Then tune the curve, numbering and aisles.')}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label={t3('Qatorlar', 'Рядов', 'Rows')}>
              <Input type="number" min={1} max={100} value={g.rows} onChange={(e) => setG({ ...g, rows: parseInt(e.target.value, 10) || 0 })} />
            </Field>
            <Field label={t3('Qatordagi joylar', 'Мест в ряду', 'Seats per row')}>
              <Input type="number" min={1} max={100} value={g.per} onChange={(e) => setG({ ...g, per: parseInt(e.target.value, 10) || 0 })} />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (!(g.rows >= 1 && g.rows <= 100) || !(g.per >= 1 && g.per <= 100)) return toast(t3('Qator va joylar — 1 dan 100 gacha', 'Рядов и мест — от 1 до 100', 'Rows and seats: 1 to 100 each'), 'bad');
                set((e) => {
                  if (!e.bb) {
                    const b = localBox(e);
                    e.bb = { x: b.x, y: b.y, w: b.w, h: b.h };
                  }
                  foldOffset(e);
                  gridInside(e, g.rows, g.per);
                  if (!e.shape) delete e.gridFromSvg;
                  e.notes = [];
                });
                setGridAsk(false);
              }}
            >
              {t3('Joylarni yaratish', 'Создать места', 'Create seats')}
            </Button>
            {gridAsk && (
              <Button size="sm" variant="ghost" onClick={() => setGridAsk(false)}>
                {t3('Bekor qilish', 'Отмена', 'Cancel')}
              </Button>
            )}
          </div>
        </div>
      )}

      {seated && seatCount(el) > 0 && <SeatTools ed={ed} el={el} removedN={removedN} />}

      {el.type === 'fan' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t3('Odamlar limiti', 'Лимит людей', 'People limit')} required hint={t3('Xaridor joyni emas, chiptalar sonini tanlaydi', 'Покупатель выбирает количество билетов, а не места', 'Buyers choose a number of tickets, not seats')} className="col-span-2">
            <NumInput value={el.limit ?? null} min={1} max={200000} onCommit={(n) => set((e) => (e.limit = n))} />
          </Field>
          <Field label={t3('Toifa', 'Категория', 'Category')} className="col-span-2">
            <CatSelect sc={sc} value={el.cat} onChange={(v) => set((e) => (e.cat = v))} />
          </Field>
        </div>
      )}

      {el.type === 'table' && (
        <div className="space-y-3">
          <Field label={t3('Joylar soni', 'Число мест', 'Seats')} required hint={t3('1 dan 20 gacha. Joylar: «Stol {n}, 1-joy»…', 'От 1 до 20. Места: «Стол {n}, место 1»…', '1 to 20. Seats read "Table {n}, seat 1"…', { n: el.name })}>
            <NumInput value={el.tableSeats} min={1} max={20} onCommit={(n) => set((e) => (e.tableSeats = n))} />
          </Field>
          <Field label={t3('Sotish usuli', 'Способ продажи', 'How it’s sold')} required>
            <div className="flex flex-col gap-1.5">
              {(
                [
                  ['whole', t3('Faqat butun', 'Только целиком', 'Whole table only')],
                  ['seats', t3('Faqat joylar boʻyicha', 'Только по местам', 'Single seats only')],
                  ['both', t3('Butun va joylar boʻyicha', 'Целиком и по местам', 'Whole table or single seats')],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className={clsx('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm', el.mode === k ? 'border-ink bg-black/[0.03]' : 'border-line')}>
                  <input type="radio" name="tmode" checked={el.mode === k} onChange={() => set((e) => (e.mode = k))} className="accent-ink" />
                  {l}
                </label>
              ))}
            </div>
          </Field>
          <Field label={t3('Toifa', 'Категория', 'Category')}>
            <CatSelect sc={sc} value={el.cat} onChange={(v) => set((e) => (e.cat = v))} />
          </Field>
        </div>
      )}

      {(el.type === 'fan' || el.type === 'stage') && !el.shape && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t3('Kenglik', 'Ширина', 'Width')}>
            <NumInput value={el.w} min={20} max={4000} onCommit={(n) => set((e) => (e.w = n))} />
          </Field>
          <Field label={t3('Balandlik', 'Высота', 'Height')}>
            <NumInput value={el.h} min={10} max={4000} onCommit={(n) => set((e) => (e.h = n))} />
          </Field>
        </div>
      )}

      {el.type !== 'unknown' && (
        <Field label={t3('Burilish', 'Поворот', 'Rotation')}>
          <div className="flex items-center gap-2">
            <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-black/5" onClick={() => set((e) => (e.rot = wrapDeg((e.rot || 0) - 15)))} aria-label="−15°">
              <RotateCcw className="size-4" />
            </button>
            <input type="range" min={-180} max={180} step={1} value={el.rot || 0} onChange={(e) => set((x) => (x.rot = Number(e.target.value)))} className="min-w-0 flex-1 accent-ink" aria-label={t3('Burilish', 'Поворот', 'Rotation')} />
            <button type="button" className="grid size-9 place-items-center rounded-lg hover:bg-black/5" onClick={() => set((e) => (e.rot = wrapDeg((e.rot || 0) + 15)))} aria-label="+15°">
              <RotateCw className="size-4" />
            </button>
            <span className="w-12 text-right font-mono text-sm">{el.rot || 0}°</span>
          </div>
        </Field>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {el.type !== 'unknown' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const copy = duplicateEl(sc, el);
              ed.change((d) => d.els.push(copy));
              ed.pick(copy.id);
            }}
          >
            <Copy className="size-4" />
            {t3('Nusxa', 'Копия', 'Duplicate')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-bad"
          onClick={() => {
            ed.change((d) => {
              d.els = d.els.filter((x) => x.id !== el.id);
            });
            ed.pick(null);
            toast(t3('Element oʻchirildi. Ctrl+Z — qaytarish', 'Элемент удалён. Ctrl+Z — вернуть', 'Element deleted. Ctrl+Z to undo'));
          }}
        >
          <Trash2 className="size-4" />
          {t3('Elementni oʻchirish', 'Удалить элемент', 'Delete element')}
        </Button>
      </div>
    </div>
  );
}

const wrapDeg = (r: number) => (r > 180 ? r - 360 : r < -180 ? r + 360 : r);

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <Input
      value={v ?? value}
      maxLength={50}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const s = (v ?? value).trim().slice(0, 50);
        setV(null);
        if (s !== value) onCommit(s);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}

// ---------------------------------------------------------------- the seat generator

/** Rows, numbering, curve and spacing of a generated sector — the part organizers struggle with most. */
/** Seat generator: shape (straight rows or an arc around a centre), the form of that shape, then aisles. */
function GridForm({ ed, el }: { ed: SchemeEditorState; el: SchemeEl }) {
  useI18n();
  const set = (fn: (e: SchemeEl) => void) => ed.changeEl(el.id, fn);
  const arc = el.layout === 'arc';
  return (
    <div className="space-y-4">
      <Field label={t3('Tribuna shakli', 'Форма трибуны', 'Stand shape')} hint={arc ? t3('Qatorlar markaz atrofidagi yoylar: tashqi qatorlarda joy koʻproq (arena burchaklari, amfiteatr).', 'Ряды — дуги вокруг центра: во внешних рядах больше мест (углы арены, амфитеатр).', 'Rows are arcs around a centre: outer rows hold more seats (arena corners, amphitheatres).') : undefined}>
        <Segmented
          size="sm"
          value={arc ? 'arc' : 'grid'}
          onChange={(v) =>
            set((e) => {
              if (v === 'arc' && e.layout !== 'arc') {
                // keep the sector where it was: the arc centre goes below the old grid
                const b = localBox(e);
                e.layout = 'arc';
                e.arcR = 140;
                e.arcFrom = 220;
                e.arcTo = 320;
                e.x = Math.round((e.x || 0) + b.x + b.w / 2);
                e.y = Math.round((e.y || 0) + b.y + b.h / 2 + 140);
                e.rot = 0;
                e.aisles = [];
              } else if (v === 'grid' && e.layout === 'arc') {
                const counts = gridRowCounts(e);
                e.layout = 'grid';
                e.rows = (e.rows || []).map(() => Math.max(1, ...counts));
                e.aisles = [];
              }
            })
          }
          options={[
            { value: 'grid', label: t3('Toʻgʻri qatorlar', 'Прямые ряды', 'Straight rows') },
            { value: 'arc', label: t3('Yoy (halqa boʻylab)', 'Дуга (по кольцу)', 'Arc (around a ring)') },
          ]}
        />
      </Field>
      {arc ? <ArcForm ed={ed} el={el} /> : <StraightForm ed={ed} el={el} />}
      <AisleForm ed={ed} el={el} />
    </div>
  );
}

/** Seats per row as the generator lays them out (arcs decide them from the geometry). */
function gridRowCounts(el: SchemeEl) {
  const m = new Map<string, number>();
  for (const st of gridSlots(el)) m.set(String(st.row), (m.get(String(st.row)) || 0) + 1);
  return [...m.values()];
}

function ArcForm({ ed, el }: { ed: SchemeEditorState; el: SchemeEl }) {
  useI18n();
  const set = (fn: (e: SchemeEl) => void) => ed.changeEl(el.id, fn);
  const counts = gridRowCounts(el);
  return (
    <div className="space-y-4 rounded-2xl bg-black/[0.03] p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t3('Qatorlar soni', 'Число рядов', 'Rows')}>
          <NumInput value={(el.rows || []).length} min={1} max={60} onCommit={(n) => set((e) => (e.rows = Array(n).fill(1)))} />
        </Field>
        <Field label={t3('Ichki radius', 'Внутренний радиус', 'Inner radius')} hint={t3('Markazdan 1-qatorgacha', 'От центра до 1-го ряда', 'From the centre to row 1')}>
          <NumInput value={el.arcR || 120} min={20} max={3000} onCommit={(n) => set((e) => (e.arcR = n))} />
        </Field>
        <Field label={t3('Boshlanish burchagi', 'Начальный угол', 'Start angle')}>
          <NumInput value={el.arcFrom ?? 200} min={-360} max={720} suffix="°" onCommit={(n) => set((e) => (e.arcFrom = n))} />
        </Field>
        <Field label={t3('Tugash burchagi', 'Конечный угол', 'End angle')}>
          <NumInput value={el.arcTo ?? 340} min={-360} max={720} suffix="°" onCommit={(n) => set((e) => (e.arcTo = n))} />
        </Field>
        <Field label={t3('Birinchi qator', 'Первый ряд', 'First row')}>
          <NumInput value={el.rowStart || 1} min={1} max={999} onCommit={(n) => set((e) => (e.rowStart = n))} />
        </Field>
        <Field label={t3('Birinchi joy raqami', 'Первый номер места', 'First seat number')}>
          <NumInput value={el.seatStart || 1} min={1} max={9999} onCommit={(n) => set((e) => (e.seatStart = n))} />
        </Field>
        <Field label={t3('Joylar oraligʻi', 'Шаг мест', 'Seat spacing')}>
          <NumInput value={el.seatGap || SEAT_GAP} min={12} max={60} onCommit={(n) => set((e) => (e.seatGap = n))} />
        </Field>
        <Field label={t3('Qatorlar oraligʻi', 'Шаг рядов', 'Row spacing')}>
          <NumInput value={el.rowGap || ROW_GAP} min={12} max={80} onCommit={(n) => set((e) => (e.rowGap = n))} />
        </Field>
      </div>
      <p className="text-xs text-ink-3">{t3('Burchaklar: 0° — oʻngga, 90° — pastga, 180° — chapga, 270° — yuqoriga. Markazni sudrab joylashtiring.', 'Углы: 0° — вправо, 90° — вниз, 180° — влево, 270° — вверх. Центр двигайте перетаскиванием.', 'Angles: 0° right, 90° down, 180° left, 270° up. Drag to move the centre.')}</p>
      <Field label={t3('Qator belgilari', 'Обозначение рядов', 'Row labels')}>
        <Segmented
          size="sm"
          value={el.rowLabels || 'num'}
          onChange={(v) => set((e) => (e.rowLabels = v))}
          options={[
            { value: 'num', label: '1, 2, 3' },
            { value: 'alpha', label: 'A, B, C' },
          ]}
        />
      </Field>
      <Field label={t3('Joylar raqamlanishi', 'Нумерация мест', 'Seat numbering')}>
        <Segmented
          size="sm"
          className="flex-wrap"
          value={(el.numbering || 'ltr') as Numbering}
          onChange={(v) => set((e) => (e.numbering = v))}
          options={[
            { value: 'ltr', label: t3('Soat yoʻnalishida', 'По часовой', 'Clockwise') },
            { value: 'rtl', label: t3('Teskari', 'Против часовой', 'Counter-clockwise') },
            { value: 'oddeven', label: t3('Toq | juft', 'Нечёт | чёт', 'Odd | even') },
          ]}
        />
      </Field>
      <div className="text-xs text-ink-3">{t3('Qatorlardagi joylar (avtomatik): {list}', 'Мест в рядах (автоматически): {list}', 'Seats per row (automatic): {list}', { list: counts.join(', ') })}</div>
    </div>
  );
}

const parseList = (v: string) => [...new Set(v.split(/[s,;]+/).map((x) => parseFloat(x)).filter((x) => isFinite(x)))].sort((a, b) => a - b);

/** Aisles through a sector (seat numbers stay continuous) and walkways between rows. */
function AisleForm({ ed, el }: { ed: SchemeEditorState; el: SchemeEl }) {
  useI18n();
  const set = (fn: (e: SchemeEl) => void) => ed.changeEl(el.id, fn);
  const arc = el.layout === 'arc';
  const [ais, setAis] = useState<string | null>(null);
  const [rws, setRws] = useState<string | null>(null);
  const evenly = (n: number) =>
    set((e) => {
      const a0 = Math.min(e.arcFrom ?? 200, e.arcTo ?? 340);
      const a1 = Math.max(e.arcFrom ?? 200, e.arcTo ?? 340);
      e.aisles = n < 2 ? [] : Array.from({ length: n - 1 }, (_, i) => Math.round((a0 + ((a1 - a0) * (i + 1)) / n) * 10) / 10);
    });
  const max = Math.max(...(el.rows || [1]));
  return (
    <div className="space-y-3 rounded-2xl bg-black/[0.03] p-3">
      <div className="font-semibold">{t3('Yoʻlaklar', 'Проходы', 'Aisles')}</div>
      <Field
        label={arc ? t3('Radial yoʻlaklar (burchak, °)', 'Радиальные проходы (угол, °)', 'Radial aisles (angle, °)') : t3('Vertikal yoʻlak: qaysi joydan keyin', 'Вертикальный проход: после какого места', 'Vertical aisle: after which seat')}
        hint={arc ? t3('Masalan: 250, 290. Joylar raqami uzilmaydi.', 'Например: 250, 290. Нумерация не прерывается.', 'E.g. 250, 290. Seat numbering stays continuous.') : t3('Masalan: 6, 14 — barcha qatorlarda bir chiziqda. Raqamlash uzilmaydi.', 'Например: 6, 14 — во всех рядах на одной линии. Нумерация не прерывается.', 'E.g. 6, 14 — lined up in every row. Numbering stays continuous.')}
      >
        <Input
          value={ais ?? (el.aisles || []).join(', ')}
          placeholder={arc ? '250, 290' : '6, 14'}
          onChange={(e) => setAis(e.target.value)}
          onBlur={() => {
            if (ais == null) return;
            const list = parseList(ais).filter((x) => (arc ? true : x >= 1 && x < max));
            setAis(null);
            set((e) => (e.aisles = list));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </Field>
      {arc ? (
        <div className="flex flex-wrap gap-1.5">
          {[2, 3, 4].map((n) => (
            <Button key={n} size="sm" variant="soft" onClick={() => evenly(n)}>
              {t3('{n} ta teng boʻlak', '{n} равные части', '{n} equal blocks', { n })}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="soft" onClick={() => set((e) => (e.aisles = [Math.floor(max / 2)]))}>
            {t3('Oʻrtada bitta yoʻlak', 'Один проход посередине', 'One aisle in the middle')}
          </Button>
          <Button size="sm" variant="soft" onClick={() => set((e) => (e.aisles = [Math.round(max / 3), Math.round((2 * max) / 3)]))}>
            {t3('Ikki yoʻlak', 'Два прохода', 'Two aisles')}
          </Button>
        </div>
      )}
      <Field label={t3('Qatorlar orasidagi oʻtish yoʻli: qaysi qatordan keyin', 'Поперечный проход: после какого ряда', 'Walkway between rows: after which row')} hint={t3('Masalan: 10 — 10-qatordan keyin keng oʻtish yoʻli.', 'Например: 10 — широкий проход после 10-го ряда.', 'E.g. 10 — a wide walkway after row 10.')}>
        <Input
          value={rws ?? (el.rowAisles || []).join(', ')}
          placeholder="10"
          onChange={(e) => setRws(e.target.value)}
          onBlur={() => {
            if (rws == null) return;
            const list = parseList(rws).filter((x) => Number.isInteger(x) && x >= 1 && x < (el.rows || []).length);
            setRws(null);
            set((e) => (e.rowAisles = list));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      </Field>
      <Field label={t3('Yoʻlak kengligi', 'Ширина прохода', 'Aisle width')}>
        <NumInput value={el.aisleGap || el.seatGap || SEAT_GAP} min={8} max={120} onCommit={(n) => set((e) => (e.aisleGap = n))} />
      </Field>
    </div>
  );
}

function StraightForm({ ed, el }: { ed: SchemeEditorState; el: SchemeEl }) {
  useI18n();
  const rows = el.rows || [];
  const set = (fn: (e: SchemeEl) => void) => ed.changeEl(el.id, fn);
  const [open, setOpen] = useState(rows.length <= 14);
  const max = Math.max(...rows);
  const varies = rows.some((c) => c !== max);
  return (
    <div className="space-y-4 rounded-2xl bg-black/[0.03] p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t3('Qatorlar soni', 'Число рядов', 'Rows')}>
          <NumInput
            value={rows.length}
            min={1}
            max={100}
            onCommit={(n) =>
              set((e) => {
                const r = e.rows || [];
                const last = r[r.length - 1] || 10;
                e.rows = n < r.length ? r.slice(0, n) : r.concat(Array(n - r.length).fill(last));
              })
            }
          />
        </Field>
        <Field label={varies ? t3('Joylar (hammasiga)', 'Мест (во все ряды)', 'Seats (all rows)') : t3('Qatordagi joylar', 'Мест в ряду', 'Seats per row')}>
          <NumInput value={max} min={1} max={150} onCommit={(n) => set((e) => (e.rows = (e.rows || []).map(() => n)))} />
        </Field>
        <Field label={t3('Birinchi qator', 'Первый ряд', 'First row')}>
          <NumInput value={el.rowStart || 1} min={1} max={999} onCommit={(n) => set((e) => (e.rowStart = n))} />
        </Field>
        <Field label={t3('Birinchi joy raqami', 'Первый номер места', 'First seat number')}>
          <NumInput value={el.seatStart || 1} min={1} max={9999} onCommit={(n) => set((e) => (e.seatStart = n))} />
        </Field>
      </div>
      <Field label={t3('Qator belgilari', 'Обозначение рядов', 'Row labels')}>
        <Segmented
          size="sm"
          value={el.rowLabels || 'num'}
          onChange={(v) => set((e) => (e.rowLabels = v))}
          options={[
            { value: 'num', label: '1, 2, 3' },
            { value: 'alpha', label: 'A, B, C' },
          ]}
        />
      </Field>
      <Field label={t3('Joylar raqamlanishi', 'Нумерация мест', 'Seat numbering')}>
        <Segmented
          size="sm"
          className="flex-wrap"
          value={(el.numbering || 'ltr') as Numbering}
          onChange={(v) => set((e) => (e.numbering = v))}
          options={[
            { value: 'ltr', label: t3('Chapdan →', 'Слева →', 'Left →') },
            { value: 'rtl', label: t3('← Oʻngdan', '← Справа', '← Right') },
            { value: 'oddeven', label: t3('Toq | juft', 'Нечёт | чёт', 'Odd | even') },
          ]}
        />
      </Field>
      <Field label={t3('Qatorlarni tekislash', 'Выравнивание рядов', 'Row alignment')}>
        <Segmented
          size="sm"
          value={(el.align || 'center') as RowAlign}
          onChange={(v) => set((e) => (e.align = v))}
          options={[
            { value: 'left', label: t3('Chap', 'Лево', 'Left') },
            { value: 'center', label: t3('Markaz', 'Центр', 'Centre') },
            { value: 'right', label: t3('Oʻng', 'Право', 'Right') },
          ]}
        />
      </Field>
      <Field label={t3('Egrilik (amfiteatr)', 'Изгиб (амфитеатр)', 'Curve (amphitheatre)')} hint={t3('0° — toʻgʻri qatorlar. Musbat — chetlari sahnaga qaraydi.', '0° — прямые ряды. Плюс — края загибаются к сцене.', '0° — straight rows. Positive bends the ends towards the stage.')}>
        <div className="flex items-center gap-3">
          <input type="range" min={-90} max={90} step={2} value={el.curve || 0} onChange={(e) => set((x) => (x.curve = Number(e.target.value)))} className="min-w-0 flex-1 accent-ink" aria-label={t3('Egrilik', 'Изгиб', 'Curve')} />
          <span className="w-12 text-right font-mono text-sm">{el.curve || 0}°</span>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t3('Joylar oraligʻi', 'Шаг мест', 'Seat spacing')}>
          <NumInput value={el.seatGap || SEAT_GAP} min={12} max={60} onCommit={(n) => set((e) => (e.seatGap = n))} />
        </Field>
        <Field label={t3('Qatorlar oraligʻi', 'Шаг рядов', 'Row spacing')}>
          <NumInput value={el.rowGap || ROW_GAP} min={12} max={80} onCommit={(n) => set((e) => (e.rowGap = n))} />
        </Field>
      </div>
      <div>
        <button type="button" onClick={() => setOpen(!open)} className="text-sm font-semibold underline">
          {open ? t3('Qatorlarni yashirish', 'Скрыть ряды', 'Hide rows') : t3('Har bir qatordagi joylar', 'Места в каждом ряду', 'Seats in each row')}
        </button>
        {open && (
          <div className="mt-2 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {rows.map((c, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <span className="w-16 shrink-0 text-ink-3">
                  {t3('Qator', 'Ряд', 'Row')} {el.rowLabels === 'alpha' ? alphaLabel((el.rowStart || 1) - 1 + i) : (el.rowStart || 1) + i}
                </span>
                <NumInput value={c} min={1} max={150} onCommit={(n) => set((e) => (e.rows![i] = n))} />
              </label>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="soft" onClick={() => set((e) => (e.rows = (e.rows || []).map((_, i) => clamp(max - (e.rows!.length - 1 - i) * 2, 1, 150))))}>
            {t3('Pastga qarab kengayish', 'Расширять к задним рядам', 'Widen towards the back')}
          </Button>
          <Button size="sm" variant="soft" onClick={() => set((e) => (e.rows = (e.rows || []).map(() => max)))}>
            {t3('Hammasi bir xil', 'Все одинаковые', 'All equal')}
          </Button>
        </div>
      </div>
    </div>
  );
}
const alphaLabel = (i: number) => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

// ---------------------------------------------------------------- category + seat selection tools

function SeatTools({ ed, el, removedN }: { ed: SchemeEditorState; el: SchemeEl; removedN: number }) {
  useI18n();
  const { sc, seatEdit, seatSel } = ed;
  const [cat, setCat] = useState(sc.cats[0]?.id || 'std');
  const set = (fn: (e: SchemeEl) => void) => ed.changeEl(el.id, fn);
  const ss = seatsOf(el);
  const rowsOf = [...new Set(ss.map((s) => String(s.row)))];
  return (
    <div className="space-y-4">
      <Field label={t3('Sektor toifasi', 'Категория сектора', 'Sector category')} hint={t3('Sektordagi barcha joylar toifasini oʻzgartiradi. Alohida joylar — «Joylarni belgilash» orqali.', 'Меняет категорию всех мест сектора. Отдельные места — через «Выделить места».', 'Changes every seat in the sector. For single seats use "Select seats".')}>
        <CatSelect
          sc={sc}
          value={el.cat}
          onChange={(v) =>
            set((e) => {
              e.cat = v;
              e.seatCat = {};
            })
          }
        />
      </Field>
      <div className={clsx('space-y-3 rounded-2xl p-3', seatEdit ? 'bg-brand-soft' : 'bg-black/[0.03]')}>
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant={seatEdit ? 'dark' : 'outline'} onClick={() => (ed.setSeatEdit(!seatEdit), ed.setSeatSel(new Set()))}>
            {seatEdit ? t3('Tayyor', 'Готово', 'Done') : t3('Joylarni belgilash', 'Выделить места', 'Select seats')}
          </Button>
          {seatEdit && <span className="text-sm text-ink-2">{t3('Tanlangan: {n}', 'Выбрано: {n}', 'Selected: {n}', { n: seatSel.size })}</span>}
        </div>
        {seatEdit && (
          <>
            <p className="text-xs text-ink-2">{t3('Joylarni bosing yoki ramka bilan belgilang (Shift — qoʻshish). Olib tashlangan joylar punktir bilan — qaytarish uchun bosing. Xaritani surish: Alt + sudrash.', 'Нажимайте на места или обведите рамкой (Shift — добавить). Убранные места — пунктиром, нажмите, чтобы вернуть. Сдвиг схемы: Alt + перетаскивание.', 'Tap seats or drag a box (Shift adds). Removed seats are dotted: tap to bring back. Pan the plan with Alt + drag.')}</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="soft" onClick={() => ed.setSeatSel(new Set(ss.map((s) => `${s.row}|${s.n}`)))}>
                {t3('Hammasi', 'Все', 'All')}
              </Button>
              <Select className="h-8 w-auto rounded-lg py-0 text-sm" value="" onChange={(e) => e.target.value && ed.setSeatSel(new Set([...seatSel, ...ss.filter((s) => String(s.row) === e.target.value).map((s) => `${s.row}|${s.n}`)]))} aria-label={t3('Qatorni belgilash', 'Выделить ряд', 'Select a row')}>
                <option value="">{t3('+ qator', '+ ряд', '+ row')}</option>
                {rowsOf.map((r) => (
                  <option key={r} value={r}>
                    {t3('Qator', 'Ряд', 'Row')} {r}
                  </option>
                ))}
              </Select>
              {seatSel.size > 0 && (
                <Button size="sm" variant="ghost" onClick={() => ed.setSeatSel(new Set())}>
                  {t3('Bekor qilish', 'Снять', 'Clear')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Select className="h-9 min-w-0 flex-1 text-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t3('Toifa', 'Категория', 'Category')}>
                {sc.cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {tl(c.name)}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                className="h-9"
                disabled={!seatSel.size}
                onClick={() => {
                  set((e) => {
                    e.seatCat = e.seatCat || {};
                    for (const id of seatSel) {
                      if (cat === e.cat) delete e.seatCat[id];
                      else e.seatCat[id] = cat;
                    }
                  });
                  toast(t3('Toifa tayinlandi: {n}', 'Категория назначена: {n}', 'Category assigned: {n}', { n: nSeats(seatSel.size) }), 'ok');
                  ed.setSeatSel(new Set());
                }}
              >
                {t3('Tayinlash', 'Назначить', 'Assign')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={!seatSel.size}
                onClick={() => {
                  set((e) => (e.removed = uniq([...(e.removed || []), ...seatSel])));
                  ed.setSeatSel(new Set());
                }}
              >
                <Minus className="size-4" />
                {t3('Olib tashlash (yoʻlak)', 'Убрать (проход)', 'Remove (aisle)')}
              </Button>
              {removedN > 0 && (
                <Button size="sm" variant="ghost" onClick={() => set((e) => (e.removed = []))}>
                  <Undo2 className="size-4" />
                  {t3('Hammasini qaytarish ({n})', 'Вернуть все ({n})', 'Restore all ({n})', { n: removedN })}
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-3">{t3('Olib tashlangan joy (yoʻlak, ustun) yoʻqoladi, qolganlarining raqamlari oʻzgarmaydi.', 'Убранное место (проход, колонна) исчезает, номера остальных не меняются.', 'A removed seat (an aisle or a pillar) disappears; other seats keep their numbers.')}</p>
          </>
        )}
      </div>
    </div>
  );
}
