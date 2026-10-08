/* The event as the buyer will see it, in a chosen language (moderator review, US-22 AC1 and AC6): poster and card,
   venue, the plan with prices, sessions or museum hours, ticket types with their requirements. */
import { Clock, MapPin, Users } from 'lucide-react';
import { inLang, tl, useI18n, withLang, type Lang } from '../../lib/i18n';
import { sum as sumFmt, usd } from '../../lib/format';
import { DOW_LONG, fmtDate, fmtDT, now } from '../../lib/time';
import { CITIES, eventCats, eventScheme, eventSessions, getScheme, getVenue, hallOf, KIND, minPrice, pricingOf, priceFor, tablePrice, visibleTypes } from '../../domain/rules';
import { catOf, sellables } from '../../domain/scheme';
import type { EventItem, Scheme, SchemeEl, Venue } from '../../domain/types';
import { Poster } from '../../components/common';
import { SchemeView } from '../../components/scheme/SchemeView';
import { Badge } from '../../components/ui';

const cityIn = (id: string, lang: Lang) => tl(CITIES.find((c) => c.id === id)?.name || id, lang);
export const venueLine = (v: Venue | undefined, lang: Lang) => (v ? `${v.name}, ${cityIn(v.city, lang)}, ${v.address}` : '—');

/** Plan with category colours and prices; the legend is written in the preview language. */
export function PlanPreview({ scheme, ev, lang, height = 380 }: { scheme: Scheme; ev?: EventItem; lang: Lang; height?: number }) {
  useI18n();
  const price = ev ? (el: SchemeEl, cat: string) => (el.type === 'table' ? tablePrice(ev, el, el.mode === 'whole') : priceFor(ev, el, cat)) : undefined;
  const cats = scheme.cats.filter((c) => sellables(scheme).some((el) => (el.cat || 'std') === c.id || Object.values(el.seatCat || {}).includes(c.id)));
  const pm = ev ? pricingOf(ev.kind) : null;
  const catPrice = (catId: string) => {
    if (!ev || pm === 'element') return null;
    const ps = visibleTypes(ev)
      .map((t) => (t.prices || {})[catId])
      .filter((p): p is number => !!p);
    return ps.length ? Math.min(...ps) : null;
  };
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line bg-page">
        <SchemeView scheme={scheme} mode={ev ? 'overview' : 'preview'} price={price} height={height} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        {cats.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <i className="inline-block size-3.5 rounded-full" style={{ background: c.color }} />
            {tl(c.name, lang)}
            {catPrice(c.id) && <b className="text-ink">{withLang(lang, () => inLang(lang, '{p} dan', 'от {p}', 'from {p}').replace('{p}', sumFmt(catPrice(c.id)!)))}</b>}
          </span>
        ))}
      </div>
    </div>
  );
}

export function EventPreview({ ev, lang }: { ev: EventItem; lang: Lang }) {
  useI18n();
  const L = (uz: string, ru: string, en: string) => inLang(lang, uz, ru, en);
  const W = <T,>(fn: () => T) => withLang(lang, fn);
  const venue = getVenue(ev.venueId);
  const pm = pricingOf(ev.kind);
  const types = visibleTypes(ev);
  const cats = eventCats(ev);
  const mp = minPrice(ev);
  const sessions = eventSessions(ev.id);
  const scheme = eventScheme(ev);
  const cinemaHalls = ev.kind === 'cinema' && venue ? venue.halls.map((h) => ({ h, sc: getScheme(h.schemeId) })).filter((x) => x.sc) : [];
  const title = tl(ev.card.title, lang) || L('Nomsiz', 'Без названия', 'Untitled');
  return (
    <div className="space-y-6" lang={lang}>
      <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
        <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-card)]">
          <Poster card={ev.card} showTitle={false} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{tl(KIND[ev.kind].one, lang)}</Badge>
            {ev.card.age && <Badge>{ev.card.age}</Badge>}
            {ev.card.duration > 0 && ev.kind !== 'museum' && (
              <Badge>
                <Clock className="size-3" />
                {L('{n} daqiqa', '{n} мин', '{n} min').replace('{n}', String(ev.card.duration))}
              </Badge>
            )}
            {ev.card.lang && <Badge tone="info">{ev.card.lang}</Badge>}
          </div>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight">{title}</h2>
          <div className="mt-2 flex items-start gap-1.5 text-ink-2">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {venueLine(venue, lang)}
          </div>
          {mp && (
            <div className="mt-3 text-lg font-bold">
              {W(() => L('{p} dan', 'от {p}', 'from {p}').replace('{p}', sumFmt(mp)))} <span className="text-sm font-normal text-ink-3">{usd(mp)}</span>
            </div>
          )}
          <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{tl(ev.card.desc, lang) || <span className="text-ink-3 italic">{L('Tavsif yoʻq', 'Нет описания', 'No description')}</span>}</p>
        </div>
      </div>

      {ev.kind !== 'museum' && (
        <section>
          <h3 className="mb-2 font-bold">{L('Zal sxemasi va narxlar', 'Схема зала и цены', 'Seating plan and prices')}</h3>
          {ev.kind === 'cinema' ? (
            cinemaHalls.length ? (
              <div className="space-y-4">
                {cinemaHalls.map(({ h, sc }) => (
                  <div key={h.id}>
                    <div className="mb-1 text-sm font-semibold">{h.name}</div>
                    <PlanPreview scheme={sc!} ev={ev} lang={lang} height={280} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ink-3">{L('Zal yoʻq', 'Нет залов', 'No halls')}</p>
            )
          ) : scheme ? (
            <PlanPreview scheme={scheme} ev={ev} lang={lang} />
          ) : (
            <p className="text-bad">{L('Sxema yoʻq', 'Нет схемы', 'No plan')}</p>
          )}
          {pm === 'element' && scheme && (
            <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
              {sellables(scheme).map((el) => {
                const tp = el.type === 'table';
                const p = tp ? null : ev.prices.els[el.id];
                return (
                  <li key={el.id} className="flex items-center justify-between gap-2 rounded-lg bg-page px-3 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <i className="inline-block size-3 rounded-full" style={{ background: catOf(scheme, el.cat).color }} />
                      {tp ? L('Stol {n}', 'Стол {n}', 'Table {n}').replace('{n}', el.name) : el.name}
                    </span>
                    <b className={!tp && !p ? 'text-bad' : ''}>
                      {W(() =>
                        tp
                          ? [el.mode !== 'seats' && tablePrice(ev, el, true) ? L('toʻliq ', 'целиком ', 'whole ') + sumFmt(tablePrice(ev, el, true)!) : '', el.mode !== 'whole' && tablePrice(ev, el, false) ? L('joy ', 'место ', 'seat ') + sumFmt(tablePrice(ev, el, false)!) : ''].filter(Boolean).join(' · ') || '—'
                          : p
                            ? sumFmt(p)
                            : L('narx yoʻq', 'нет цены', 'no price'),
                      )}
                    </b>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {ev.kind === 'museum' ? (
        <section>
          <h3 className="mb-2 font-bold">{L('Ish vaqti va slotlar', 'Часы работы и слоты', 'Opening hours and slots')}</h3>
          {ev.museum ? (
            <>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const h = ev.museum!.hours[d];
                  return (
                    <li key={d} className="flex justify-between rounded-lg bg-page px-3 py-1.5">
                      <span className="capitalize">{DOW_LONG[lang][d]}</span>
                      <b className={!h || h.off ? 'font-normal text-ink-3' : ''}>{!h || h.off ? L('dam olish', 'выходной', 'closed') : `${h.open}–${h.close}`}</b>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Badge>
                  <Clock className="size-3" />
                  {L('Slot {n} daqiqa', 'Слот {n} мин', 'Slot {n} min').replace('{n}', String(ev.museum.slot))}
                </Badge>
                <Badge>
                  <Users className="size-3" />
                  {L('Slotga {n} kishi', '{n} человек на слот', '{n} people per slot').replace('{n}', String(ev.museum.limit))}
                </Badge>
                <Badge>{L('Sotuv {n} kun oldinga', 'Продажа на {n} дней вперёд', 'On sale {n} days ahead').replace('{n}', String(ev.museum.ahead))}</Badge>
              </div>
              {ev.museum.offDays.length > 0 && (
                <div className="mt-3 text-sm">
                  <b>{L('Ishlamaydigan kunlar', 'Нерабочие дни', 'Closed days')}:</b> {W(() => ev.museum!.offDays.map((o) => `${fmtDate(o.date)}${o.reason ? ` (${o.reason})` : ''}`).join('; '))}
                </div>
              )}
            </>
          ) : (
            <p className="text-bad">{L('Grafik yoʻq', 'Нет графика', 'No schedule')}</p>
          )}
        </section>
      ) : (
        <section>
          <h3 className="mb-2 font-bold">
            {L('Seanslar', 'Сеансы', 'Sessions')} <span className="font-normal text-ink-3">· {sessions.length}</span>
          </h3>
          {sessions.length ? (
            <ul className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
              {sessions.map((s) => (
                <li key={s.id} className={'rounded-xl border px-3 py-2 text-sm ' + (s.startsAt < now() ? 'border-line text-ink-3' : 'border-line-2 bg-white')}>
                  <b>{W(() => fmtDT(s.startsAt))}</b>
                  {ev.kind === 'cinema' && venue && <span className="block text-ink-3">{hallOf(venue, s.hallId)?.name}</span>}
                  {s.postponed.length > 0 && <span className="block text-warn">{L('koʻchirilgan', 'перенесён', 'postponed')}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-bad">{L('Seanslar yoʻq', 'Нет сеансов', 'No sessions')}</p>
          )}
        </section>
      )}

      {pm !== 'element' && (
        <section>
          <h3 className="mb-2 font-bold">{L('Chipta turlari', 'Типы билетов', 'Ticket types')}</h3>
          {types.length ? (
            <ul className="space-y-2">
              {types.map((t) => (
                <li key={t.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <b>{tl(t.name, lang)}</b>
                    <span className="text-sm">
                      {W(() =>
                        pm === 'museum'
                          ? t.price
                            ? sumFmt(t.price)
                            : L('narx yoʻq', 'нет цены', 'no price')
                          : cats.map((c) => `${tl(c.name, lang)}: ${(t.prices || {})[c.id] ? sumFmt((t.prices || {})[c.id]) : '—'}`).join(' · '),
                      )}
                    </span>
                  </div>
                  {t.req && tl(t.req, lang) && <div className="mt-2 rounded-lg bg-brand-soft px-3 py-1.5 text-sm">{tl(t.req, lang)}</div>}
                  {t.passport !== 'none' && (
                    <div className="mt-1 text-sm text-ink-3">
                      {t.passport === 'citizen' ? L('Oʻzbekiston fuqarosi pasporti tekshiriladi', 'Проверяется паспорт гражданина Узбекистана', 'A Uzbek citizen passport is checked') : L('Xorijiy pasport maʼlumotlari soʻraladi', 'Запрашиваются данные иностранного паспорта', 'Foreign passport details are asked')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-bad">{L('Chipta turlari yoʻq', 'Нет типов билетов', 'No ticket types')}</p>
          )}
        </section>
      )}
    </div>
  );
}
