/* Step 3: the event's own copy of the seating plan [Р1]: capacity, fan zone limits, re-copy from the venue; cinema halls. */
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { tl, useI18n } from '../../lib/i18n';
import { byId } from '../../lib/util';
import { tx, useDb } from '../../store/db';
import { evTitle, logAct } from '../../domain/rules';
import { capacityOf, catOf, elTypeName, seatCount, sellables, touch, validateScheme } from '../../domain/scheme';
import type { EventItem } from '../../domain/types';
import { SchemeLegend, SchemeView } from '../../components/scheme/SchemeView';
import { Badge, Button, cn, Empty, Input, Notice, Segmented, toast } from '../../components/ui';
import { canRecopy, recopyPlan, zoneSoldMax } from './helpers';
import { confirmBox, ErrText, pubConfirm, Section } from './ui';

export function PlanStep({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  return ev.kind === 'cinema' ? <CinemaHalls ev={ev} onNext={onNext} /> : <OwnPlan ev={ev} ro={ro} onNext={onNext} />;
}

function OwnPlan({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const sc = ev.schemeId ? db.schemes[ev.schemeId] : undefined;
  const venue = byId(db.venues, ev.venueId);
  const [focus, setFocus] = useState<string | null>(null);
  const [lims, setLims] = useState<Record<string, string>>({});
  const [err, setErr] = useState<Record<string, string>>({});
  const errs = useMemo(() => (sc ? validateScheme(sc) : []), [sc]);
  const bad = useMemo(() => new Set(errs.map((e) => e.id)), [errs]);
  if (!sc || !venue) return <Empty title={t3('Sxema yoʻq', 'Схемы нет', 'No plan')}>{t3('Avval maydonni tanlang.', 'Сначала выберите площадку.', 'Choose a venue first.')}</Empty>;
  const els = sellables(sc);
  const fans = els.filter((e) => e.type === 'fan');
  const limVal = (id: string, cur: number | null | undefined) => lims[id] ?? String(cur ?? '');
  const dirty = fans.some((f) => lims[f.id] != null && lims[f.id] !== String(f.limit ?? ''));
  const recopyOk = canRecopy(ev);

  const saveLimits = async () => {
    const e: Record<string, string> = {};
    const next: Record<string, number> = {};
    for (const f of fans) {
      const raw = limVal(f.id, f.limit).trim();
      const n = Number(raw);
      const sold = zoneSoldMax(ev, f.id);
      if (!raw || !Number.isInteger(n) || n <= 0) e[f.id] = t3('Odamlar limitini kiriting', 'Укажите лимит людей', 'Enter the people limit');
      else if (n < sold) e[f.id] = t3('Sotilgan {n}, limit kamroq boʻlishi mumkin emas', 'Продано {n}, лимит не может быть меньше', '{n} sold, the limit can’t be lower', { n: sold });
      else next[f.id] = n;
    }
    setErr(e);
    if (Object.keys(e).length) return;
    if (!(await pubConfirm(ev))) return;
    tx((d) => {
      const x = byId(d.events, ev.id)!;
      const s2 = d.schemes[x.schemeId!];
      for (const el of s2.els) {
        if (el.type !== 'fan' || next[el.id] == null || next[el.id] === el.limit) continue;
        logAct('fan-limit', evTitle(x), `${el.name}: ${el.limit ?? '—'} → ${next[el.id]}`);
        el.limit = next[el.id];
        touch(el);
      }
    });
    setLims({});
    toast(t3('Limitlar saqlandi', 'Лимиты сохранены', 'Limits saved'), 'ok');
  };
  const recopy = async () => {
    const ok = await confirmBox({
      title: t3('Maydon sxemasidan qayta nusxalansinmi?', 'Скопировать схему площадки заново?', 'Copy the venue plan again?'),
      text: t3(
        'Tadbir sxemasi «{h}» zalining joriy sxemasi bilan almashtiriladi. Nomi bir xil sektorlar narxi saqlanadi.',
        'Схема мероприятия заменится текущей схемой зала «{h}». Цены секторов с теми же названиями сохранятся.',
        'The event plan is replaced with the current plan of hall "{h}". Prices of sectors with the same names are kept.',
        { h: (venue.halls.find((x) => x.id === ev.hallId) || venue.halls[0])?.name || '' },
      ),
      ok: t3('Nusxalash', 'Скопировать', 'Copy'),
    });
    if (!ok) return;
    recopyPlan(ev.id);
    setLims({});
    toast(t3('Sxema yangilandi', 'Схема обновлена', 'Plan updated'), 'ok');
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section
          title={t3('Tadbir sxemasi', 'Схема мероприятия', 'Event plan')}
          sub={t3(
            '«{h}» zali sxemasining nusxasi. Maydon sxemasidagi keyingi oʻzgarishlar unga taʼsir qilmaydi.',
            'Копия схемы зала «{h}». Последующие изменения схемы площадки её не меняют.',
            'A copy of hall "{h}". Later changes to the venue plan don’t affect it.',
            { h: (venue.halls.find((x) => x.id === ev.hallId) || venue.halls[0])?.name || venue.name },
          )}
          actions={
            !ro && recopyOk ? (
              <Button variant="outline" size="sm" onClick={recopy}>
                <RefreshCw className="size-4" />
                {t3('Maydon sxemasidan qayta nusxalash', 'Скопировать со схемы площадки заново', 'Copy from the venue plan again')}
              </Button>
            ) : undefined
          }
        >
          <SchemeView scheme={sc} mode="preview" focus={focus} bad={bad} height={420} />
          <div className="mt-3">
            <SchemeLegend scheme={sc} />
          </div>
          {!recopyOk && !ro && <p className="mt-3 text-xs text-ink-3">{t3('Chiptalar sotilgan yoki bronda: sxemani qayta nusxalab boʻlmaydi.', 'Есть проданные или забронированные билеты: схему нельзя скопировать заново.', 'Tickets are sold or held: the plan can’t be copied again.')}</p>}
        </Section>
        <Section title={t3('Sigʻim', 'Вместимость', 'Capacity')} sub={t3('Jami: {n}', 'Всего: {n}', 'Total: {n}', { n: capacityOf(sc) })}>
          {errs.length > 0 && (
            <Notice tone="bad" className="mb-3" title={t3('Sxemada xatolar bor', 'В схеме есть ошибки', 'The plan has problems')}>
              {errs[0].msg}
            </Notice>
          )}
          {els.length ? (
            <ul className="divide-y divide-line">
              {els.map((el) => {
                const cat = catOf(sc, el.cat);
                const sold = el.type === 'fan' ? zoneSoldMax(ev, el.id) : 0;
                return (
                  <li key={el.id} className={cn('flex flex-wrap items-center gap-3 py-2.5', focus === el.id && 'bg-brand-soft/50')} onMouseEnter={() => setFocus(el.id)} onFocus={() => setFocus(el.id)}>
                    <i className="inline-block size-3 shrink-0 rounded-full" style={{ background: cat.color }} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate">{el.type === 'table' ? t3('Stol {n}', 'Стол {n}', 'Table {n}', { n: el.name }) : el.name}</b>
                      <span className="text-xs text-ink-3">
                        {elTypeName(el.type)} · {tl(cat.name)}
                      </span>
                      {bad.has(el.id) && (
                        <Badge tone="bad" className="ml-1">
                          !
                        </Badge>
                      )}
                    </span>
                    {el.type === 'fan' ? (
                      <span className="w-36">
                        <Input type="number" min={1} disabled={ro} value={limVal(el.id, el.limit)} invalid={!!err[el.id]} onChange={(e) => setLims((o) => ({ ...o, [el.id]: e.target.value }))} aria-label={t3('Limit', 'Лимит', 'Limit')} />
                        {sold > 0 && !err[el.id] && <span className="mt-0.5 block text-xs text-ink-3">{t3('{n} gacha sotilgan', 'продано до {n}', 'up to {n} sold', { n: sold })}</span>}
                        <ErrText>{err[el.id]}</ErrText>
                      </span>
                    ) : (
                      <span className="text-sm tabular-nums">{t3('{n} joy', '{n} мест', '{n} seats', { n: seatCount(el) })}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-3">{t3('Sxemada sotiladigan sektor yoʻq. Maydon sxemasini tahrirlang va qayta nusxalang.', 'В схеме нет продаваемых секторов. Настройте схему площадки и скопируйте её заново.', 'The plan has no sellable sectors. Edit the venue plan and copy it again.')}</p>
          )}
          {!ro && fans.length > 0 && (
            <div className="mt-4 flex justify-end">
              <Button variant="outline" disabled={!dirty} onClick={saveLimits}>
                {t3('Limitlarni saqlash', 'Сохранить лимиты', 'Save the limits')}
              </Button>
            </div>
          )}
        </Section>
      </div>
      <div className="flex justify-end">
        <Button onClick={onNext}>
          {t3('Davom etish', 'Далее', 'Continue')}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function CinemaHalls({ ev, onNext }: { ev: EventItem; onNext: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const venue = byId(db.venues, ev.venueId);
  const [hallId, setHallId] = useState<string | null>(null);
  if (!venue || !venue.halls.length) return <Empty title={t3('Zallar yoʻq', 'Нет залов', 'No halls')}>{t3('Avval maydonni tanlang.', 'Сначала выберите площадку.', 'Choose a venue first.')}</Empty>;
  const hall = venue.halls.find((h) => h.id === hallId) || venue.halls[0];
  const sc = db.schemes[hall.schemeId];
  return (
    <div className="space-y-6">
      <Section
        title={t3('Kinoteatr zallari', 'Залы кинотеатра', 'Cinema halls')}
        sub={t3(
          'Har bir seans yaratilganda oʻz zali sxemasining nusxasini oladi. Zal sxemalari maydon boʻlimida tahrirlanadi.',
          'Каждый сеанс при создании получает копию схемы своего зала. Схемы залов редактируются в разделе площадки.',
          'Each showtime gets a copy of its hall’s plan when it is created. Hall plans are edited in the venue section.',
        )}
      >
        {venue.halls.length > 1 && (
          <Segmented className="mb-4 max-w-full overflow-x-auto" value={hall.id} onChange={setHallId} options={venue.halls.map((h) => ({ value: h.id, label: h.name }))} />
        )}
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {venue.halls.map((h) => {
            const s2 = db.schemes[h.schemeId];
            return (
              <Badge key={h.id} tone={h.id === hall.id ? 'dark' : 'neutral'}>
                {h.name} · {t3('{n} joy', '{n} мест', '{n} seats', { n: s2 ? capacityOf(s2) : 0 })}
              </Badge>
            );
          })}
        </div>
        {sc ? (
          <>
            <SchemeView scheme={sc} mode="preview" height={380} />
            <div className="mt-3">
              <SchemeLegend scheme={sc} />
            </div>
          </>
        ) : (
          <p className="text-ink-3">{t3('Zalda sxema yoʻq', 'У зала нет схемы', 'The hall has no seating plan')}</p>
        )}
      </Section>
      <div className="flex justify-end">
        <Button onClick={onNext}>
          {t3('Davom etish', 'Далее', 'Continue')}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
