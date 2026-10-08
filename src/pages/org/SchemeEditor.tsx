/*
 * Seating plan editor (US-06 … US-10): hall templates, SVG upload with automatic sector recognition, manual
 * sectors with a seat generator (rows, numbering, curve, spacing), seat categories and VIP, aisles, fan zones,
 * tables, stage; drag, rotate, duplicate, undo/redo; buyer preview. Saving creates a new snapshot of the hall plan,
 * so plans already copied into events and sessions never change.
 */
import { clsx } from 'clsx';
import { ArrowLeft, Check, Download, Eye, FileUp, HelpCircle, LayoutTemplate, Plus, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { t3, useI18n } from '../../lib/i18n';
import { clone, uid } from '../../lib/util';
import { useDb, tx } from '../../store/db';
import { useAuth } from '../../store/auth';
import { getScheme, logAct } from '../../domain/rules';
import { capacityOf, elStatus, elTransform, importSvg, newFan, newSector, newStage, newTable, sampleSvg, seatCount, seatsOf, sellables, toScheme, validateScheme } from '../../domain/scheme';
import type { Scheme, SchemeEl } from '../../domain/types';
import { SchemeLegend, SchemeView } from '../../components/scheme/SchemeView';
import { Button, Empty, Modal, toast } from '../../components/ui';
import { ElementPanel, ListPanel } from '../../features/venues/EditorPanels';
import { downloadSample, PreviewModal, SvgHelpModal, TemplatesModal } from '../../features/venues/EditorModals';
import { duplicateEl, ensureLoungeCat, useSchemeEditor, type ImportSummary } from '../../features/venues/useSchemeEditor';

const SVG_MAX = 5 * 1024 * 1024;

type Confirm = { title: string; text: string; ok: string; danger?: boolean; onOk: () => void } | null;

function planPoint(svg: SVGSVGElement | null, cx: number, cy: number) {
  if (!svg) return { x: 0, y: 0 };
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const pt = svg.createSVGPoint();
  pt.x = cx;
  pt.y = cy;
  const r = pt.matrixTransform(m.inverse());
  return { x: r.x, y: r.y };
}
/** Plan units per screen pixel, to keep drag thresholds the same at any zoom. */
function unitsPerPx(svg: SVGSVGElement | null) {
  const m = svg?.getScreenCTM();
  return m ? 1 / Math.max(m.a, 0.0001) : 1;
}

export default function SchemeEditor() {
  useI18n();
  const { venueId, hallId } = useParams();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId);
  const venue = db.venues.find((v) => v.id === venueId);
  const hall = venue?.halls.find((h) => h.id === hallId);
  if (!venue || !hall || venue.orgId !== orgId)
    return (
      <Empty title={t3('Zal topilmadi', 'Зал не найден', 'Hall not found')} action={<Link to="/org/venues" className="underline">{t3('Maydonlarga', 'К площадкам', 'To venues')}</Link>} />
    );
  return <Editor key={hall.id + hall.schemeId} venueId={venue.id} hallId={hall.id} />;
}

function Editor({ venueId, hallId }: { venueId: string; hallId: string }) {
  useI18n();
  const db = useDb();
  const nav = useNavigate();
  const venue = db.venues.find((v) => v.id === venueId)!;
  const hall = venue.halls.find((h) => h.id === hallId)!;
  const [initial] = useState(() => getScheme(hall.schemeId));
  const ed = useSchemeEditor(initial);
  const { sc, el } = ed;
  const [help, setHelp] = useState(false);
  const [preview, setPreview] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [marq, setMarq] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const saving = useRef(false);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    asideRef.current?.scrollTo({ top: 0 }); // scrollTo returns a Promise in new browsers: keep the effect body a block
  }, [ed.sel]);

  const uses = db.events.filter((e) => e.venueId === venue.id).length + db.sessions.filter((s) => s.hallId === hall.id).length;
  const bad = ed.showErrs ? new Set(ed.errs.map((x) => x.id)) : undefined;

  // ---- leaving with unsaved changes
  const blocker = useBlocker(({ currentLocation, nextLocation }) => ed.dirty && !saving.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!ed.dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [ed.dirty]);

  // ---- adding elements
  const add = (t: 'seats' | 'arc' | 'lounge' | 'fan' | 'table' | 'stage') => {
    const draft = ed.scRef.current;
    const ne: SchemeEl =
      t === 'fan' ? newFan(draft) : t === 'table' ? newTable(draft) : t === 'stage' ? newStage() : t === 'arc' ? { ...newSector(draft, 'seats'), layout: 'arc', arcR: 140, arcFrom: 210, arcTo: 330, rows: Array(8).fill(1) } : newSector(draft, t);
    if (t === 'arc') {
      ne.x += 200;
      ne.y += 260;
    }
    ed.change(
      (d) => {
        if (t === 'lounge') ne.cat = ensureLoungeCat(d);
        d.els.push(ne);
      },
      { refit: true },
    );
    ed.pick(ne.id);
  };

  // ---- import
  const importText = (text: string, name: string) => {
    const doIt = () => {
      let next: Scheme;
      try {
        next = importSvg(text);
      } catch {
        toast(t3('Fayl buzilgan yoki SVG emas — sxema yuklanmadi', 'Файл повреждён или это не SVG — схема не загружена', 'The file is damaged or isn’t an SVG, so nothing was loaded'), 'bad');
        return;
      }
      if (!next.els.length) {
        toast(t3('Faylda sxemaning birorta elementi yoʻq', 'В файле нет ни одного элемента схемы', 'The file has no plan elements'), 'bad');
        return;
      }
      const errs = validateScheme(next);
      const st = next.els.filter((e) => e.type !== 'stage').map((e) => ({ e, k: elStatus(e, errs).k }));
      const sum: ImportSummary = {
        file: name,
        ok: st.filter((x) => x.k === 'ok').length,
        check: st.filter((x) => x.k === 'bad' || (x.k === 'warn' && !((x.e.type === 'seats' || x.e.type === 'lounge') && !seatCount(x.e)))).length,
        seats: next.els.filter((e) => (e.type === 'seats' || e.type === 'lounge') && !seatCount(e)).length,
      };
      ed.replace(next, name, sum);
      toast(t3('Sxema yuklandi: oʻngdagi elementlarni tekshiring', 'Схема загружена: проверьте элементы справа', 'Plan loaded: check the elements on the right'), 'ok');
    };
    if (sc.els.length)
      setConfirm({
        title: t3('Yangi sxema yuklansinmi?', 'Загрузить новую схему?', 'Load a new plan?'),
        text: t3('Joriy sxema almashtiriladi. Yaratilgan tadbirlar sxemalari oʻzgarmaydi.', 'Текущая схема будет заменена. Схемы уже созданных мероприятий не изменятся.', 'The current plan will be replaced. Plans of events you already created stay the same.'),
        ok: t3('Almashtirish', 'Заменить', 'Replace'),
        onOk: doIt,
      });
    else doIt();
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > SVG_MAX) return toast(t3('Fayl 5 MB dan katta', 'Файл больше 5 МБ', 'The file is larger than 5 MB'), 'bad');
    if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') return toast(t3('SVG fayl kerak. Boshqa formatlar qabul qilinmaydi.', 'Нужен файл SVG. Другие форматы не принимаются.', 'Please choose an SVG file. Other formats aren’t accepted.'), 'bad');
    const r = new FileReader();
    r.onload = () => importText(String(r.result || ''), f.name);
    r.onerror = () => toast(t3('Faylni oʻqib boʻlmadi', 'Не удалось прочитать файл', 'Couldn’t read the file'), 'bad');
    r.readAsText(f);
  };
  const applyTemplate = (next: Scheme, name: string) => {
    setTemplates(false);
    const doIt = () => ed.replace(next, null, null);
    if (sc.els.length)
      setConfirm({
        title: t3('«{n}» shabloni qoʻllansinmi?', 'Применить шаблон «{n}»?', 'Use the "{n}" template?', { n: name }),
        text: t3('Joriy sxema shablon bilan almashtiriladi (Ctrl+Z bilan qaytarish mumkin).', 'Текущая схема будет заменена шаблоном (можно вернуть Ctrl+Z).', 'The current plan is replaced by the template (Ctrl+Z brings it back).'),
        ok: t3('Qoʻllash', 'Применить', 'Use'),
        onOk: doIt,
      });
    else doIt();
  };

  // ---- save
  const save = () => {
    if (!sellables(sc).length) return toast(t3('Kamida bitta sektor, fan-zona yoki stol qoʻshing', 'Добавьте хотя бы один сектор, фан-зону или стол', 'Add at least one sector, fan zone or table'), 'bad');
    const errs = ed.errs;
    if (errs.length) {
      ed.setShowErrs(true);
      ed.pick(errs[0].id);
      const e0 = sc.els.find((x) => x.id === errs[0].id);
      return toast(t3('Sxema saqlanmadi: {m}', 'Схема не сохранена: {m}', 'Plan not saved: {m}', { m: `${e0?.name || ''} — ${errs[0].msg}` }), 'bad');
    }
    const doSave = () => {
      saving.current = true;
      tx((d) => {
        const v = d.venues.find((x) => x.id === venueId)!;
        const h = v.halls.find((x) => x.id === hallId)!;
        const id = uid('sch');
        const copy = clone(sc);
        copy.els.forEach((e) => delete e.notes);
        d.schemes[id] = copy;
        h.schemeId = id;
        logAct(ed.src ? 'scheme-upload' : 'scheme-save', `${v.name} · ${h.name}`, `${ed.src ? ed.src + ' · ' : ''}${t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: capacityOf(copy) })}`);
      });
      ed.setDirty(false);
      toast(t3('Sxema saqlandi', 'Схема сохранена', 'Plan saved'), 'ok');
      nav('/org/venues/' + venueId);
    };
    if (uses)
      setConfirm({
        title: t3('Sxema saqlansinmi?', 'Сохранить схему?', 'Save the plan?'),
        text: t3('Yangi tadbir va seanslar shu sxemani oladi. Mavjud tadbir va seanslar oʻz nusxasini saqlaydi.', 'Новые мероприятия и сеансы получат эту схему. Мероприятия и сеансы, которые уже есть, сохранят свою копию.', 'New events and sessions get this plan. Existing events and sessions keep their own copy.'),
        ok: t3('Saqlash', 'Сохранить', 'Save'),
        onOk: doSave,
      });
    else doSave();
  };

  // ---- pointer interaction: drag elements, box-select seats
  const startMarquee = (svg: SVGSVGElement | null, e: RPointerEvent, elId: string) => {
    const p0 = planPoint(svg, e.clientX, e.clientY);
    const additive = e.shiftKey;
    let cur = { x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y };
    let moved = false;
    const k = unitsPerPx(svg);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (ev.buttons === 0) return up(ev); // released outside the window
      const p = planPoint(svg, ev.clientX, ev.clientY);
      cur = { ...cur, x1: p.x, y1: p.y };
      if (!moved && Math.hypot(cur.x1 - cur.x0, cur.y1 - cur.y0) < 4 * k) return;
      moved = true;
      setMarq(cur);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarq(null);
      if (!moved) return;
      const target = ed.scRef.current.els.find((x) => x.id === elId);
      if (!target) return;
      const x0 = Math.min(cur.x0, cur.x1);
      const x1 = Math.max(cur.x0, cur.x1);
      const y0 = Math.min(cur.y0, cur.y1);
      const y1 = Math.max(cur.y0, cur.y1);
      const hit: string[] = [];
      for (const s of seatsOf(target)) {
        const q = toScheme(target, s.x, s.y);
        if (q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) hit.push(`${s.row}|${s.n}`);
      }
      ed.setSeatSel((prev) => new Set([...(additive ? prev : []), ...hit]));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onElPointerDown = useCallback(
    (e: RPointerEvent<SVGGElement>, target: SchemeEl) => {
      if (e.button !== 0 || e.altKey) return; // Alt + drag pans
      e.stopPropagation();
      const svg = e.currentTarget.ownerSVGElement;
      if (ed.seatEdit && ed.sel === target.id) {
        startMarquee(svg, e, target.id);
        return;
      }
      if (ed.sel !== target.id) ed.pick(target.id);
      const g = e.currentTarget;
      const p0 = planPoint(svg, e.clientX, e.clientY);
      const ox = target.x || 0;
      const oy = target.y || 0;
      const k = unitsPerPx(svg);
      let moved = false;
      let nx = ox;
      let ny = oy;
      const ghost: SchemeEl = { ...target };
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        if (ev.buttons === 0) return up(ev); // released outside the window
        const p = planPoint(svg, ev.clientX, ev.clientY);
        const dx = p.x - p0.x;
        const dy = p.y - p0.y;
        if (!moved && Math.hypot(dx, dy) < 4 * k) return;
        moved = true;
        // snap to a 2-unit grid; hold Shift to move along one axis
        nx = Math.round((ox + (ev.shiftKey && Math.abs(dy) > Math.abs(dx) ? 0 : dx)) / 2) * 2;
        ny = Math.round((oy + (ev.shiftKey && Math.abs(dx) >= Math.abs(dy) ? 0 : dy)) / 2) * 2;
        ghost.x = nx;
        ghost.y = ny;
        g.setAttribute('transform', elTransform(ghost)); // direct DOM update: no re-render of every seat while dragging
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (moved)
          ed.changeEl(target.id, (x) => {
            x.x = nx;
            x.y = ny;
          });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [ed.seatEdit, ed.sel], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onBgPointerDown = useCallback(
    (e: RPointerEvent<SVGSVGElement>) => {
      if (ed.seatEdit && ed.sel) startMarquee(e.currentTarget, e, ed.sel);
    },
    [ed.seatEdit, ed.sel], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onEdSeat = useCallback(
    (target: SchemeEl, id: string, e: RPointerEvent) => {
      e.stopPropagation();
      if ((target.removed || []).includes(id)) {
        ed.changeEl(target.id, (x) => (x.removed = (x.removed || []).filter((r) => r !== id)));
        return;
      }
      ed.setSeatSel((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        ed.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        ed.redo();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      } else if (mod && e.key.toLowerCase() === 'd' && ed.el) {
        e.preventDefault();
        const copy = duplicateEl(ed.scRef.current, ed.el);
        ed.change((d) => d.els.push(copy));
        ed.pick(copy.id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.el && !ed.seatEdit) {
        e.preventDefault();
        const id = ed.el.id;
        ed.change((d) => {
          d.els = d.els.filter((x) => x.id !== id);
        });
        ed.pick(null);
      } else if (e.key === 'Escape') {
        if (ed.seatEdit) ed.setSeatEdit(false);
        else ed.pick(null);
      } else if (ed.el && !ed.seatEdit && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        ed.changeEl(ed.el.id, (x) => {
          x.x = (x.x || 0) + dx;
          x.y = (x.y || 0) + dy;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const overlay = marq ? <rect x={Math.min(marq.x0, marq.x1)} y={Math.min(marq.y0, marq.y1)} width={Math.abs(marq.x1 - marq.x0)} height={Math.abs(marq.y1 - marq.y0)} fill="rgba(255,221,0,0.18)" stroke="#111" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" /> : null;

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-56px)] flex-col md:-mx-8 md:-my-8 lg:min-h-screen">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3 md:px-6">
        <Link to={`/org/venues/${venue.id}`} className="flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" />
          {venue.name}
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold md:text-xl">
          {t3('Zal sxemasi', 'Схема зала', 'Seating plan')} · {hall.name}
        </h1>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={ed.undo} disabled={!ed.canUndo} title="Ctrl+Z" aria-label={t3('Bekor qilish', 'Отменить', 'Undo')}>
            <Undo2 className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={ed.redo} disabled={!ed.canRedo} title="Ctrl+Y" aria-label={t3('Qaytarish', 'Повторить', 'Redo')}>
            <Redo2 className="size-4" />
          </Button>
          {ed.dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setConfirm({
                  title: t3('Oʻzgarishlar bekor qilinsinmi?', 'Отменить изменения?', 'Discard changes?'),
                  text: t3('Sxema oxirgi saqlangan holatiga qaytadi.', 'Схема вернётся к последней сохранённой версии.', 'The plan goes back to the last saved version.'),
                  ok: t3('Bekor qilish', 'Отменить изменения', 'Discard'),
                  danger: true,
                  onOk: ed.reset,
                })
              }
            >
              {t3('Bekor qilish', 'Сбросить', 'Discard')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => (sc.els.length ? setPreview(true) : toast(t3('Sxema boʻsh', 'Схема пуста', 'The plan is empty'), 'bad'))}>
            <Eye className="size-4" />
            <span className="hidden sm:inline">{t3('Oldindan koʻrish', 'Предпросмотр', 'Preview')}</span>
          </Button>
          <Button size="sm" onClick={save} title="Ctrl+S">
            <Check className="size-4" />
            {t3('Sxemani saqlash', 'Сохранить схему', 'Save plan')}
          </Button>
        </div>
      </div>
      {/* toolbar */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-line bg-white px-4 py-2 md:px-6" role="toolbar" aria-label={t3('Sxema vositalari', 'Инструменты схемы', 'Plan tools')}>
        <Button size="sm" variant="soft" onClick={() => setTemplates(true)}>
          <LayoutTemplate className="size-4" />
          {t3('Shablon', 'Шаблон', 'Template')}
        </Button>
        <Button size="sm" variant="soft" onClick={() => fileRef.current?.click()}>
          <FileUp className="size-4" />
          {t3('SVG yuklash', 'Загрузить SVG', 'Upload SVG')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => importText(sampleSvg(true), 'sayohat-example.svg')}>
          {t3('Namunani yuklash', 'Загрузить пример', 'Load the example')}
        </Button>
        <Button size="sm" variant="ghost" onClick={downloadSample} aria-label={t3('SVG namunasi', 'Пример SVG', 'Example SVG')}>
          <Download className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setHelp(true)} aria-label={t3('SVG qanday belgilanadi', 'Как разметить SVG', 'How to mark up the SVG')}>
          <HelpCircle className="size-4" />
        </Button>
        <span className="mx-1 h-6 w-px shrink-0 bg-line" />
        {(
          [
            ['seats', t3('Sektor', 'Сектор', 'Sector')],
            ['arc', t3('Yoy sektor', 'Дуговой сектор', 'Arc sector')],
            ['lounge', t3('Launj', 'Лаунж', 'Lounge')],
            ['fan', t3('Fan-zona', 'Фан-зона', 'Fan zone')],
            ['table', t3('Stol', 'Стол', 'Table')],
            ['stage', t3('Sahna', 'Сцена', 'Stage')],
          ] as const
        ).map(([k, l]) => (
          <Button key={k} size="sm" variant="outline" onClick={() => add(k)}>
            <Plus className="size-4" />
            {l}
          </Button>
        ))}
      </div>
      {/* canvas + side panel */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div
          ref={canvasRef}
          className="min-w-0 p-3 md:p-4"
          onPointerDownCapture={(e) => (downAt.current = { x: e.clientX, y: e.clientY })}
          onClick={(e) => {
            // a click on empty space (not a drag) deselects
            const d = downAt.current;
            if ((e.target as Element).tagName.toLowerCase() === 'svg' && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5 && !ed.seatEdit) ed.pick(null);
          }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
            <span>
              {ed.seatEdit
                ? t3('Joylarni bosing yoki ramka bilan belgilang. Olib tashlangan joylar — punktir, qaytarish uchun bosing.', 'Нажимайте на места или обведите их рамкой. Убранные места — пунктиром, нажмите, чтобы вернуть.', 'Tap seats or drag a box around them. Removed seats are dotted: tap one to bring it back.')
                : t3('Elementlarni sudrang (Shift — bir oʻq boʻylab). Boʻsh joyni sudrash — surish, gʻildirak — masshtab.', 'Перетаскивайте элементы (Shift — по одной оси). Пустое место — сдвиг, колесо — масштаб.', 'Drag elements (Shift locks an axis). Drag empty space to pan, wheel to zoom.')}
            </span>
            <span>
              {t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: capacityOf(sc) })}
              {ed.dirty && <b className="ml-2 text-warn">● {t3('saqlanmagan', 'не сохранено', 'unsaved')}</b>}
            </span>
          </div>
          <SchemeView
            scheme={sc}
            mode="editor"
            edSel={ed.sel}
            seatEdit={ed.seatEdit}
            seatSel={ed.seatSel}
            bad={bad}
            onElPointerDown={onElPointerDown}
            onBgPointerDown={ed.seatEdit ? onBgPointerDown : undefined}
            onEdSeat={onEdSeat}
            overlay={overlay}
            viewKey={ed.viewKey}
            height="calc(100vh - 260px)"
            className={clsx('min-h-[420px] border border-line', ed.seatEdit && 'ring-2 ring-brand')}
          />
          <div className="mt-3">
            <SchemeLegend scheme={sc} />
          </div>
        </div>
        <aside ref={asideRef} className="max-h-[calc(100vh-130px)] overflow-y-auto border-t border-line bg-white p-4 lg:border-t-0 lg:border-l">{el ? <ElementPanel key={el.id} ed={ed} el={el} /> : <ListPanel ed={ed} />}</aside>
      </div>

      <SvgHelpModal open={help} onClose={() => setHelp(false)} />
      {preview && <PreviewModal open onClose={() => setPreview(false)} scheme={sc} />}
      <TemplatesModal open={templates} onClose={() => setTemplates(false)} onPick={applyTemplate} />
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        size="sm"
        title={confirm?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t3('Bekor qilish', 'Отмена', 'Cancel')}
            </Button>
            <Button
              variant={confirm?.danger ? 'danger' : 'primary'}
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                c?.onOk();
              }}
            >
              {confirm?.ok}
            </Button>
          </>
        }
      >
        <p className="text-ink-2">{confirm?.text}</p>
      </Modal>
      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        size="sm"
        title={t3('Saqlanmagan oʻzgarishlar bor', 'Есть несохранённые изменения', 'You have unsaved changes')}
        footer={
          <>
            <Button variant="ghost" onClick={() => blocker.proceed?.()}>
              {t3('Saqlamasdan chiqish', 'Выйти без сохранения', 'Leave without saving')}
            </Button>
            <Button onClick={() => blocker.reset?.()}>{t3('Muharrirda qolish', 'Остаться', 'Stay')}</Button>
          </>
        }
      >
        <p className="text-ink-2">{t3('Sxemadagi oʻzgarishlar saqlanmagan. Chiqsangiz, ular yoʻqoladi.', 'Изменения схемы не сохранены. Если выйти, они пропадут.', 'Your plan changes are not saved. If you leave, they are lost.')}</p>
      </Modal>
    </div>
  );
}
