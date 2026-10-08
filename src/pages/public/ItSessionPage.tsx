/*
 * /events/:category/:slug/:sessionId — live seat map of an iticket.uz session (refreshed every 30 s).
 * Read-only on iticket: the buyer picks seats here to see live availability and prices, then continues on
 * iticket.uz where the purchase is completed (we never call their cart / order API — their stock is real).
 */
import { clsx } from 'clsx';
import { ArrowLeft, ChevronLeft, ExternalLink, Info, List, Map as MapIcon, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { useDb } from '../../store/db';
import { itCdn, itSiteUrl, useItEvent, useItManifest, type ItLegend, type ItManifest, type ItSeat, type ItSector, type ItVariation } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { fmtDate, hhmm, parseApiDate } from '../../lib/time';
import { sum, usd } from '../../lib/format';
import { Button, Card, Empty, LinkButton, Notice, Segmented, Stepper, toast } from '../../components/ui';
import { ItSeatMap, SOLD_FILL } from '../../components/storefront/ItSeatMap';
import { sanitizeHtml } from '../../components/storefront/sanitize';

type SelSeat = { id: number; sectorId: number; sector: string; row: string; seat: string; price: number; catId: number };
type GaPick = { key: string; sectorId: number; sector: string; name: string; price: number; qty: number; available: number; min: number; max: number; step: number };

const flatSeats = (m: ItManifest | undefined): ItSeat[] => (m && m.seats && !Array.isArray(m.seats) ? Object.values(m.seats).flat() : []);
const sectorAvail = (s: ItSector) => (s.available ? Object.values(s.available).reduce((a, b) => a + b, 0) : 0);
const gaKey = (sectorId: number, v: ItVariation) => `${sectorId}:${v.price_category_id}:${v.buyer_type_id}`;

function LegendList({ legends }: { legends: ItLegend[] }) {
  const { t3 } = useI18n();
  return (
    <ul className="flex flex-col gap-2">
      {[...legends]
        .sort((a, b) => b.price - a.price)
        .map((l) => (
          <li key={l.price_category_id} className="flex items-center gap-3 text-[15px]">
            <span className="size-4 shrink-0 rounded-full" style={{ background: l.color?.bg_color || '#999' }} />
            <span className="min-w-0 flex-1 truncate">{l.price_category_name}</span>
            <span className="font-semibold whitespace-nowrap">{sum(l.price)}</span>
            <span className={clsx('w-14 text-right text-xs', l.available ? 'text-ink-3' : 'text-bad')}>{l.available ? t3('{n} ta', '{n} шт.', '{n} left', { n: l.available }) : t3('yoʻq', 'нет', 'none')}</span>
          </li>
        ))}
      <li className="flex items-center gap-3 text-[15px] text-ink-3">
        <span className="size-4 shrink-0 rounded-full" style={{ background: SOLD_FILL }} />
        {t3('Band yoki sotilgan', 'Занято или продано', 'Taken or sold')}
      </li>
      <li className="flex items-center gap-3 text-[15px] text-ink-3">
        <span className="size-4 shrink-0 rounded-full border-2 border-brand bg-ink" />
        {t3('Siz tanlagan', 'Ваш выбор', 'Your choice')}
      </li>
    </ul>
  );
}

/** Accessible list view of the free seats (also the fallback when the plan cannot be shown). */
function SeatList({ seats, selected, onSeat, colors }: { seats: ItSeat[]; selected: number[]; onSeat: (s: ItSeat) => void; colors: Record<number, string> }) {
  const { t3 } = useI18n();
  const rows = useMemo(() => {
    const m = new Map<string, ItSeat[]>();
    for (const s of seats) {
      const k = `${s.sector_label || ''}|${s.row_label}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return [...m.entries()];
  }, [seats]);
  if (!seats.length) return <div className="p-6 text-center text-ink-3">{t3('Bu yerda raqamlangan joylar yoʻq.', 'Здесь нет нумерованных мест.', 'No numbered seats here.')}</div>;
  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-4">
      {rows.map(([k, list]) => {
        const [sector, row] = k.split('|');
        return (
          <div key={k}>
            <div className="mb-1.5 text-sm font-semibold text-ink-2">
              {sector && `${sector} · `}
              {t3('{r}-qator', 'Ряд {r}', 'Row {r}', { r: row })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((s) => {
                const sel = selected.includes(s.id);
                const free = !!s.ticket;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!free}
                    onClick={() => onSeat(s)}
                    aria-pressed={sel}
                    aria-label={t3('{r}-qator, {s}-joy', 'Ряд {r}, место {s}', 'Row {r}, seat {s}', { r: s.row_label, s: s.seat_label })}
                    className={clsx('grid h-8 min-w-8 place-items-center rounded-lg px-1 text-xs font-semibold text-white disabled:cursor-not-allowed', sel && 'ring-2 ring-brand')}
                    style={{ background: sel ? '#111' : free ? colors[s.ticket!.price_category_id] || '#317e3d' : SOLD_FILL }}
                  >
                    {s.seat_label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GaPanel({ sector, picks, onChange, left }: { sector: ItSector; picks: Record<string, GaPick>; onChange: (p: GaPick) => void; left: number }) {
  const { t3 } = useI18n();
  const vars = sector.variations || [];
  if (!vars.length) return <Notice tone="neutral">{t3('Bu sektorda chipta yoʻq.', 'В этом секторе нет билетов.', 'No tickets in this sector.')}</Notice>;
  return (
    <ul className="flex flex-col gap-3">
      {vars.map((v) => {
        const key = gaKey(sector.id, v);
        const cur = picks[key]?.qty || 0;
        const step = Math.max(1, Number(v.buyer_type_limit?.step) || 1);
        const lmax = Number(v.buyer_type_limit?.max) || 99;
        const max = Math.max(cur, Math.min(v.available, lmax, cur + left));
        const min = Math.max(1, Number(v.buyer_type_limit?.min) || 1);
        return (
          <li key={key} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{v.buyer_type_name || v.price_category_name}</div>
              <div className="text-sm text-ink-3">
                {v.price_category_name} · {sum(v.price)} · {v.available ? t3('{n} ta qoldi', 'осталось {n}', '{n} left', { n: v.available }) : t3('qolmagan', 'нет', 'none left')}
              </div>
            </div>
            <Stepper
              value={cur}
              min={0}
              max={max}
              disabled={!v.available && !cur}
              onChange={(n) => {
                const q = n > cur ? Math.min(cur === 0 ? min : cur + step, max) : cur - step < min ? 0 : cur - step;
                if (q === cur) return;
                onChange({ key, sectorId: sector.id, sector: sector.name, name: v.buyer_type_name || v.price_category_name, price: v.price, qty: q, available: v.available, min, max: lmax, step });
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Imported events are sold here: their session opens on the Sayohat page with the same data the organizer sees. */
export default function ItSessionPage() {
  const { category = '', slug = '', sessionId = '' } = useParams();
  const db = useDb();
  const local = db.events.find((e) => e.ext?.slug === slug && e.ext?.category === category);
  if (local) return <Navigate to={`/e/${local.id}/it-s${sessionId}`} replace />;
  return <ItSessionLive />;
}

/** Live iticket seat map (events that are not imported, e.g. sold on an external site). */
function ItSessionLive() {
  const { t3, lang } = useI18n();
  const { category = '', slug = '', sessionId = '' } = useParams();
  const evQ = useItEvent(category, slug);
  const main = useItManifest(sessionId);
  const m = main.data;
  const view = m?.options.view;
  const onlyGa = !!m?.options.only_ga;
  const sectors = useMemo(() => m?.sectors || [], [m?.sectors]);
  const mainSeats = useMemo(() => flatSeats(m), [m]);
  const sectorMode = !!m && view === 'sector' && !onlyGa;

  const [sectorId, setSectorId] = useState<number | null>(null);
  const sector = sectors.find((s) => s.id === sectorId) || null;
  // In a sector-based plan the seats of a sector come from its own manifest.
  const needSectorManifest = sectorMode && !!sector && !sector.is_ga;
  const secQ = useItManifest(needSectorManifest ? sessionId : undefined, needSectorManifest ? sectorId : null);
  const sm = needSectorManifest ? secQ.data : undefined;

  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [mapFailed, setMapFailed] = useState(false);
  const [sel, setSel] = useState<SelSeat[]>([]);
  const [ga, setGa] = useState<Record<string, GaPick>>({});

  const limit = Math.max(1, Number(m?.cart_limit) || 10);
  const count = sel.length + Object.values(ga).reduce((a, p) => a + p.qty, 0);
  const total = sel.reduce((a, s) => a + s.price, 0) + Object.values(ga).reduce((a, p) => a + p.qty * p.price, 0);

  const legends = useMemo(() => {
    const byId = new Map<number, ItLegend>();
    for (const l of m?.legends || []) byId.set(l.price_category_id, l);
    for (const l of sm?.legends || []) byId.set(l.price_category_id, l);
    return [...byId.values()];
  }, [m?.legends, sm?.legends]);
  const colors = useMemo(() => Object.fromEntries(legends.map((l) => [l.price_category_id, l.color?.bg_color || '#317e3d'])), [legends]);

  // What the map shows now.
  const showingSector = needSectorManifest && !!sm;
  const seats = useMemo(() => (showingSector ? flatSeats(sm) : mainSeats), [showingSector, sm, mainSeats]);
  const svgUrl = itCdn(showingSector ? sm?.options.svg_url : m?.options.svg_url);
  const fallbackUrl = showingSector ? itCdn(m?.options.svg_url) : undefined;
  const selectedIds = useMemo(() => sel.map((s) => s.id), [sel]);

  // ---- live refresh (every 30 s): drop seats that became unavailable, clamp GA quantities
  const dropSold = useCallback(
    (data: ItManifest | undefined) => {
      if (!data) return;
      const byId = new Map(flatSeats(data).map((x) => [x.id, x]));
      setSel((prev) => {
        const gone = prev.filter((x) => byId.has(x.id) && !byId.get(x.id)!.ticket);
        if (!gone.length) return prev;
        toast(
          t3('Tanlangan joylar sotildi: {list}', 'Выбранные места уже проданы: {list}', 'Selected seats were just sold: {list}', {
            list: gone.map((x) => `${x.row}/${x.seat}`).join(', '),
          }),
          'bad',
        );
        return prev.filter((x) => !gone.includes(x));
      });
    },
    [t3],
  );
  useEffect(() => {
    if (!main.data) return;
    dropSold(main.data);
    const secs = main.data.sectors || [];
    setGa((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const sec of secs)
        for (const v of sec.variations || []) {
          const k = gaKey(sec.id, v);
          if (next[k] && next[k].qty > v.available) {
            changed = true;
            if (v.available > 0) next[k] = { ...next[k], qty: v.available, available: v.available };
            else delete next[k];
          }
        }
      if (changed) toast(t3('Chiptalar soni yangilandi: baʼzilari sotildi.', 'Количество обновлено: часть билетов продана.', 'Quantities updated: some tickets were sold.'), 'warn');
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main.dataUpdatedAt]);
  useEffect(() => {
    if (needSectorManifest) dropSold(secQ.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secQ.dataUpdatedAt]);

  const toggleSeat = useCallback(
    (s: ItSeat) => {
      if (!s.ticket) return;
      setSel((prev) => {
        if (prev.some((x) => x.id === s.id)) return prev.filter((x) => x.id !== s.id);
        if (prev.length + Object.values(ga).reduce((a, p) => a + p.qty, 0) >= limit) {
          toast(t3('Bir buyurtmada {n} tadan ortiq chipta boʻlmaydi.', 'В одном заказе не больше {n} билетов.', 'No more than {n} tickets per order.', { n: limit }), 'warn');
          return prev;
        }
        return [...prev, { id: s.id, sectorId: s.sector_id, sector: s.sector_label, row: s.row_label, seat: s.seat_label, price: s.ticket!.price, catId: s.ticket!.price_category_id }];
      });
    },
    [ga, limit, t3],
  );
  const pickSector = useCallback(
    (id: number) => {
      const s = sectors.find((x) => x.id === id);
      if (!s) return;
      if (!s.os || !sectorAvail(s)) {
        toast(t3('Bu sektorda boʻsh joy yoʻq.', 'В этом секторе нет свободных мест.', 'No free seats in this sector.'), 'warn');
        return;
      }
      setSectorId(id);
    },
    [sectors, t3],
  );

  const ev = evQ.data;
  const session = ev?.sessions?.find((s) => String(s.id) === sessionId);
  const startMs = parseApiDate(session?.session_starts_at);
  const eventUrl = `/events/${category}/${slug}`;
  const buyUrl = itSiteUrl(lang, `${eventUrl}/${sessionId}`);
  const pastSession = Number.isFinite(startMs) && parseApiDate(session?.session_ends_at || session?.session_starts_at) < Date.now();

  if (main.isLoading)
    return (
      <div className="mx-auto max-w-[1280px] px-4 pt-6 lg:px-5">
        <div className="h-8 w-1/2 animate-pulse rounded bg-line" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-[60vh] animate-pulse rounded-[var(--radius-card)] bg-line" />
          <div className="h-80 animate-pulse rounded-[var(--radius-card)] bg-line" />
        </div>
      </div>
    );
  if (main.isError || !m)
    return (
      <Empty
        className="min-h-[50vh]"
        title={t3('Zal sxemasi yuklanmadi', 'Не удалось загрузить схему зала', 'Could not load the seating plan')}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="dark" onClick={() => main.refetch()}>
              <RefreshCw className="size-4" /> {t3('Qayta urinish', 'Повторить', 'Retry')}
            </Button>
            <LinkButton to={eventUrl} variant="outline">
              {t3('Tadbirga qaytish', 'К событию', 'Back to the event')}
            </LinkButton>
          </div>
        }
      >
        {t3('Seans topilmadi yoki sotuv yopilgan.', 'Сеанс не найден или продажи закрыты.', 'The session was not found or sales are closed.')}
      </Empty>
    );

  const hasMap = !!m.options.svg_url && !onlyGa && !mapFailed;
  const gaSectors = sectors.filter((s) => s.is_ga);
  const seatSectors = sectors.filter((s) => !s.is_ga);
  const showGa = onlyGa || (!!sector && sector.is_ga);
  const gaLeft = limit - count;
  const descHtml = sanitizeHtml(session?.map_description || m.options.description);

  const setPick = (p: GaPick) =>
    setGa((prev) => {
      const othersCount = count - (prev[p.key]?.qty || 0);
      if (othersCount + p.qty > limit) {
        toast(t3('Bir buyurtmada {n} tadan ortiq chipta boʻlmaydi.', 'В одном заказе не больше {n} билетов.', 'No more than {n} tickets per order.', { n: limit }), 'warn');
        return prev;
      }
      const next = { ...prev };
      if (p.qty > 0) next[p.key] = p;
      else delete next[p.key];
      return next;
    });

  const summary = (
    <div className="flex flex-col gap-4">
      {count > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {sel.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <span className="size-3 shrink-0 rounded-full" style={{ background: colors[s.catId] }} />
              <div className="min-w-0 flex-1 text-[15px]">
                <div className="font-semibold">{t3('{r}-qator, {s}-joy', 'Ряд {r}, место {s}', 'Row {r}, seat {s}', { r: s.row, s: s.seat })}</div>
                {s.sector && <div className="text-sm text-ink-3">{s.sector}</div>}
              </div>
              <span className="font-semibold whitespace-nowrap">{sum(s.price)}</span>
              <button type="button" onClick={() => setSel((p) => p.filter((x) => x.id !== s.id))} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-black/5 hover:text-ink" aria-label={t3('Olib tashlash', 'Убрать', 'Remove')}>
                <X className="size-4" />
              </button>
            </li>
          ))}
          {Object.values(ga).map((p) => (
            <li key={p.key} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1 text-[15px]">
                <div className="font-semibold">
                  {p.name} × {p.qty}
                </div>
                <div className="text-sm text-ink-3">{p.sector}</div>
              </div>
              <span className="font-semibold whitespace-nowrap">{sum(p.price * p.qty)}</span>
              <button type="button" onClick={() => setPick({ ...p, qty: 0 })} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-black/5 hover:text-ink" aria-label={t3('Olib tashlash', 'Убрать', 'Remove')}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[15px] text-ink-3">
          {onlyGa
            ? t3('Chipta turini va sonini tanlang.', 'Выберите тип и количество билетов.', 'Choose the ticket type and quantity.')
            : t3('Sxemadan joy tanlang — rangi narxini bildiradi.', 'Выберите места на схеме — цвет означает цену.', 'Pick seats on the plan; the colour shows the price.')}
        </div>
      )}
      <div className="flex items-end justify-between gap-3 border-t border-line pt-4">
        <div>
          <div className="text-sm text-ink-3">{t3('Jami', 'Итого', 'Total')} · {t3('{n} ta chipta', '{n} бил.', '{n} tickets', { n: count })}</div>
          <div className="text-2xl font-extrabold tabular-nums">{sum(total)}</div>
        </div>
        {total > 0 && <div className="pb-1 text-sm text-ink-3">{usd(total)}</div>}
      </div>
      <a href={buyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-6 font-semibold text-ink transition hover:bg-brand-hover">
        {t3('iticket.uz’da davom etish', 'Продолжить на iticket.uz', 'Continue on iticket.uz')} <ExternalLink className="size-4" />
      </a>
      <p className="flex gap-2 text-xs text-ink-3">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {t3(
          'Sayohat joylarning jonli holatini koʻrsatadi (har 30 soniyada yangilanadi). Xarid va toʻlov iticket.uz’da yakunlanadi — u yerda shu joylarni tanlang.',
          'Sayohat показывает наличие мест в реальном времени (обновление каждые 30 секунд). Покупка и оплата завершаются на iticket.uz — выберите там эти же места.',
          'Sayohat shows live availability (refreshed every 30 seconds). Purchase and payment complete on iticket.uz: pick the same seats there.',
        )}
      </p>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-4 pb-28 lg:px-5 lg:pb-0 md:pt-6">
      <Link to={eventUrl} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> {ev?.name || t3('Tadbirga qaytish', 'К событию', 'Back to the event')}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-extrabold tracking-tight md:text-[34px]">{ev?.name || m.options.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-ink-2">
            {Number.isFinite(startMs) && (
              <span className="font-semibold">
                {fmtDate(startMs)}, {hhmm(startMs)}
              </span>
            )}
            <span>{session?.venue?.name || m.options.name}</span>
            {m.options.session_lang && <span className="text-ink-3">{session?.session_lang_label || m.options.session_lang}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
          </span>
          {t3('Jonli', 'Онлайн', 'Live')} · {t3('{n} ta boʻsh', 'свободно {n}', '{n} available', { n: m.options.available })} · {t3('yangilandi {t}', 'обновлено в {t}', 'updated {t}', { t: hhmm(main.dataUpdatedAt) })}
          <button type="button" onClick={() => (main.refetch(), needSectorManifest && secQ.refetch())} className="grid size-8 place-items-center rounded-full hover:bg-black/5" aria-label={t3('Yangilash', 'Обновить', 'Refresh')}>
            <RefreshCw className={clsx('size-4', (main.isFetching || secQ.isFetching) && 'animate-spin')} />
          </button>
        </div>
      </div>

      {pastSession && (
        <Notice tone="warn" className="mt-4">
          {t3('Bu seans oʻtib ketgan.', 'Этот сеанс уже прошёл.', 'This session is over.')}
        </Notice>
      )}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* plan */}
        <div className="min-w-0">
          {showGa ? (
            <Card>
              {sector && !onlyGa && (
                <button type="button" onClick={() => setSectorId(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-3 hover:text-ink">
                  <ChevronLeft className="size-4" /> {t3('Barcha sektorlar', 'Все секторы', 'All sectors')}
                </button>
              )}
              <h2 className="mb-4 text-xl font-bold">{onlyGa ? t3('Chiptalar', 'Билеты', 'Tickets') : sector?.name}</h2>
              <div className="flex flex-col gap-6">
                {(onlyGa ? gaSectors : sector ? [sector] : []).map((s) => (
                  <div key={s.id}>
                    {onlyGa && gaSectors.length > 1 && <div className="mb-2 font-semibold">{s.name}</div>}
                    <GaPanel sector={s} picks={ga} onChange={setPick} left={gaLeft} />
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {sectorMode && sector ? (
                  <Button variant="outline" size="sm" onClick={() => setSectorId(null)}>
                    <ChevronLeft className="size-4" /> {t3('Barcha sektorlar', 'Все секторы', 'All sectors')}
                    <span className="text-ink-3">· {sector.name}</span>
                  </Button>
                ) : sectorMode ? (
                  <div className="text-[15px] text-ink-2">{t3('Sektorni tanlang', 'Выберите сектор', 'Choose a sector')}</div>
                ) : (
                  <span />
                )}
                {hasMap && (!sectorMode || showingSector) && (
                  <Segmented
                    size="sm"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'map', label: <span className="inline-flex items-center gap-1.5"><MapIcon className="size-4" />{t3('Sxema', 'Схема', 'Plan')}</span> },
                      { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List className="size-4" />{t3('Roʻyxat', 'Список', 'List')}</span> },
                    ]}
                  />
                )}
              </div>
              {needSectorManifest && secQ.isLoading ? (
                <div className="grid h-[62vh] min-h-[360px] place-items-center rounded-[var(--radius-card)] bg-white text-ink-3">{t3('Sektor yuklanmoqda…', 'Загружаем сектор…', 'Loading the sector…')}</div>
              ) : needSectorManifest && secQ.isError ? (
                <Notice tone='bad' action={<Button size='sm' variant='dark' onClick={() => secQ.refetch()}>{t3('Qayta urinish', 'Повторить', 'Retry')}</Button>}>
                  {t3('Sektor yuklanmadi.', 'Не удалось загрузить сектор.', 'Could not load the sector.')}
                </Notice>
              ) : hasMap && mode === 'map' ? (
                <ItSeatMap
                  className="h-[62vh] min-h-[360px] border border-line"
                  svgUrl={svgUrl}
                  fallbackUrl={fallbackUrl}
                  seats={seats}
                  colors={colors}
                  selected={selectedIds}
                  onSeat={toggleSeat}
                  sectors={sectorMode && !showingSector ? sectors : undefined}
                  onSector={sectorMode && !showingSector ? pickSector : undefined}
                  focusSector={showingSector || !sectorMode ? sectorId : null}
                  onFailed={() => setMapFailed(true)}
                />
              ) : (
                <Card pad={false}>
                  {mapFailed && (
                    <div className="px-4 pt-4 text-sm text-ink-3">{t3('Sxema koʻrsatilmadi, joylar roʻyxati:', 'Схему показать не удалось, список мест:', 'The plan could not be shown; seat list:')}</div>
                  )}
                  {sectorMode && !showingSector ? (
                    <div className="p-4 text-ink-3">{t3('Oʻngdagi roʻyxatdan sektorni tanlang.', 'Выберите сектор в списке.', 'Choose a sector from the list.')}</div>
                  ) : (
                    <SeatList seats={seats} selected={selectedIds} onSeat={toggleSeat} colors={colors} />
                  )}
                </Card>
              )}
            </>
          )}
          {descHtml && (
            <details className="mt-4 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]">
              <summary className="cursor-pointer font-semibold">{t3('Seans haqida', 'О сеансе', 'About the session')}</summary>
              <div className="prose-it mt-3" dangerouslySetInnerHTML={{ __html: descHtml }} />
            </details>
          )}
        </div>

        {/* side panel */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {legends.length > 0 && !onlyGa && (
            <Card>
              <h2 className="mb-3 font-bold">{t3('Narxlar', 'Цены', 'Prices')}</h2>
              <LegendList legends={legends} />
            </Card>
          )}
          {!onlyGa && (sectorMode || seatSectors.length > 1 || gaSectors.length > 0) && sectors.length > 0 && (
            <Card>
              <h2 className="mb-3 font-bold">{t3('Sektorlar', 'Секторы', 'Sectors')}</h2>
              <ul className="flex flex-col gap-1">
                {sectors.map((s) => {
                  const av = sectorAvail(s);
                  const on = s.os && av > 0;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        disabled={!on}
                        onClick={() => (sectorMode || s.is_ga ? pickSector(s.id) : setSectorId((v) => (v === s.id ? null : s.id)))}
                        aria-pressed={sectorId === s.id}
                        className={clsx('flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-50', sectorId === s.id ? 'bg-brand font-semibold' : 'hover:bg-black/5')}
                      >
                        <span className="truncate">
                          {s.name}
                          {s.is_ga && <span className="ml-1.5 text-xs text-ink-3">{t3('erkin joylashuv', 'свободная рассадка', 'general admission')}</span>}
                        </span>
                        <span className="shrink-0 text-sm text-ink-3">{on ? t3('{n} ta', '{n} шт.', '{n} left', { n: av }) : t3('yoʻq', 'нет', 'none')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card>
            <h2 className="mb-3 font-bold">{t3('Tanlovingiz', 'Ваш выбор', 'Your selection')}</h2>
            {summary}
          </Card>
        </aside>
      </div>

      {/* mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-3">{t3('{n} ta chipta', '{n} бил.', '{n} tickets', { n: count })}</div>
            <div className="text-lg font-extrabold tabular-nums">{sum(total)}</div>
          </div>
          <a href={buyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-brand px-5 font-semibold text-ink">
            {t3('iticket.uz’da davom etish', 'Продолжить на iticket.uz', 'Continue on iticket.uz')} <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
