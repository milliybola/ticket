/* Entry check (US-41, US-42), made for a phone: pick the session, scan QR codes with the camera (full screen), from a
   photo or by order number. One ticket passes once even from two phones. Without a connection the check runs on the
   list downloaded earlier and the passes are sent when the connection is back. */
import { Camera, CheckCircle2, FlaskConical, Hash, ImageUp, ScanLine, ShieldAlert, Wifi, WifiOff, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { t3 as t3x, useI18n } from '../../lib/i18n';
import { maskDoc } from '../../lib/format';
import { fmtDT, hhmm, now } from '../../lib/time';
import { checkTicket, ctxTickets, entryContexts, evTitle, getEvent, getOrder, getTicket, markDenied, markUsed, unitInfo, unitWhen, type CheckResult, type EntryCtx } from '../../domain/rules';
import type { Ticket } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { refreshDb, tx, useDb } from '../../store/db';
import { Badge, Button, Card, Empty, Field, Input, Select, cn, toast } from '../../components/ui';
import { useTicker } from '../../features/ops/common';
import { beep, buildList, ctxLabel, decodeFile, decodePixels, defaultCtx, inCtx, loadList, normOrderNo, offlineText, resultTone, saveList, type Offline } from '../../features/ops/entry';

type Result = { res: CheckResult['res'] | 'denied'; t?: Ticket; from?: string; offline?: boolean; at: number };
type Recent = { at: number; res: Result['res']; label: string; type: string };

export default function Entry() {
  const { t3, tl } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const online = db.demo.entryOnline !== false;
  const list = useMemo(() => entryContexts(orgId), [orgId, db, db.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ctxKey, setCtxKey] = useState<string | null>(null);
  const ctx = list.find((c) => c.key === ctxKey) || defaultCtx(list);
  const [result, setResult] = useState<Result | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [cam, setCam] = useState(false);
  const [manual, setManual] = useState(false);
  const [busyPhoto, setBusyPhoto] = useState(false);

  // ---- the list downloaded for offline work
  const offRef = useRef<Offline | null>(null);
  const [offRev, setOffRev] = useState(0);
  if (!offRef.current) offRef.current = loadList(orgId) || buildList(orgId);
  const saveOff = useCallback(
    (l: Offline) => {
      offRef.current = l;
      saveList(orgId, l);
      setOffRev((x) => x + 1);
    },
    [orgId],
  );
  const refreshList = useCallback(() => saveOff(buildList(orgId, offRef.current)), [orgId, saveOff]);
  useTicker(30_000, online);
  useEffect(() => {
    if (online && (!offRef.current || now() - offRef.current.at > 25_000)) refreshList();
  });
  // back online: send the queued passes; the shared store decides who was first
  useEffect(() => {
    const l = offRef.current;
    if (!online || !l || !l.queue.length) return;
    let sent = 0;
    let clash = 0;
    for (const q of l.queue) {
      if (q.kind === 'deny') {
        markDenied(q.tid);
        continue;
      }
      const r = markUsed(q.tid, 'entry-offline');
      if (r.ok) sent++;
      else if (r.already) clash++;
    }
    saveOff(buildList(orgId, { ...l, queue: [] }));
    toast(
      clash
        ? t3('Aloqa tiklandi: {n} ta oʻtish yuborildi, {m} tasi boshqa telefondan oʻtgan', 'Связь восстановлена: отправлено {n}, {m} уже прошли с другого телефона', 'Back online: {n} passes sent, {m} had already passed on another phone', { n: sent, m: clash })
        : t3('Aloqa tiklandi: {n} ta oʻtish yuborildi', 'Связь восстановлена: отправлено проходов {n}', 'Back online: {n} passes sent', { n: sent }),
      clash ? 'warn' : 'ok',
    );
  }, [online, orgId, saveOff, t3]);

  const offMap = useMemo(() => new Map(Object.entries(offRef.current?.tickets || {})), [offRev]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctxList = (c: EntryCtx | null): Ticket[] => (!c ? [] : online ? ctxTickets(c) : [...offMap.values()].filter((t) => inCtx(t, c)));
  const sold = ctxList(ctx);
  const passed = sold.filter((t) => t.used).length;

  // ---- scanning
  const lastScan = useRef({ code: '', at: 0 });
  const push = (r: Result) => {
    setResult(r);
    setRecent((s) => [{ at: now(), res: r.res, label: r.t ? tl(r.t.lb) : '—', type: r.t?.tn ? tl(r.t.tn) : '' }, ...s].slice(0, 12));
    beep(resultTone(r.res === 'denied' ? 'err' : r.res));
  };
  const pass = (t: Ticket): Result => {
    if (online) {
      const m = markUsed(t.id, 'entry');
      const l = offRef.current!;
      const local = l.tickets[t.id];
      if (local) {
        local.used = m.ok ? getTicket(t.id)?.used || now() : m.already || local.used;
        saveOff(l);
      }
      if (!m.ok && m.already) return { res: 'used', t: { ...t, used: m.already }, at: now() };
      return { res: 'ok', t: getTicket(t.id) || t, at: now() };
    }
    const l = offRef.current!;
    const local = l.tickets[t.id] || t;
    local.used = now();
    l.tickets[t.id] = local;
    l.queue.push({ tid: t.id, at: now(), kind: 'pass' });
    saveOff(l);
    return { res: 'ok', t: local, offline: true, at: now() };
  };
  const handle = (code: string, fromCamera = false) => {
    if (!ctx || !code) return;
    const n = Date.now();
    if (fromCamera) {
      if (code === lastScan.current.code && n - lastScan.current.at < 3000) return;
      if (result?.res === 'confirm' && n - result.at < 60_000 && code === result.t?.code) return;
    }
    lastScan.current = { code, at: n };
    if (online) refreshDb();
    const r = checkTicket(code, ctx, online ? undefined : offMap);
    if (r.res === 'ok') return push(pass(r.t));
    push({ ...r, at: now() } as Result);
  };
  const letIn = () => {
    if (result?.res !== 'confirm' || !result.t) return;
    push(pass(result.t));
  };
  const deny = () => {
    if (result?.res !== 'confirm' || !result.t) return;
    const t = result.t;
    if (online) markDenied(t.id);
    else {
      const l = offRef.current!;
      l.queue.push({ tid: t.id, at: now(), kind: 'deny' });
      saveOff(l);
    }
    push({ res: 'denied', t, at: now(), offline: !online });
  };
  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusyPhoto(true);
    const code = await decodeFile(f);
    setBusyPhoto(false);
    if (code) handle(code);
    else toast(t3('Rasmda QR-kod topilmadi. Yaqinroqdan, aniq suratga oling.', 'На фото не найден QR-код. Снимите ближе и чётче.', 'No QR code found in the photo. Take a closer, sharper picture.'), 'bad');
  };

  if (!list.length)
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-4 text-2xl font-bold">{t3('Kirish nazorati', 'Проверка на входе', 'Entry check')}</h1>
        <Card>
          <Empty icon={<ScanLine className="size-10" />} title={t3('Tekshirish uchun seanslar yoʻq', 'Нет сеансов для проверки', 'No sessions to check')}>
            {t3('Bu yerda eʼlon qilingan tadbirlarning soʻnggi 6 soat va keyingi 3 kundagi seanslari chiqadi.', 'Здесь появляются сеансы опубликованных мероприятий за последние 6 часов и ближайшие 3 дня.', 'Sessions of published events from the last 6 hours and the next 3 days show up here.')}
          </Empty>
        </Card>
      </div>
    );

  const counter = (
    <div className="flex items-center gap-3">
      <span className="text-[15px]">
        {t3('Kirdi', 'Прошло', 'Passed')} <b className="text-2xl tabular-nums">{passed}</b> <span className="text-ink-3">/ {t3('sotilgan', 'продано', 'sold')}</span> <b className="tabular-nums">{sold.length}</b>
      </span>
      <span className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-black/10">
        <span className="block h-full rounded-full bg-ok" style={{ width: `${sold.length ? Math.round((passed / sold.length) * 100) : 0}%` }} />
      </span>
    </div>
  );
  const queueN = offRef.current?.queue.length || 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t3('Kirish nazorati', 'Проверка на входе', 'Entry check')}</h1>
        <NetChip online={online} at={offRef.current?.at || null} queue={queueN} />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <Field label={t3('Seans', 'Сеанс', 'Session')}>
            <Select
              value={ctx?.key || ''}
              onChange={(e) => {
                setCtxKey(e.target.value);
                setResult(null);
              }}
            >
              {list.map((c) => (
                <option key={c.key} value={c.key}>
                  {ctxLabel(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Card className="!p-4">{counter}</Card>
          <Button size="lg" block onClick={() => setCam(true)}>
            <Camera className="size-6" />
            {t3('Skanerlash', 'Сканировать', 'Scan')}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <label className={cn('inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-2 bg-white px-3 text-[15px] font-semibold hover:border-ink', busyPhoto && 'opacity-60')}>
              <ImageUp className="size-5" />
              {t3('QR surati', 'Фото QR', 'QR photo')}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} disabled={busyPhoto} />
            </label>
            <Button variant={manual ? 'dark' : 'outline'} onClick={() => setManual((m) => !m)}>
              <Hash className="size-5" />
              {t3('Raqamni qoʻlda kiritish', 'Ввести номер вручную', 'Enter number')}
            </Button>
          </div>
          {manual && ctx && <ManualEntry ctx={ctx} online={online} offMap={offMap} onPick={(t) => handle(t.code)} />}
          <DemoTickets ctx={ctx} pool={online ? db.tickets : [...offMap.values()]} sold={sold} orgEvIds={new Set(db.events.filter((e) => e.orgId === orgId).map((e) => e.id))} onScan={(c) => handle(c)} />
        </div>
        <div className="space-y-4">
          {result ? (
            <ResultPanel r={result} onLetIn={letIn} onDeny={deny} />
          ) : (
            <Card className="text-center text-ink-3">
              <ScanLine className="mx-auto mb-2 size-10" />
              {t3('Chipta QR-kodini skanerlang — natija shu yerda chiqadi.', 'Отсканируйте QR-код билета — результат появится здесь.', 'Scan a ticket QR code: the result shows here.')}
            </Card>
          )}
          {recent.length > 0 && (
            <Card className="!p-4">
              <h2 className="mb-2 font-semibold">{t3('Soʻnggi tekshiruvlar', 'Последние проверки', 'Recent checks')}</h2>
              <ul className="divide-y divide-line text-sm">
                {recent.map((x, i) => (
                  <li key={i} className="flex items-center gap-2 py-1.5">
                    <span className={cn('size-2.5 shrink-0 rounded-full', x.res === 'ok' ? 'bg-ok' : x.res === 'confirm' || x.res === 'early' ? 'bg-warn' : 'bg-bad')} />
                    <span className="w-12 shrink-0 text-ink-3 tabular-nums">{hhmm(x.at)}</span>
                    <span className="min-w-0 flex-1 truncate">{x.label}</span>
                    {x.type && <span className="shrink-0 text-ink-3">{x.type}</span>}
                    <span className="shrink-0 font-medium">{resTitle(x.res)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {cam && ctx && (
        <CameraOverlay
          title={ctxLabel(ctx)}
          counter={counter}
          onClose={() => setCam(false)}
          onCode={(c) => handle(c, true)}
          result={result}
          onLetIn={letIn}
          onDeny={deny}
          net={!online ? <NetChip online={false} at={offRef.current?.at || null} queue={queueN} /> : null}
        />
      )}
    </div>
  );
}

function resTitle(res: Result['res']) {
  switch (res) {
    case 'ok':
      return t3x('Kirish ruxsat etildi', 'Проход разрешён', 'Entry allowed');
    case 'confirm':
      return t3x('Hujjatni tekshiring', 'Проверьте документ', 'Check the document');
    case 'used':
      return t3x('Allaqachon ishlatilgan', 'Уже использован', 'Already used');
    case 'other':
      return t3x('Bu seans emas', 'Не этот сеанс', 'Not this session');
    case 'early':
      return t3x('Erta', 'Рано', 'Too early');
    case 'late':
      return t3x('Kech', 'Поздно', 'Too late');
    case 'denied':
      return t3x('Rad etildi', 'Отказано', 'Denied');
    default:
      return t3x('Chipta topilmadi', 'Билет не найден', 'Ticket not found');
  }
}

function NetChip({ online, at, queue }: { online: boolean; at: number | null; queue: number }) {
  const { t3 } = useI18n();
  const flip = () => tx((d) => void (d.demo.entryOnline = !online));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {online ? (
        <Badge tone="ok" className="!text-sm">
          <Wifi className="size-4" />
          {t3('Aloqa bor', 'Связь есть', 'Online')}
        </Badge>
      ) : (
        <Badge tone="bad" className="!text-sm whitespace-normal">
          <WifiOff className="size-4 shrink-0" />
          {offlineText(at)}
        </Badge>
      )}
      {queue > 0 && <Badge tone="warn">{t3('Navbatda: {n}', 'В очереди: {n}', 'Queued: {n}', { n: queue })}</Badge>}
      <button type="button" onClick={flip} className="rounded-lg px-2 py-1 text-xs text-ink-3 underline hover:text-ink" title={t3('Demo: internetni oʻchirish/yoqish', 'Демо: выключить/включить интернет', 'Demo: switch the connection')}>
        {online ? t3('Demo: aloqani uzish', 'Демо: отключить связь', 'Demo: go offline') : t3('Demo: aloqani tiklash', 'Демо: вернуть связь', 'Demo: go online')}
      </button>
    </div>
  );
}

function ResultPanel({ r, onLetIn, onDeny, compact }: { r: Result; onLetIn: () => void; onDeny: () => void; compact?: boolean }) {
  const { t3, tl } = useI18n();
  const t = r.t;
  const u = t ? unitInfo(t.sid) : null;
  const place = t ? (t.k === 'slot' && u ? `${t3('Slot', 'Слот', 'Slot')} ${u.start}–${u.end}` : tl(t.lb)) : '';
  const tone = r.res === 'ok' ? 'ok' : r.res === 'confirm' || r.res === 'early' ? 'warn' : 'bad';
  const head = { ok: 'bg-ok text-white', warn: 'bg-[#f2b705] text-ink', bad: 'bg-bad text-white' }[tone];
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? ShieldAlert : XCircle;
  let sub = '';
  if (r.res === 'used' && t?.used) sub = t3('Birinchi oʻtish: {t}', 'Первый проход: {t}', 'First pass: {t}', { t: fmtDT(t.used) });
  if (r.res === 'other' && t) {
    const ev = getEvent(t.ev);
    sub = `${ev ? evTitle(ev) : ''} · ${u ? unitWhen(u) : ''}`;
  }
  if (r.res === 'early') sub = t3('Slot {f} dan', 'Слот с {f}', 'The slot starts at {f}', { f: r.from || u?.start || '' });
  if (r.res === 'late' && u) sub = t3('Slot {a}–{b} tugagan', 'Слот {a}–{b} закончился', 'The slot {a}–{b} is over', { a: u.start || '', b: u.end || '' });
  if (r.res === 'notfound') sub = t3('QR Sayohatga tegishli emas yoki shikastlangan', 'QR не принадлежит Sayohat или повреждён', 'The QR is not a Sayohat ticket or is damaged');
  if (r.res === 'denied') sub = t3('Chipta ishlatilmadi — hujjat bilan qaytsa, qayta skanerlang', 'Билет не использован — если гость вернётся с документом, отсканируйте снова', 'The ticket is not used: scan it again if the guest returns with the document');
  if (r.res === 'ok' && r.offline) sub = t3('Aloqa tiklanganda yuboriladi', 'Отправится, когда вернётся связь', 'Will be sent when back online');
  const showType = !!t?.tn && (r.res === 'ok' || r.res === 'confirm' || r.res === 'denied' || r.res === 'early');
  return (
    <div className={cn('overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]', compact && 'shadow-2xl')} role="status" aria-live="assertive">
      <div className={cn('flex items-center gap-3 px-5', compact ? 'py-3' : 'py-5', head)}>
        <Icon className={compact ? 'size-8 shrink-0' : 'size-10 shrink-0'} />
        <div className="min-w-0">
          <div className={cn('font-extrabold leading-tight', compact ? 'text-xl' : 'text-2xl')}>{resTitle(r.res)}</div>
          {sub && <div className="mt-0.5 text-[15px] opacity-90">{sub}</div>}
        </div>
      </div>
      {t && r.res !== 'notfound' && (
        <div className={cn('space-y-3 px-5', compact ? 'py-3' : 'py-4')}>
          {showType && t.rq ? <div className={cn('font-black tracking-wide uppercase', compact ? 'text-3xl' : 'text-4xl')}>{tl(t.tn)}</div> : null}
          {t.rq && (r.res === 'confirm' || r.res === 'ok' || r.res === 'denied') && <div className="rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-ink">{tl(t.rq)}</div>}
          {t.v && (
            <div className="rounded-xl bg-page px-4 py-2.5">
              <div className="font-semibold">{t.v.name}</div>
              <div className="text-ink-2">
                {t3('Pasport', 'Паспорт', 'Passport')} <b className="font-mono">{maskDoc(t.v.doc)}</b>
                {t.v.country ? ` · ${t.v.country}` : ''} · {t.v.citizen ? t3('fuqaro', 'гражданин', 'citizen') : t3('xorijiy', 'иностранец', 'foreigner')}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-lg font-semibold">{place}</div>
            {showType && !t.rq && <Badge tone="info">{tl(t.tn)}</Badge>}
          </div>
          <div className="text-sm text-ink-3">
            {t3('Buyurtma', 'Заказ', 'Order')} {t.oid}
          </div>
          {r.res === 'confirm' && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="ok" size="lg" onClick={onLetIn}>
                {t3('Oʻtkazish', 'Пропустить', 'Let in')}
              </Button>
              <Button variant="danger" size="lg" onClick={onDeny}>
                {t3('Rad etish', 'Отказать', 'Deny')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Damaged QR: type the order number, see the tickets of the order for this session, pick one. */
function ManualEntry({ ctx, online, offMap, onPick }: { ctx: EntryCtx; online: boolean; offMap: Map<string, Ticket>; onPick: (t: Ticket) => void }) {
  const { t3, tl } = useI18n();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; here: Ticket[]; other: Ticket[] } | null | 'none'>(null);
  const search = (e: FormEvent) => {
    e.preventDefault();
    const id = normOrderNo(q);
    if (!id) return;
    let ts: Ticket[];
    if (online) {
      refreshDb();
      const o = getOrder(id);
      ts = o ? (o.tickets.map(getTicket).filter(Boolean) as Ticket[]) : [];
    } else ts = [...offMap.values()].filter((t) => t.oid === id);
    if (!ts.length) return setFound('none');
    setFound({ id, here: ts.filter((t) => inCtx(t, ctx)), other: ts.filter((t) => !inCtx(t, ctx)) });
  };
  const fresh = (t: Ticket) => (online ? getTicket(t.id) || t : offMap.get(t.id) || t);
  return (
    <Card className="!p-4">
      <form onSubmit={search} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SY-100245" autoCapitalize="characters" autoComplete="off" aria-label={t3('Buyurtma raqami', 'Номер заказа', 'Order number')} autoFocus />
        <Button type="submit" variant="dark">
          {t3('Topish', 'Найти', 'Find')}
        </Button>
      </form>
      {found === 'none' && <p className="mt-3 text-sm text-bad">{t3('Bunday buyurtma topilmadi', 'Заказ не найден', 'Order not found')}</p>}
      {found && found !== 'none' && (
        <div className="mt-3 space-y-2">
          {found.here.length ? (
            found.here.map((t0) => {
              const t = fresh(t0);
              return (
                <button key={t.id} type="button" onClick={() => onPick(t)} className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:border-ink">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{tl(t.lb)}</b>
                    {t.tn && <span className="text-sm text-ink-3">{tl(t.tn)}</span>}
                  </span>
                  {t.used ? <Badge tone="bad">{t3('Oʻtgan {t}', 'Прошёл {t}', 'Passed {t}', { t: hhmm(t.used) })}</Badge> : <Badge tone="ok">{t3('Tanlash', 'Выбрать', 'Pick')}</Badge>}
                </button>
              );
            })
          ) : (
            <p className="text-sm text-bad">{t3('Bu buyurtmada shu seans uchun chipta yoʻq', 'В этом заказе нет билетов на этот сеанс', 'This order has no tickets for this session')}</p>
          )}
          {found.other.length > 0 && (
            <p className="text-sm text-ink-3">
              {t3('Boshqa seans chiptalari: {n}', 'Билетов на другие сеансы: {n}', 'Tickets for other sessions: {n}', { n: found.other.length })}
              {(() => {
                const u = unitInfo(found.other[0].sid);
                return u ? ` (${evTitle(u.ev)} · ${unitWhen(u)})` : '';
              })()}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Demo: buttons that "scan" real tickets of the demo data (a laptop may have no camera). */
function DemoTickets({ ctx, pool, sold, orgEvIds, onScan }: { ctx: EntryCtx | null; pool: Ticket[]; sold: Ticket[]; orgEvIds: Set<string>; onScan: (code: string) => void }) {
  const { t3 } = useI18n();
  if (!ctx) return null;
  const inSlot = (t: Ticket) => {
    if (!ctx.museum) return true;
    const u = unitInfo(t.sid);
    return !!u && now() >= u.startsAt && now() < u.endsAt;
  };
  const valid = sold.find((t) => !t.used && !t.rq && inSlot(t));
  const withReq = sold.find((t) => !t.used && t.rq && inSlot(t));
  const used = sold.find((t) => t.used);
  const other = pool.find((t) => orgEvIds.has(t.ev) && !inCtx(t, ctx));
  const early = ctx.museum ? sold.find((t) => !t.used && (unitInfo(t.sid)?.startsAt || 0) > now()) : undefined;
  const none = t3('Bu seansda bunday chipta yoʻq', 'В этом сеансе такого билета нет', 'No such ticket in this session');
  const btn = (label: string, t: Ticket | undefined, tone: 'ok' | 'warn' | 'bad', why = none) => (
    <button
      key={label}
      type="button"
      disabled={!t}
      title={t ? '' : why}
      onClick={() => t && onScan(t.code)}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-sm font-medium disabled:opacity-40',
        tone === 'ok' ? 'border-ok text-ok' : tone === 'warn' ? 'border-warn text-warn' : 'border-bad text-bad',
      )}
    >
      {label}
    </button>
  );
  return (
    <details className="rounded-2xl border border-dashed border-line-2 bg-white p-4" open>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-2">
        <FlaskConical className="size-4" />
        {t3('Demo: test chiptalar', 'Демо: тестовые билеты', 'Demo: test tickets')}
      </summary>
      <p className="mt-2 text-sm text-ink-3">
        {t3('Kamera boʻlmasa, bu tugmalar demo maʼlumotlardagi haqiqiy chiptalarni «skanerlaydi». Bir chiptani ikki telefondan tekshirish uchun «Kirish»ni ikki varaqda oching.', 'Если камеры нет, эти кнопки «сканируют» настоящие билеты демо-данных. Откройте «Вход» в двух вкладках, чтобы проверить один билет с двух телефонов.', 'Without a camera, these buttons "scan" real tickets of the demo data. Open the entry check in two tabs to try one ticket on two phones.')}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {btn(t3('Haqiqiy', 'Действительный', 'Valid'), valid, 'ok')}
        {btn(t3('Talab bilan', 'С требованием', 'With a requirement'), withReq, 'warn', t3('Talabli chiptalar yoʻq — masalan, spektakldagi «Talaba»', 'Нет билетов с требованием — например, «Студент» у спектакля', 'No tickets with a requirement, e.g. "Student" at a play'))}
        {btn(t3('Allaqachon oʻtgan', 'Уже прошёл', 'Already used'), used, 'bad', t3('Hali hech kim oʻtmagan — avval istalgan chiptani oʻtkazing', 'Пока никто не прошёл — сначала пропустите любой билет', 'Nobody has passed yet: let any ticket through first'))}
        {btn(t3('Boshqa seans', 'Другой сеанс', 'Another session'), other, 'bad')}
        {ctx.museum && btn(t3('Erta (keyingi slot)', 'Рано (слот позже)', 'Too early (later slot)'), early, 'warn', t3('Bugun keyingi slotga chipta yoʻq', 'Нет билетов на более поздний слот сегодня', 'No tickets for a later slot today'))}
        <button type="button" onClick={() => onScan('https://example.com/not-a-sayohat-ticket')} className="rounded-lg border border-bad px-2.5 py-1.5 text-sm font-medium text-bad">
          {t3('Begona QR', 'Чужой QR', 'Foreign QR')}
        </button>
      </div>
    </details>
  );
}

/** Full-screen camera with a QR decoding loop on a canvas. */
function CameraOverlay({ title, counter, onClose, onCode, result, onLetIn, onDeny, net }: { title: string; counter: React.ReactNode; onClose: () => void; onCode: (c: string) => void; result: Result | null; onLetIn: () => void; onDeny: () => void; net: React.ReactNode }) {
  const { t3 } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stop = false;
    let last = 0;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr(t3('Bu brauzerda kamera mavjud emas (HTTPS kerak). «QR surati» yoki raqamni qoʻlda kiritishdan foydalaning.', 'В этом браузере камера недоступна (нужен HTTPS). Используйте «Фото QR» или ввод номера.', 'The camera isn’t available in this browser (HTTPS is required). Use "QR photo" or type the number.'));
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (e) {
        const name = (e as { name?: string }).name;
        setErr(
          name === 'NotAllowedError'
            ? t3('Kameraga ruxsat berilmagan. Brauzer sozlamalarida ruxsat bering.', 'Нет доступа к камере. Разрешите его в настройках браузера.', 'Camera access is denied. Allow it in the browser settings.')
            : t3('Kamerani yoqib boʻlmadi', 'Не удалось включить камеру', 'Could not start the camera'),
        );
        return;
      }
      if (stop) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      v.setAttribute('playsinline', 'true');
      v.muted = true;
      await v.play().catch(() => undefined);
      setReady(true);
      const c = document.createElement('canvas');
      const g = c.getContext('2d', { willReadFrequently: true });
      const loop = (ts: number) => {
        if (stop) return;
        raf = requestAnimationFrame(loop);
        if (ts - last < 110 || !g || v.readyState < 2 || !v.videoWidth) return;
        last = ts;
        const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
        const w = Math.round(v.videoWidth * k);
        const h = Math.round(v.videoHeight * k);
        if (c.width !== w) c.width = w;
        if (c.height !== h) c.height = h;
        g.drawImage(v, 0, 0, w, h);
        const code = decodePixels(g.getImageData(0, 0, w, h));
        if (code) onCodeRef.current(code);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      document.body.style.overflow = prevOverflow;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="fixed inset-0 z-[150] flex flex-col bg-black text-white">
      <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted />
      <div className="relative z-10 space-y-2 bg-gradient-to-b from-black/80 to-transparent p-4 pb-8">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-[15px] font-semibold">{title}</div>
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25" aria-label={t3('Yopish', 'Закрыть', 'Close')}>
            <X className="size-6" />
          </button>
        </div>
        <div className="rounded-xl bg-white/90 px-3 py-2 text-ink">{counter}</div>
        {net}
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center">
        {err ? (
          <div className="mx-6 max-w-sm rounded-2xl bg-white p-5 text-center text-ink">
            <Camera className="mx-auto mb-2 size-8 text-ink-3" />
            {err}
            <Button className="mt-4" variant="dark" onClick={onClose}>
              {t3('Yopish', 'Закрыть', 'Close')}
            </Button>
          </div>
        ) : (
          <div className="relative size-64 rounded-3xl border-4 border-brand/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
            {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-white/80">{t3('Kamera yoqilmoqda…', 'Включаем камеру…', 'Starting the camera…')}</div>}
          </div>
        )}
      </div>
      <div className="relative z-10 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {result ? (
          <ResultPanel r={result} onLetIn={onLetIn} onDeny={onDeny} compact />
        ) : (
          <div className="rounded-2xl bg-black/60 px-4 py-3 text-center text-[15px]">{t3('Kamerani chipta QR-kodiga qarating', 'Наведите камеру на QR-код билета', 'Point the camera at the ticket QR code')}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
