/* Sales report (US-43): per event and session, online and box office separately, by ticket type, passes by QR;
   CSV export with the same numbers; the box office day report for the end of a shift. */
import { ChevronDown, ChevronRight, Download, FileBarChart } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { nfmt, sum } from '../../lib/format';
import { addDays, fmtDate, fmtDT, hhmm, todayKey } from '../../lib/time';
import { downloadBlob, sumBy, toCsv } from '../../lib/util';
import { boxDay, eventSessions, evTitle, salesRows, type SalesRow } from '../../domain/rules';
import type { Channel } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { useDb } from '../../store/db';
import { Button, Card, Empty, Field, Input, PageHeader, Select, Stat, Tabs, cn } from '../../components/ui';

export default function Reports() {
  const { t3 } = useI18n();
  const [tab, setTab] = useState<'sales' | 'box'>('sales');
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t3('Hisobotlar', 'Отчёты', 'Reports')} sub={t3('Sayohat komissiyasi va toʻlovlar MVPda koʻrsatilmaydi.', 'Комиссия Sayohat и выплаты в MVP не показываются.', 'Sayohat commission and payouts are not shown in the MVP.')} />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'sales', label: t3('Sotuvlar', 'Продажи', 'Sales') },
          { value: 'box', label: t3('Kassa kunlik hisoboti', 'Кассовый отчёт за день', 'Box office day report') },
        ]}
      />
      {tab === 'sales' ? <SalesReport /> : <BoxDayReport />}
    </div>
  );
}

function SalesReport() {
  const { t3, lang } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const [from, setFrom] = useState(addDays(todayKey(), -30));
  const [to, setTo] = useState(todayKey());
  const [ev, setEv] = useState('');
  const [sid, setSid] = useState('');
  const [ch, setCh] = useState<Channel | ''>('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const evs = db.events.filter((e) => e.orgId === orgId && (e.firstPublishedAt || e.status === 'published'));
  const curEv = evs.find((e) => e.id === ev);
  const sessions = curEv && curEv.kind !== 'museum' ? eventSessions(curEv.id) : [];
  const rows = useMemo(() => salesRows(orgId, { from, to, ev: ev || undefined, ch, sid: sid || undefined }), [orgId, from, to, ev, ch, sid, db, db.rev, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const tot = {
    on: sumBy(rows, (r) => r.on),
    box: sumBy(rows, (r) => r.box),
    sOn: sumBy(rows, (r) => r.sOn),
    sBox: sumBy(rows, (r) => r.sBox),
    passed: sumBy(rows, (r) => r.passed),
  };
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const exportCsv = () => {
    const head = [
      t3('Tadbir', 'Мероприятие', 'Event'),
      t3('Seans', 'Сеанс', 'Session'),
      t3('Chipta turi', 'Тип билета', 'Ticket type'),
      t3('Sotildi: onlayn', 'Продано: онлайн', 'Sold: online'),
      t3('Sotildi: kassa', 'Продано: касса', 'Sold: box office'),
      t3('Sotildi: jami', 'Продано: всего', 'Sold: total'),
      t3('Summa: onlayn', 'Сумма: онлайн', 'Amount: online'),
      t3('Summa: kassa', 'Сумма: касса', 'Amount: box office'),
      t3('Summa: jami', 'Сумма: всего', 'Amount: total'),
      t3('QR orqali oʻtdi', 'Прошло по QR', 'Passed by QR'),
    ];
    const out: (string | number)[][] = [[t3('Davr', 'Период', 'Period'), `${from} — ${to}`], head];
    for (const r of rows) {
      out.push([evTitle(r.ev), r.when, '', r.on, r.box, r.on + r.box, r.sOn, r.sBox, r.sOn + r.sBox, r.passed]);
      for (const [name, x] of Object.entries(r.types)) out.push([evTitle(r.ev), r.when, name, '', '', x.n, '', '', x.s, '']);
    }
    out.push([t3('Jami', 'Итого', 'Total'), '', '', tot.on, tot.box, tot.on + tot.box, tot.sOn, tot.sBox, tot.sOn + tot.sBox, tot.passed]);
    downloadBlob(new Blob([toCsv(out)], { type: 'text/csv;charset=utf-8' }), `sayohat-report-${from}-${to}.csv`);
  };

  return (
    <>
      <Card className="mb-5 !p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t3('Dan', 'С', 'From')}>
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t3('Gacha', 'По', 'To')}>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label={t3('Tadbir', 'Мероприятие', 'Event')}>
            <Select
              value={ev}
              onChange={(e) => {
                setEv(e.target.value);
                setSid('');
              }}
            >
              <option value="">{t3('Barcha tadbirlar', 'Все мероприятия', 'All events')}</option>
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {evTitle(e)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t3('Seans', 'Сеанс', 'Session')}>
            <Select value={sid} onChange={(e) => setSid(e.target.value)} disabled={!sessions.length}>
              <option value="">{t3('Barcha seanslar', 'Все сеансы', 'All sessions')}</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmtDT(s.startsAt)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t3('Kanal', 'Канал', 'Channel')}>
            <Select value={ch} onChange={(e) => setCh(e.target.value as Channel | '')}>
              <option value="">{t3('Hammasi', 'Все', 'All')}</option>
              <option value="online">{t3('Onlayn', 'Онлайн', 'Online')}</option>
              <option value="box">{t3('Kassa', 'Касса', 'Box office')}</option>
            </Select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-3">{t3('Davr — sotuv sanasi boʻyicha (Toshkent vaqti).', 'Период — по дате продажи (время Ташкента).', 'The period is by sale date (Tashkent time).')}</p>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t3('Sotilgan chiptalar', 'Продано билетов', 'Tickets sold')} value={tot.on + tot.box} sub={t3('onlayn {a} · kassa {b}', 'онлайн {a} · касса {b}', 'online {a} · box {b}', { a: tot.on, b: tot.box })} />
        <Stat label={t3('Tushum', 'Выручка', 'Revenue')} value={<span className="text-xl">{sum(tot.sOn + tot.sBox)}</span>} />
        <Stat label={t3('Onlayn', 'Онлайн', 'Online')} value={<span className="text-xl">{sum(tot.sOn)}</span>} />
        <Stat label={t3('Kassa', 'Касса', 'Box office')} value={<span className="text-xl">{sum(tot.sBox)}</span>} />
      </div>

      <div className="mb-3 flex justify-end">
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="size-4" />
          {t3('Excel’ga yuklab olish', 'Скачать в Excel', 'Download for Excel')}
        </Button>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[900px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                <th className="px-4 py-3 font-medium" rowSpan={2}>
                  {t3('Tadbir va seans', 'Мероприятие и сеанс', 'Event and session')}
                </th>
                <th className="px-4 pt-3 text-center font-medium" colSpan={3}>
                  {t3('Sotilgan chiptalar', 'Продано билетов', 'Tickets sold')}
                </th>
                <th className="px-4 pt-3 text-center font-medium" colSpan={3}>
                  {t3('Summa', 'Сумма', 'Amount')}
                </th>
                <th className="px-4 py-3 text-right font-medium" rowSpan={2}>
                  {t3('QR orqali oʻtdi', 'Прошло по QR', 'Passed by QR')}
                </th>
              </tr>
              <tr className="border-b border-line text-xs text-ink-3">
                {[0, 1].map((i) => (
                  <Fragment key={i}>
                    <th className="px-4 pb-2 text-right font-medium">{t3('onlayn', 'онлайн', 'online')}</th>
                    <th className="px-4 pb-2 text-right font-medium">{t3('kassa', 'касса', 'box')}</th>
                    <th className="px-4 pb-2 text-right font-medium">{t3('jami', 'всего', 'total')}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <ReportRow key={r.key} r={r} open={open.has(r.key)} onToggle={() => toggle(r.key)} />
              ))}
              <tr className="border-t-2 border-ink bg-page font-bold">
                <td className="px-4 py-3">{t3('Jami', 'Итого', 'Total')}</td>
                <td className="px-4 py-3 text-right">{tot.on}</td>
                <td className="px-4 py-3 text-right">{tot.box}</td>
                <td className="px-4 py-3 text-right">{tot.on + tot.box}</td>
                <td className="px-4 py-3 text-right">{nfmt(tot.sOn)}</td>
                <td className="px-4 py-3 text-right">{nfmt(tot.sBox)}</td>
                <td className="px-4 py-3 text-right">{nfmt(tot.sOn + tot.sBox)}</td>
                <td className="px-4 py-3 text-right">{tot.passed}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <Empty icon={<FileBarChart className="size-10" />} title={t3('Bu davrda sotuvlar yoʻq', 'За этот период продаж нет', 'No sales in this period')}>
            {t3('Davrni kengaytiring yoki filtrlarni oʻzgartiring. Hisobotda faqat toʻlangan chiptalar hisoblanadi.', 'Расширьте период или измените фильтры. В отчёт попадают только оплаченные билеты.', 'Widen the period or change the filters. Only paid tickets are counted.')}
          </Empty>
        </Card>
      )}
    </>
  );
}

function ReportRow({ r, open, onToggle }: { r: SalesRow; open: boolean; onToggle: () => void }) {
  const { t3 } = useI18n();
  const types = Object.entries(r.types);
  return (
    <>
      <tr className="border-b border-line">
        <td className="px-4 py-3">
          <button type="button" className={cn('flex items-start gap-1.5 text-left', !types.length && 'cursor-default')} onClick={types.length ? onToggle : undefined} aria-expanded={types.length ? open : undefined}>
            {types.length ? open ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" /> : <span className="w-4 shrink-0" />}
            <span>
              <b className="block font-semibold">{evTitle(r.ev)}</b>
              <span className="text-sm text-ink-3">
                {r.when}
                {types.length > 0 && ` · ${t3('turlar: {n}', 'типов: {n}', 'types: {n}', { n: types.length })}`}
              </span>
            </span>
          </button>
        </td>
        <td className="px-4 py-3 text-right">{r.on}</td>
        <td className="px-4 py-3 text-right">{r.box}</td>
        <td className="px-4 py-3 text-right font-semibold">{r.on + r.box}</td>
        <td className="px-4 py-3 text-right">{nfmt(r.sOn)}</td>
        <td className="px-4 py-3 text-right">{nfmt(r.sBox)}</td>
        <td className="px-4 py-3 text-right font-semibold">{nfmt(r.sOn + r.sBox)}</td>
        <td className="px-4 py-3 text-right">{r.passed}</td>
      </tr>
      {open &&
        types.map(([name, x]) => (
          <tr key={name} className="border-b border-line bg-page text-sm">
            <td className="py-2 pr-4 pl-10 text-ink-2">{name}</td>
            <td className="px-4 py-2" colSpan={2} />
            <td className="px-4 py-2 text-right">{x.n}</td>
            <td className="px-4 py-2" colSpan={2} />
            <td className="px-4 py-2 text-right">{nfmt(x.s)}</td>
            <td className="px-4 py-2" />
          </tr>
        ))}
    </>
  );
}

function BoxDayReport() {
  const { t3 } = useI18n();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const [date, setDate] = useState(todayKey());
  const r = useMemo(() => boxDay(orgId, date), [orgId, date, db, db.rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportCsv = () => {
    const out: (string | number)[][] = [
      [t3('Kassa hisoboti', 'Отчёт кассы', 'Box office report'), date],
      [t3('Naqd', 'Наличные', 'Cash'), r.cash],
      ['QR', r.qr],
      [t3('Sotuvlar', 'Продаж', 'Sales'), r.count],
      [t3('Chiptalar', 'Билетов', 'Tickets'), r.tickets],
      [t3('Qayta chop etish', 'Повторных печатей', 'Reprints'), r.reprints],
      [],
      [t3('Vaqt', 'Время', 'Time'), t3('Buyurtma', 'Заказ', 'Order'), t3('Tadbir', 'Мероприятие', 'Event'), t3('Chiptalar', 'Билетов', 'Tickets'), t3('Toʻlov', 'Оплата', 'Payment'), t3('Summa', 'Сумма', 'Amount'), t3('Fiskal chek', 'Фискальный чек', 'Fiscal receipt')],
      ...r.orders.map((o) => [hhmm(o.at), o.id, evTitleById(o.ev), o.tickets.length, o.pay.method === 'cash' ? t3('Naqd', 'Наличные', 'Cash') : 'QR', o.total, o.fiscal.no]),
    ];
    downloadBlob(new Blob([toCsv(out)], { type: 'text/csv;charset=utf-8' }), `sayohat-box-${date}.csv`);
  };
  const evTitleById = (id: string) => {
    const e = db.events.find((x) => x.id === id);
    return e ? evTitle(e) : id;
  };
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label={t3('Sana', 'Дата', 'Date')}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </Field>
        <div className="pb-2.5 text-ink-3">{fmtDate(date, { weekday: true })}</div>
        <Button variant="outline" className="ml-auto" onClick={exportCsv}>
          <Download className="size-4" />
          {t3('Excel’ga yuklab olish', 'Скачать в Excel', 'Download for Excel')}
        </Button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t3('Naqd', 'Наличные', 'Cash')} value={<span className="text-xl">{sum(r.cash)}</span>} />
        <Stat label={t3('QR orqali', 'По QR', 'By QR')} value={<span className="text-xl">{sum(r.qr)}</span>} />
        <Stat label={t3('Sotuvlar', 'Продаж', 'Sales')} value={r.count} />
        <Stat label={t3('Chiptalar', 'Билетов', 'Tickets')} value={r.tickets} />
        <Stat label={t3('Qayta chop etish', 'Повторных печатей', 'Reprints')} value={r.reprints} />
      </div>
      {r.orders.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                {[t3('Vaqt', 'Время', 'Time'), t3('Buyurtma', 'Заказ', 'Order'), t3('Tadbir', 'Мероприятие', 'Event'), t3('Chiptalar', 'Билетов', 'Tickets'), t3('Toʻlov', 'Оплата', 'Payment'), t3('Summa', 'Сумма', 'Amount'), t3('Chop etildi', 'Печатей', 'Prints')].map((h, i) => (
                  <th key={i} className={cn('px-4 py-3 font-medium', i >= 3 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums [&>tr]:border-b [&>tr]:border-line [&_td]:px-4 [&_td]:py-2.5">
              {r.orders
                .slice()
                .sort((a, b) => a.at - b.at)
                .map((o) => (
                  <tr key={o.id}>
                    <td>{hhmm(o.at)}</td>
                    <td className="font-mono text-sm">{o.id}</td>
                    <td>{evTitleById(o.ev)}</td>
                    <td className="text-right">{o.tickets.length}</td>
                    <td className="text-right">{o.pay.method === 'cash' ? t3('Naqd', 'Наличные', 'Cash') : 'QR'}</td>
                    <td className="text-right">{nfmt(o.total)}</td>
                    <td className="text-right">{o.prints}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <Empty icon={<FileBarChart className="size-10" />} title={t3('Bu kuni kassada sotuv boʻlmagan', 'В этот день продаж в кассе не было', 'No box office sales on this day')}>
            {t3('Boshqa sanani tanlang.', 'Выберите другую дату.', 'Pick another date.')}
          </Empty>
        </Card>
      )}
    </>
  );
}
