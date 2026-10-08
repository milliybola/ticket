/* One venue: details form (US-04) and halls with their seating plans (US-05). `/org/venues/new` creates a venue. */
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { nSeats, nTickets, t3, tl, useI18n } from '../../lib/i18n';
import { fmtDT, now } from '../../lib/time';
import { sumBy, uid } from '../../lib/util';
import { getDb, tx, useDb } from '../../store/db';
import { useAuth } from '../../store/auth';
import { cityName, evTitle, getEvent, getScheme, hallSessionsWithSales, kindName, logAct, sessionSold, STATUS, venueEvents } from '../../domain/rules';
import { capacityOf, newScheme, seatCount, sellables } from '../../domain/scheme';
import type { Venue } from '../../domain/types';
import { SchemeLegend, SchemeView } from '../../components/scheme/SchemeView';
import { Badge, Button, Card, Empty, Field, Input, LinkButton, Modal, PageHeader, Tabs, toast } from '../../components/ui';
import { VENUE_TYPE, VenueForm } from '../../features/venues/VenueForms';

const statusTone = { draft: 'neutral', moderation: 'warn', published: 'ok', rework: 'bad' } as const;

export default function OrgVenue() {
  useI18n();
  const { venueId } = useParams();
  const db = useDb();
  const orgId = useAuth((s) => s.orgId)!;
  const nav = useNavigate();
  const venue = db.venues.find((v) => v.id === venueId);
  const [tab, setTab] = useState<'halls' | 'main'>('halls');

  if (venueId === 'new')
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          back={
            <Link to="/org/venues" className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink">
              <ArrowLeft className="size-4" />
              {t3('Maydonlar', 'Площадки', 'Venues')}
            </Link>
          }
          title={t3('Yangi maydon', 'Новая площадка', 'New venue')}
        />
        <Card>
          <VenueForm orgId={orgId} onSaved={(v, created) => nav(created && v.type === 'scheme' ? `/org/venues/${v.id}/halls/${v.halls[0].id}` : `/org/venues/${v.id}`)} />
        </Card>
      </div>
    );
  if (!venue || venue.orgId !== orgId) return <Empty title={t3('Maydon topilmadi', 'Площадка не найдена', 'Venue not found')} action={<Link to="/org/venues" className="underline">{t3('Maydonlarga', 'К площадкам', 'To venues')}</Link>} />;

  const evs = venueEvents(venue.id);
  const current = venue.type === 'scheme' ? tab : 'main';
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={
          <Link to="/org/venues" className="inline-flex items-center gap-1.5 text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" />
            {t3('Maydonlar', 'Площадки', 'Venues')}
          </Link>
        }
        title={venue.name}
        sub={`${cityName(venue.city)}, ${venue.address} · ${tl(VENUE_TYPE[venue.type])}`}
        actions={
          <Button variant="ghost" className="text-bad" onClick={() => removeVenue(venue, nav)}>
            <Trash2 className="size-4" />
            {t3('Oʻchirish', 'Удалить', 'Delete')}
          </Button>
        }
      />
      {venue.type === 'scheme' && (
        <Tabs
          className="mb-6"
          value={current}
          onChange={setTab}
          tabs={[
            { value: 'halls', label: venue.halls.length > 1 ? t3('Zallar va sxemalar', 'Залы и схемы', 'Halls and plans') : t3('Sxema', 'Схема', 'Seating plan'), count: venue.halls.length > 1 ? venue.halls.length : undefined },
            { value: 'main', label: t3('Maydon', 'Площадка', 'Venue') },
          ]}
        />
      )}
      {current === 'halls' ? (
        <Halls venue={venue} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <VenueForm venue={venue} orgId={orgId} onSaved={() => undefined} />
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">{t3('Maydondagi tadbirlar', 'Мероприятия на площадке', 'Events here')}</h2>
            {evs.length ? (
              <ul className="space-y-2">
                {evs.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2">
                    <Link to={`/org/events/${e.id}`} className="font-medium underline">
                      {evTitle(e)}
                    </Link>
                    <Badge tone={statusTone[e.status]}>{tl(STATUS[e.status])}</Badge>
                    <span className="text-sm text-ink-3">{kindName(e.kind)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">{t3('Hozircha yoʻq.', 'Пока нет.', 'None yet.')}</p>
            )}
            {venue.type === 'timed' && <p className="mt-4 rounded-2xl bg-info-soft p-3 text-sm text-info">{t3('«Vaqt boʻyicha kirish» maydonida sxema va zallar yoʻq: odamlar limiti muzey grafigida belgilanadi.', 'У площадки «Вход по времени» нет схемы и залов: лимит людей задаётся в графике музея.', 'Timed-entry venues have no seating plan or halls: the people limit is set in the museum’s opening hours.')}</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

function removeVenue(v: Venue, nav: (to: string) => void) {
  const evs = venueEvents(v.id);
  if (evs.length) {
    toast(t3('Oʻchirib boʻlmaydi: maydonda tadbirlar bor ({n})', 'Удалить нельзя: на площадке есть мероприятия ({n})', 'Can’t delete: this venue has events ({n})', { n: evs.length }), 'bad');
    return;
  }
  if (!window.confirm(t3('«{n}» maydonini oʻchirasizmi?', 'Удалить площадку «{n}»?', 'Delete venue "{n}"?', { n: v.name }))) return;
  tx((d) => {
    d.venues = d.venues.filter((x) => x.id !== v.id);
    logAct('venue-delete', v.name);
  });
  toast(t3('Maydon oʻchirildi', 'Площадка удалена', 'Venue deleted'), 'ok');
  nav('/org/venues');
}

function hallNameErr(v: Venue, name: string, exceptId?: string) {
  if (!name) return t3('Nomini kiriting', 'Укажите название', 'Enter a name');
  if (name.length > 50) return t3('50 belgidan oshmasin', 'Не больше 50 символов', 'Up to 50 characters');
  if (v.halls.some((h) => h.id !== exceptId && h.name.trim().toLowerCase() === name.toLowerCase())) return t3('Bunday nomli zal bor', 'Зал с таким названием уже есть', 'A hall with this name already exists');
  return '';
}

function Halls({ venue }: { venue: Venue }) {
  useI18n();
  const halls = venue.halls.slice().sort((a, b) => a.order - b.order);
  const [showList, setShowList] = useState(halls.length > 1);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [rename, setRename] = useState<{ id: string; name: string; err: string } | null>(null);
  const [blocked, setBlocked] = useState<{ hall: string; sessions: ReturnType<typeof hallSessionsWithSales> } | null>(null);

  const addHall = () => {
    const n = name.trim();
    const e = hallNameErr(venue, n);
    setErr(e);
    if (e) return;
    tx((d) => {
      const x = d.venues.find((v) => v.id === venue.id)!;
      const sid = uid('sch');
      d.schemes[sid] = newScheme();
      x.halls.push({ id: uid('hall'), name: n, order: x.halls.length, schemeId: sid });
      logAct('hall-create', `${x.name} · ${n}`);
    });
    setName('');
    setShowList(true);
    toast(t3('Zal qoʻshildi', 'Зал добавлен', 'Hall added'), 'ok');
  };
  const move = (id: string, dir: number) =>
    tx((d) => {
      const x = d.venues.find((v) => v.id === venue.id)!;
      const hs = x.halls.slice().sort((a, b) => a.order - b.order);
      const i = hs.findIndex((h) => h.id === id);
      const j = i + dir;
      if (j < 0 || j >= hs.length) return;
      [hs[i], hs[j]] = [hs[j], hs[i]];
      hs.forEach((h, k) => (h.order = k));
    });
  const del = (id: string) => {
    const h = venue.halls.find((x) => x.id === id)!;
    const blocking = hallSessionsWithSales(id);
    if (blocking.length) return setBlocked({ hall: h.name, sessions: blocking });
    const future = futureSessions(id);
    if (!window.confirm(future.length ? t3('«{h}» zalini oʻchirasizmi? Sotuvsiz kelgusi seanslar ({n}) ham oʻchiriladi. Oʻtgan seanslar hisobotlarda qoladi.', 'Удалить зал «{h}»? Будущие сеансы без продаж ({n}) тоже удалятся. Прошедшие сеансы останутся в отчётах.', 'Delete hall "{h}"? Its upcoming sessions without sales ({n}) are deleted too. Past sessions stay in reports.', { h: h.name, n: future.length }) : t3('«{h}» zalini oʻchirasizmi? Oʻtgan seanslar hisobotlarda qoladi.', 'Удалить зал «{h}»? Прошедшие сеансы останутся в отчётах.', 'Delete hall "{h}"? Past sessions stay in reports.', { h: h.name }))) return;
    tx((d) => {
      const x = d.venues.find((v) => v.id === venue.id)!;
      x.halls = x.halls.filter((y) => y.id !== id);
      x.halls.sort((a, b) => a.order - b.order).forEach((y, k) => (y.order = k));
      const ids = new Set(future.map((s) => s.id));
      d.sessions = d.sessions.filter((s) => !ids.has(s.id));
      x.deletedHalls = (x.deletedHalls || []).concat([h]);
      logAct('hall-delete', `${x.name} · ${h.name}`);
    });
    toast(t3('Zal oʻchirildi', 'Зал удалён', 'Hall deleted'), 'ok');
  };

  // one hall (theatre, concert): straight to its plan, no extra step (US-05 AC2)
  if (halls.length === 1 && !showList) {
    const h = halls[0];
    const sc = getScheme(h.schemeId);
    return (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{h.name}</h2>
            <p className="mt-1 text-sm text-ink-3">
              {sc && sc.els.length ? `${nSeats(sumBy(sellables(sc), (e) => seatCount(e)))} · ${t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: capacityOf(sc) })}` : t3('Sxema hali yaratilmagan', 'Схема ещё не создана', 'No plan yet')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowList(true)}>
              <Plus className="size-4" />
              {t3('Zal qoʻshish', 'Добавить зал', 'Add a hall')}
            </Button>
            <LinkButton to={`/org/venues/${venue.id}/halls/${h.id}`}>
              <Pencil className="size-4" />
              {t3('Sxemani tahrirlash', 'Редактировать схему', 'Edit the plan')}
            </LinkButton>
          </div>
        </div>
        {sc && sc.els.length > 0 && (
          <div className="mt-4 space-y-3">
            <SchemeView scheme={sc} mode="preview" height={460} />
            <SchemeLegend scheme={sc} />
          </div>
        )}
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="text-xl font-bold">{t3('Zallar', 'Залы', 'Halls')}</h2>
      <p className="mt-1 text-sm text-ink-3">{t3('Zallar tartibi — vitrina va kassadagi kabi. Har bir zalning oʻz sxemasi bor.', 'Порядок залов — как на витрине и в кассе. У каждого зала своя схема.', 'Halls appear in this order on the storefront and in the box office. Each hall has its own plan.')}</p>
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {halls.map((h, i) => {
          const sc = getScheme(h.schemeId);
          return (
            <li key={h.id} className="rounded-2xl border border-line p-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" disabled={i === 0} onClick={() => move(h.id, -1)} className="grid size-6 place-items-center rounded hover:bg-black/5 disabled:opacity-30" aria-label={t3('Yuqoriga', 'Выше', 'Up')}>
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" disabled={i === halls.length - 1} onClick={() => move(h.id, 1)} className="grid size-6 place-items-center rounded hover:bg-black/5 disabled:opacity-30" aria-label={t3('Pastga', 'Ниже', 'Down')}>
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{h.name}</div>
                  <div className="text-sm text-ink-3">{sc && sc.els.length ? t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: capacityOf(sc) }) : t3('sxema yoʻq', 'схемы нет', 'no plan')}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRename({ id: h.id, name: h.name, err: '' })}>
                  {t3('Nomi', 'Имя', 'Rename')}
                </Button>
                <button type="button" disabled={halls.length < 2} onClick={() => del(h.id)} className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-black/5 hover:text-bad disabled:opacity-30" aria-label={t3('Oʻchirish', 'Удалить', 'Delete')}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              {sc && sc.els.length > 0 && <SchemeView scheme={sc} mode="preview" height={200} bare className="mt-3" />}
              <LinkButton to={`/org/venues/${venue.id}/halls/${h.id}`} size="sm" variant="outline" block className="mt-3">
                <Pencil className="size-4" />
                {t3('Sxemani tahrirlash', 'Редактировать схему', 'Edit the plan')}
              </LinkButton>
            </li>
          );
        })}
      </ul>
      <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <Field label={t3('Yangi zal', 'Новый зал', 'New hall')} error={err} className="min-w-60 flex-1">
          <Input value={name} maxLength={50} invalid={!!err} placeholder={t3('Masalan, «2-zal» yoki «VIP-zal»', 'Например, «Зал 2» или «VIP-зал»', 'For example "Hall 2" or "VIP hall"')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHall()} />
        </Field>
        <Button onClick={addHall} className={err ? 'mb-6' : ''}>
          <Plus className="size-4" />
          {t3('Zal qoʻshish', 'Добавить зал', 'Add hall')}
        </Button>
      </div>

      <Modal
        open={!!rename}
        onClose={() => setRename(null)}
        size="sm"
        title={t3('Zal nomini oʻzgartirish', 'Переименовать зал', 'Rename the hall')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRename(null)}>
              {t3('Bekor qilish', 'Отмена', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (!rename) return;
                const n = rename.name.trim();
                const e = hallNameErr(venue, n, rename.id);
                if (e) return setRename({ ...rename, err: e });
                tx((d) => {
                  const x = d.venues.find((v) => v.id === venue.id)!;
                  const h = x.halls.find((y) => y.id === rename.id)!;
                  const was = h.name;
                  h.name = n;
                  logAct('hall-rename', x.name, `${was} → ${n}`);
                });
                setRename(null);
                toast(t3('Saqlandi', 'Сохранено', 'Saved'), 'ok');
              }}
            >
              {t3('Saqlash', 'Сохранить', 'Save')}
            </Button>
          </>
        }
      >
        <Field label={t3('Nomi', 'Название', 'Name')} error={rename?.err} hint={t3('Yangi nomni kelgusi seanslarda xaridorlar va kassa darhol koʻradi.', 'Новое название сразу увидят покупатели и касса у будущих сеансов.', 'Buyers and the box office see the new name on upcoming sessions right away.')}>
          <Input autoFocus value={rename?.name || ''} maxLength={50} onChange={(e) => rename && setRename({ ...rename, name: e.target.value })} />
        </Field>
      </Modal>
      <Modal open={!!blocked} onClose={() => setBlocked(null)} size="md" title={t3('Oʻchirib boʻlmaydi', 'Удалить нельзя', 'Can’t delete')} footer={<Button onClick={() => setBlocked(null)}>{t3('Tushunarli', 'Понятно', 'OK')}</Button>}>
        <p className="mb-3 text-ink-2">{t3('«{h}» zalida sotuv yoki bronli kelgusi seanslar bor:', 'В зале «{h}» есть будущие сеансы с продажами или бронями:', 'Hall "{h}" has upcoming sessions with sales or holds:', { h: blocked?.hall || '' })}</p>
        <ul className="space-y-1 text-sm">
          {blocked?.sessions.slice(0, 12).map((s) => {
            const ev = getEvent(s.eventId);
            return (
              <li key={s.id}>
                {ev ? evTitle(ev) : '—'} · {fmtDT(s.startsAt)} · {nTickets(sessionSold(s.id))}
              </li>
            );
          })}
        </ul>
      </Modal>
    </Card>
  );
}

/** Upcoming sessions in a hall (deleted together with the hall when they have no sales). */
function futureSessions(hallId: string) {
  return getDb().sessions.filter((s) => s.hallId === hallId && s.startsAt > now());
}
