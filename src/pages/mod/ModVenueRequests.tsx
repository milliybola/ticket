/* Venue requests (US-11): organizers ask the moderator to build a complex venue. New → In progress → Done / Declined.
   The moderator creates the venue in the organizer's account from a hall template or the attached SVG. */
import { Building2, Download, FileImage, Upload } from 'lucide-react';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { inLang, t3 as tt, tx3, useI18n, type L10n } from '../../lib/i18n';
import { fmtPhone } from '../../lib/format';
import { ago, fmtDT, now } from '../../lib/time';
import { byId, uid } from '../../lib/util';
import { CITIES, cityName, logAct, send } from '../../domain/rules';
import { capacityOf, importSvg, sellables, SvgImportError, templateScheme, validateScheme, type HallTemplate } from '../../domain/scheme';
import type { Scheme, Venue, VenueRequest, VenueType } from '../../domain/types';
import { useAuth } from '../../store/auth';
import { tx, useDb } from '../../store/db';
import { SchemeView } from '../../components/scheme/SchemeView';
import { Badge, Button, Card, Empty, Field, Input, Modal, Notice, PageHeader, Segmented, Select, toast } from '../../components/ui';
import { ReasonDialog } from '../../features/ops/common';

const REQ_STATUS: Record<VenueRequest['status'], L10n> = {
  new: tx3('Yangi', 'Новый', 'New'),
  progress: tx3('Ishda', 'В работе', 'In progress'),
  done: tx3('Tayyor', 'Готово', 'Done'),
  declined: tx3('Rad etilgan', 'Отклонён', 'Declined'),
};
const TONE = { new: 'brand', progress: 'info', done: 'ok', declined: 'bad' } as const;
const TEMPLATES: { id: HallTemplate; name: L10n }[] = [
  { id: 'concert', name: tx3('Konsert zali (fan-zona, sektorlar)', 'Концертный зал (фан-зона, секторы)', 'Concert hall (fan zone, sectors)') },
  { id: 'stadium', name: tx3('Stadion', 'Стадион', 'Stadium') },
  { id: 'theatre', name: tx3('Teatr (parter, amfiteatr, balkon)', 'Театр (партер, амфитеатр, балкон)', 'Theatre (stalls, amphitheatre, balcony)') },
  { id: 'cinema', name: tx3('Kinozal', 'Кинозал', 'Cinema hall') },
  { id: 'banquet', name: tx3('Banket (stollar)', 'Банкет (столы)', 'Banquet (tables)') },
  { id: 'ga', name: tx3('Erkin joylashuv', 'Свободная рассадка', 'General admission') },
];
type Filter = 'active' | 'done' | 'declined' | 'all';

/** Text of a data: URL (the attached file). */
function dataUrlText(url: string): string | null {
  const i = url.indexOf(',');
  if (i < 0) return null;
  const meta = url.slice(0, i);
  const body = url.slice(i + 1);
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(body);
      return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}
const isSvg = (f: VenueRequest['file']) => !!f && (/\.svg$/i.test(f.name) || /^data:image\/svg/i.test(f.data || ''));
const isImage = (f: VenueRequest['file']) => !!f?.data && /^data:image\//i.test(f.data);

export default function ModVenueRequests() {
  const { t3, tl, lang } = useI18n();
  const db = useDb();
  const [filter, setFilter] = useState<Filter>('active');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(
    () =>
      db.venueReqs
        .filter((r) => (filter === 'all' ? true : filter === 'active' ? r.status === 'new' || r.status === 'progress' : r.status === filter))
        .sort((a, b) => (filter === 'active' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)),
    [db, db.rev, filter, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const open = db.venueReqs.find((r) => r.id === openId);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t3('Maydon soʻrovlari', 'Запросы площадок', 'Venue requests')} sub={t3('Tashkilotchilar murakkab maydonni yaratib berishni soʻraydi.', 'Организаторы просят создать за них сложную площадку.', 'Organizers ask you to build a complex venue for them.')} />
      <Segmented
        className="mb-4"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: t3('Faol', 'Активные', 'Active') },
          { value: 'done', label: tl(REQ_STATUS.done) },
          { value: 'declined', label: tl(REQ_STATUS.declined) },
          { value: 'all', label: t3('Hammasi', 'Все', 'All') },
        ]}
      />
      {list.length ? (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
          <table className="w-full min-w-[760px] text-left text-[15px]">
            <thead>
              <tr className="border-b border-line text-sm text-ink-3">
                {[t3('Maydon', 'Площадка', 'Venue'), t3('Tashkilotchi', 'Организатор', 'Organizer'), t3('Turi', 'Вид', 'Type'), t3('Fayl', 'Файл', 'File'), t3('Yuborilgan', 'Отправлен', 'Sent'), t3('Holat', 'Статус', 'Status')].map((h, i) => (
                  <th key={i} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-page" onClick={() => setOpenId(r.id)}>
                  <td className="px-4 py-3">
                    <b className="block">{r.name}</b>
                    <span className="text-sm text-ink-3">
                      {cityName(r.city)}, {r.address}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{byId(db.orgs, r.orgId)?.name}</td>
                  <td className="px-4 py-3 text-sm">{typeName(r.type)}</td>
                  <td className="px-4 py-3 text-sm">{r.file ? r.file.name : '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {fmtDT(r.createdAt)}
                    <span className="block text-ink-3">{ago(r.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[r.status]}>{tl(REQ_STATUS[r.status])}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Card>
          <Empty icon={<Building2 className="size-10" />} title={t3('Soʻrovlar yoʻq', 'Запросов нет', 'No requests')} />
        </Card>
      )}
      {open && <RequestCard req={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

const typeName = (t: VenueType) => (t === 'scheme' ? tt('Zal sxemasi', 'Схема зала', 'Seating plan') : tt('Vaqt boʻyicha kirish', 'Вход по времени', 'Timed entry'));

function RequestCard({ req, onClose }: { req: VenueRequest; onClose: () => void }) {
  const { t3, tl } = useI18n();
  const db = useDb();
  const modId = useAuth((s) => s.modId);
  const mod = byId(db.mods, modId);
  const org = byId(db.orgs, req.orgId);
  const [creating, setCreating] = useState(false);
  const [decline, setDecline] = useState(false);
  const active = req.status === 'new' || req.status === 'progress';
  const svgText = req.file?.data && isSvg(req.file) ? dataUrlText(req.file.data) : null;

  const take = () =>
    tx((d) => {
      const r = d.venueReqs.find((x) => x.id === req.id);
      if (!r || r.status !== 'new') return;
      r.status = 'progress';
      r.history.push({ at: now(), by: mod?.name || '', status: 'progress', reason: '' });
      logAct('venue-request-take', r.name, org?.name || '');
    });
  const doDecline = (reason: string) => {
    tx((d) => {
      const r = d.venueReqs.find((x) => x.id === req.id);
      if (!r) return;
      r.status = 'declined';
      r.reason = reason;
      r.history.push({ at: now(), by: mod?.name || '', status: 'declined', reason });
      if (org) send('email', org.email, inLang(org.lang, `Maydon soʻrovi rad etildi: ${r.name}`, `Запрос площадки отклонён: ${r.name}`, `Venue request declined: ${r.name}`), inLang(org.lang, `«${r.name}» maydonini yaratib boʻlmadi. Sabab: ${reason}`, `Не удалось создать площадку «${r.name}». Причина: ${reason}`, `We couldn’t create the venue "${r.name}". Reason: ${reason}`), org.lang, 'venue');
      logAct('venue-request-decline', r.name, reason);
    });
    toast(t3('Soʻrov rad etildi, tashkilotchiga xat yuborildi', 'Запрос отклонён, организатору отправлено письмо', 'Request declined; the organizer got an email'), 'ok');
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {req.name} <Badge tone={TONE[req.status]}>{tl(REQ_STATUS[req.status])}</Badge>
        </span>
      }
      footer={
        active && !creating ? (
          <>
            <Button variant="outline" onClick={() => setDecline(true)}>
              {t3('Rad etish', 'Отклонить', 'Decline')}
            </Button>
            {req.status === 'new' && (
              <Button variant="dark" onClick={take}>
                {t3('Ishga olish', 'Взять в работу', 'Take it')}
              </Button>
            )}
            <Button onClick={() => setCreating(true)}>
              <Building2 className="size-4" />
              {t3('Maydon yaratish', 'Создать площадку', 'Create the venue')}
            </Button>
          </>
        ) : undefined
      }
    >
      {creating ? (
        <CreateVenue req={req} svgText={svgText} onCancel={() => setCreating(false)} onDone={onClose} modName={mod?.name || ''} />
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
          <div>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2.5 text-[15px]">
              <dt className="text-ink-3">{t3('Tashkilotchi', 'Организатор', 'Organizer')}</dt>
              <dd>
                <b>{org?.name}</b>
                {org && (
                  <span className="block text-sm text-ink-3">
                    {org.contact} · {fmtPhone(org.phone)} · {org.email}
                  </span>
                )}
              </dd>
              <dt className="text-ink-3">{t3('Nomi', 'Название', 'Name')}</dt>
              <dd className="font-medium">{req.name}</dd>
              <dt className="text-ink-3">{t3('Shahar', 'Город', 'City')}</dt>
              <dd>{cityName(req.city)}</dd>
              <dt className="text-ink-3">{t3('Manzil', 'Адрес', 'Address')}</dt>
              <dd>{req.address}</dd>
              <dt className="text-ink-3">{t3('Turi', 'Вид', 'Type')}</dt>
              <dd>{typeName(req.type)}</dd>
              <dt className="text-ink-3">{t3('Yuborilgan', 'Отправлен', 'Sent')}</dt>
              <dd>{fmtDT(req.createdAt)}</dd>
              <dt className="text-ink-3">{t3('Izoh', 'Комментарий', 'Comment')}</dt>
              <dd className="whitespace-pre-line">{req.comment || '—'}</dd>
            </dl>
            {req.status === 'declined' && req.reason && (
              <Notice tone="bad" className="mt-4" title={t3('Rad etish sababi', 'Причина отказа', 'Reason')}>
                {req.reason}
              </Notice>
            )}
            {req.status === 'done' && req.venueId && (
              <Notice tone="ok" className="mt-4">
                {t3('Maydon yaratildi: {n}', 'Площадка создана: {n}', 'Venue created: {n}', { n: byId(db.venues, req.venueId)?.name || req.venueId })}
              </Notice>
            )}
            {req.history.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 font-bold">{t3('Tarix', 'История', 'History')}</h3>
                <ul className="space-y-1.5 text-sm">
                  {req.history.map((h, i) => (
                    <li key={i}>
                      <b>{tl(REQ_STATUS[h.status])}</b> · {h.by} · {fmtDT(h.at)}
                      {h.reason && <span className="block text-ink-2">{h.reason}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div>
            <h3 className="mb-2 font-bold">{t3('Biriktirilgan fayl', 'Приложенный файл', 'Attached file')}</h3>
            {req.file ? (
              <div className="rounded-2xl border border-line p-3">
                <div className="flex items-center gap-2">
                  <FileImage className="size-5 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate font-medium">{req.file.name}</span>
                  <span className="text-sm text-ink-3">{Math.round(req.file.size / 1024)} KB</span>
                  {req.file.data && (
                    <a href={req.file.data} download={req.file.name} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold hover:bg-black/5">
                      <Download className="size-4" />
                      {t3('Yuklab olish', 'Скачать', 'Download')}
                    </a>
                  )}
                </div>
                {isImage(req.file) && <img src={req.file.data} alt={req.file.name} className="mt-3 max-h-80 w-full rounded-xl bg-page object-contain" />}
              </div>
            ) : (
              <p className="text-ink-3">{t3('Fayl biriktirilmagan', 'Файл не приложен', 'No file attached')}</p>
            )}
          </div>
        </div>
      )}
      <ReasonDialog open={decline} onClose={() => setDecline(false)} title={t3('Soʻrovni rad etish', 'Отклонить запрос', 'Decline the request')} hint={t3('Sabab tashkilotchiga email bilan yuboriladi.', 'Причина уйдёт организатору письмом.', 'The reason is emailed to the organizer.')} okLabel={t3('Rad etish', 'Отклонить', 'Decline')} onOk={doDecline} />
    </Modal>
  );
}

function CreateVenue({ req, svgText, onCancel, onDone, modName }: { req: VenueRequest; svgText: string | null; onCancel: () => void; onDone: () => void; modName: string }) {
  const { t3, tl } = useI18n();
  const [name, setName] = useState(req.name);
  const [city, setCity] = useState(req.city);
  const [address, setAddress] = useState(req.address);
  const [type, setType] = useState<VenueType>(req.type);
  const [hall, setHall] = useState(t3('Asosiy zal', 'Основной зал', 'Main hall'));
  const [source, setSource] = useState<'svg' | 'template'>(svgText ? 'svg' : 'template');
  const [tpl, setTpl] = useState<HallTemplate>('concert');
  const [svg, setSvg] = useState<{ name: string; text: string } | null>(svgText ? { name: req.file!.name, text: svgText } : null);
  const [imp, setImp] = useState<{ sc: Scheme | null; err: string }>({ sc: null, err: '' });
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (source !== 'svg' || !svg) return setImp({ sc: null, err: '' });
    try {
      setImp({ sc: importSvg(svg.text), err: '' });
    } catch (e) {
      setImp({ sc: null, err: e instanceof SvgImportError ? t3('Faylni SVG sifatida oʻqib boʻlmadi', 'Файл не читается как SVG', 'The file can’t be read as SVG') : String((e as Error).message || e) });
    }
  }, [source, svg]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheme = useMemo(() => (type !== 'scheme' ? null : source === 'template' ? templateScheme(tpl) : imp.sc), [type, source, tpl, imp.sc]);
  const sell = scheme ? sellables(scheme) : [];
  const errs = scheme ? validateScheme(scheme) : [];
  const notes = scheme ? scheme.els.flatMap((e) => e.notes || []) : [];
  const fieldErr = {
    name: name.trim().length < 2 ? t3('Nomini kiriting', 'Укажите название', 'Enter the name') : '',
    address: address.trim().length < 3 ? t3('Manzilni kiriting', 'Укажите адрес', 'Enter the address') : '',
    plan: type === 'scheme' && (!scheme || !sell.length) ? t3('Sotiladigan sektorlari bor sxema kerak', 'Нужна схема с продаваемыми секторами', 'A plan with sellable sectors is needed') : '',
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast(t3('Fayl 10 MB dan katta', 'Файл больше 10 МБ', 'The file is larger than 10 MB'), 'bad');
    setSvg({ name: f.name, text: await f.text() });
    setSource('svg');
  };

  const create = () => {
    setTried(true);
    if (fieldErr.name || fieldErr.address || fieldErr.plan) return;
    const v = tx((d) => {
      const r = d.venueReqs.find((x) => x.id === req.id);
      const org = byId(d.orgs, req.orgId);
      const venue: Venue = { id: uid('v_'), orgId: req.orgId, name: name.trim(), city, address: address.trim(), point: null, type, halls: [], createdAt: now(), createdBy: 'mod' };
      if (type === 'scheme' && scheme) {
        const sid = uid('sch');
        d.schemes[sid] = JSON.parse(JSON.stringify(scheme));
        venue.halls.push({ id: uid('hall'), name: hall.trim() || 'Zal', order: 0, schemeId: sid });
      }
      d.venues.push(venue);
      if (r) {
        r.status = 'done';
        r.venueId = venue.id;
        r.history.push({ at: now(), by: modName, status: 'done', reason: '' });
      }
      logAct('venue-create', venue.name, `${org?.name || ''} · ${t3('moderator yaratdi', 'создана модератором', 'created by a moderator')}`);
      if (org)
        send(
          'email',
          org.email,
          inLang(org.lang, `Maydon tayyor: ${venue.name}`, `Площадка готова: ${venue.name}`, `Your venue is ready: ${venue.name}`),
          inLang(org.lang, `«${venue.name}» maydoni kabinetingizda yaratildi. Uni tahrirlashingiz va tadbirlar yaratishingiz mumkin.`, `Площадка «${venue.name}» создана в вашем кабинете. Её можно менять и создавать на ней мероприятия.`, `The venue "${venue.name}" is created in your account. You can edit it and create events there.`),
          org.lang,
          'venue',
        );
      return venue;
    });
    toast(t3('«{n}» maydoni yaratildi, tashkilotchiga xat yuborildi', 'Площадка «{n}» создана, организатору отправлено письмо', 'Venue "{n}" created; the organizer got an email', { n: v.name }), 'ok');
    onDone();
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t3('Nomi', 'Название', 'Name')} required error={tried && fieldErr.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label={t3('Shahar', 'Город', 'City')} required>
          <Select value={city} onChange={(e) => setCity(e.target.value)}>
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {tl(c.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t3('Manzil', 'Адрес', 'Address')} required error={tried && fieldErr.address} className="md:col-span-2">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
        </Field>
        <Field label={t3('Turi', 'Вид', 'Type')}>
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'scheme', label: t3('Zal sxemasi', 'Схема зала', 'Seating plan') },
              { value: 'timed', label: t3('Vaqt boʻyicha kirish', 'Вход по времени', 'Timed entry') },
            ]}
          />
        </Field>
        {type === 'scheme' && (
          <Field label={t3('Zal nomi', 'Название зала', 'Hall name')}>
            <Input value={hall} onChange={(e) => setHall(e.target.value)} maxLength={60} />
          </Field>
        )}
      </div>
      {type === 'scheme' && (
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="font-semibold">{t3('Sxema manbasi', 'Источник схемы', 'Plan source')}</span>
            <Segmented
              size="sm"
              value={source}
              onChange={setSource}
              options={[
                { value: 'svg', label: t3('SVG import', 'Импорт SVG', 'Import SVG') },
                { value: 'template', label: t3('Zal shabloni', 'Шаблон зала', 'Hall template') },
              ]}
            />
          </div>
          {source === 'template' ? (
            <Select value={tpl} onChange={(e) => setTpl(e.target.value as HallTemplate)} className="max-w-md">
              {TEMPLATES.map((x) => (
                <option key={x.id} value={x.id}>
                  {tl(x.name)}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{svg ? svg.name : t3('Fayl tanlanmagan', 'Файл не выбран', 'No file chosen')}</span>
              {svgText && svg?.text !== svgText && (
                <Button size="sm" variant="soft" onClick={() => setSvg({ name: req.file!.name, text: svgText })}>
                  {t3('Biriktirilgan faylni olish', 'Взять приложенный файл', 'Use the attached file')}
                </Button>
              )}
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-2 bg-white px-3 text-sm font-semibold hover:border-ink">
                <Upload className="size-4" />
                {t3('Boshqa SVG yuklash', 'Загрузить другой SVG', 'Upload another SVG')}
                <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={onFile} />
              </label>
            </div>
          )}
          {imp.err && source === 'svg' && <p className="mt-2 text-sm text-bad">{imp.err}</p>}
          {scheme && (
            <>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Badge tone="ok">{t3('Sotiladigan elementlar: {n}', 'Продаваемых элементов: {n}', 'Sellable elements: {n}', { n: sell.length })}</Badge>
                <Badge tone="info">{t3('Sigʻim: {n}', 'Вместимость: {n}', 'Capacity: {n}', { n: capacityOf(scheme) })}</Badge>
                {source === 'svg' && <Badge>{t3('Tanilgan elementlar: {n}', 'Распознано элементов: {n}', 'Recognized elements: {n}', { n: scheme.els.length })}</Badge>}
                {errs.length > 0 && <Badge tone="warn">{t3('Tuzatish kerak: {n}', 'Нужно поправить: {n}', 'To fix: {n}', { n: errs.length })}</Badge>}
              </div>
              {(errs.length > 0 || notes.length > 0) && (
                <ul className="mt-2 list-disc pl-5 text-sm text-warn">
                  {[...errs.map((e) => e.msg), ...notes].slice(0, 6).map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 overflow-hidden rounded-xl border border-line bg-page">
                <SchemeView scheme={scheme} mode="preview" height={340} />
              </div>
              <p className="mt-2 text-xs text-ink-3">{t3('Tashkilotchi keyin sxemani muharrirda tuzatishi mumkin.', 'Организатор сможет поправить схему в редакторе.', 'The organizer can fine-tune the plan in the editor later.')}</p>
            </>
          )}
          {tried && fieldErr.plan && <p className="mt-2 text-sm text-bad">{fieldErr.plan}</p>}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="outline" onClick={onCancel}>
          {t3('Orqaga', 'Назад', 'Back')}
        </Button>
        <Button onClick={create}>
          <Building2 className="size-4" />
          {t3('Yaratish va soʻrovni yopish', 'Создать и закрыть запрос', 'Create and close the request')}
        </Button>
      </div>
    </div>
  );
}
