/* Venue create/edit form (US-04) and the "ask a moderator to set up a venue" request (US-11). */
import { clsx } from 'clsx';
import { Clock3, LayoutGrid } from 'lucide-react';
import { useState } from 'react';
import { t3, tl, tx3, useI18n } from '../../lib/i18n';
import { now } from '../../lib/time';
import { uid } from '../../lib/util';
import { tx } from '../../store/db';
import { CITIES, logAct, venueEvents } from '../../domain/rules';
import { newScheme, templateScheme, type HallTemplate } from '../../domain/scheme';
import { arenaLayoutName, arenaScheme, ARENA_LAYOUTS } from '../../domain/arena';
import type { Venue, VenueType } from '../../domain/types';
import { Button, Field, Input, Modal, Select, Textarea, toast } from '../../components/ui';

export const VENUE_TYPE = {
  timed: tx3('Vaqt boʻyicha kirish', 'Вход по времени', 'Timed entry'),
  scheme: tx3('Sxema', 'Схема', 'Seating plan'),
};

type Errs = Partial<Record<'name' | 'city' | 'address' | 'type' | 'lat' | 'file', string>>;

export function VenueForm({ venue, orgId, onSaved }: { venue?: Venue; orgId: string; onSaved: (v: Venue, created: boolean) => void }) {
  useI18n();
  const evs = venue ? venueEvents(venue.id) : [];
  const typeLocked = evs.length > 0;
  const pubLocked = !!venue && evs.some((e) => e.status === 'published' || e.status === 'moderation');
  const [f, setF] = useState({
    name: venue?.name || '',
    city: venue?.city || '',
    address: venue?.address || '',
    lat: venue?.point ? String(venue.point.lat) : '',
    lng: venue?.point ? String(venue.point.lng) : '',
    type: (venue?.type || '') as VenueType | '',
    template: 'theatre' as HallTemplate | 'empty' | 'arena',
  });
  const [errs, setErrs] = useState<Errs>({});
  const submit = () => {
    const e: Errs = {};
    const name = pubLocked ? venue!.name : f.name.trim();
    const address = pubLocked ? venue!.address : f.address.trim();
    const city = pubLocked ? venue!.city : f.city;
    const type = (typeLocked ? venue!.type : f.type) as VenueType | '';
    if (name.length < 2 || name.length > 100) e.name = t3('Maydon nomini kiriting', 'Укажите название площадки', 'Enter the venue name');
    if (!city) e.city = t3('Shaharni tanlang', 'Выберите город', 'Choose a city');
    if (!address) e.address = t3('Manzilni kiriting', 'Укажите адрес', 'Enter the address');
    if (!type) e.type = t3('Maydon turini tanlang', 'Выберите вид площадки', 'Choose the kind of venue');
    let point: Venue['point'] = null;
    if (f.lat || f.lng) {
      const la = parseFloat(f.lat.replace(',', '.'));
      const ln = parseFloat(f.lng.replace(',', '.'));
      if (!(la >= 37 && la <= 46 && ln >= 55 && ln <= 74)) e.lat = t3('Koordinatalar Oʻzbekistonga oʻxshamaydi', 'Координаты не похожи на Узбекистан', 'These coordinates aren’t in Uzbekistan');
      else point = { lat: la, lng: ln };
    }
    setErrs(e);
    if (Object.keys(e).length) return;
    const saved = tx((d) => {
      const mkHall = () => {
        const sid = uid('sch');
        d.schemes[sid] = f.template === 'empty' || f.template === 'arena' ? newScheme() : templateScheme(f.template);
        return { id: uid('hall'), name: t3('Asosiy zal', 'Основной зал', 'Main hall'), order: 0, schemeId: sid };
      };
      if (venue) {
        const x = d.venues.find((v) => v.id === venue.id)!;
        const typeChanged = x.type !== type;
        Object.assign(x, { name, city, address, point, type });
        if (typeChanged && type === 'scheme' && !x.halls.length) x.halls.push(mkHall());
        if (typeChanged && type === 'timed') x.halls = [];
        logAct('venue-update', name, `${address}`);
        return x;
      }
      const nv: Venue = { id: uid('v_'), orgId, name, city, address, point, type: type as VenueType, halls: [], createdAt: now(), createdBy: 'org' };
      if (type === 'scheme' && f.template === 'arena') {
        // a multi-purpose arena: one layout per kind of event, the organizer edits each separately
        ARENA_LAYOUTS.forEach((l, i) => {
          const sid = uid('sch');
          d.schemes[sid] = arenaScheme(l);
          nv.halls.push({ id: uid('hall'), name: tl(arenaLayoutName(l)), order: i, schemeId: sid });
        });
      } else if (type === 'scheme') nv.halls.push(mkHall());
      d.venues.push(nv);
      logAct('venue-create', name, `${tl(VENUE_TYPE[type as VenueType])}`);
      return nv;
    });
    toast(venue ? t3('Saqlandi', 'Сохранено', 'Saved') : t3('Maydon yaratildi', 'Площадка создана', 'Venue created'), 'ok');
    onSaved(saved, !venue);
  };
  return (
    <div className="space-y-4">
      {pubLocked && (
        <p className="rounded-2xl bg-info-soft p-3 text-sm text-info">
          {t3(
            'Maydon eʼlon qilingan tadbirlarda ishlatilmoqda, shuning uchun nomi va manzili bu yerda oʻzgarmaydi. Tadbirni boshqa joyga koʻchirish uchun yangi maydon yarating va uni tadbirda almashtiring — bu moderator tekshiruvidan oʻtadi.',
            'Площадка используется в опубликованных мероприятиях, поэтому название и адрес здесь не меняются. Чтобы перенести мероприятие, создайте новую площадку и смените её в мероприятии — смена пройдёт проверку модератора.',
            'Published events use this venue, so its name and address can’t change here. To move an event, create a new venue and switch to it in the event; a moderator checks the change.',
          )}
        </p>
      )}
      <Field label={t3('Nomi', 'Название', 'Name')} required error={errs.name} hint={t3('Tarjima qilinmaydi — xaridorlar kiritilganidek koʻradi', 'Не переводится — покупатели видят как введено', 'Not translated: buyers see it exactly as typed')}>
        <Input value={f.name} maxLength={100} disabled={pubLocked} invalid={!!errs.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t3('Shahar', 'Город', 'City')} required error={errs.city}>
          <Select value={f.city} disabled={pubLocked} invalid={!!errs.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
            <option value="">—</option>
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {tl(c.name)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t3('Manzil', 'Адрес', 'Address')} required error={errs.address}>
          <Input value={f.address} maxLength={200} disabled={pubLocked} invalid={!!errs.address} placeholder={t3('Koʻcha va uy', 'Улица и дом', 'Street and number')} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
      </div>
      <Field label={t3('Xaritadagi nuqta (ixtiyoriy)', 'Точка на карте (по желанию)', 'Map pin (optional)')} error={errs.lat} hint={t3('Koordinatalarni xaritadan nusxalang. Xaridor «Xaritada ochish» havolasini koʻradi.', 'Скопируйте координаты из карт. Покупатель увидит ссылку «Открыть на карте».', 'Copy the coordinates from a map app. Buyers get an "Open in maps" link.')}>
        <div className="grid grid-cols-2 gap-2">
          <Input className="font-mono" placeholder="41.3111" inputMode="decimal" value={f.lat} aria-label={t3('Kenglik', 'Широта', 'Latitude')} onChange={(e) => setF({ ...f, lat: e.target.value })} />
          <Input className="font-mono" placeholder="69.2797" inputMode="decimal" value={f.lng} aria-label={t3('Uzunlik', 'Долгота', 'Longitude')} onChange={(e) => setF({ ...f, lng: e.target.value })} />
        </div>
      </Field>
      <Field label={t3('Turi', 'Вид', 'Kind')} required error={errs.type} hint={typeLocked ? t3('Turini oʻzgartirib boʻlmaydi: maydonda tadbirlar bor', 'Вид нельзя изменить: на площадке есть мероприятия', 'The kind can’t change: this venue has events') : undefined}>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['scheme', 'timed'] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={typeLocked}
              onClick={() => setF({ ...f, type: k })}
              className={clsx('flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60', f.type === k ? 'border-ink bg-brand-soft' : 'border-line hover:border-line-2')}
            >
              {k === 'scheme' ? <LayoutGrid className="mt-0.5 size-5 shrink-0" /> : <Clock3 className="mt-0.5 size-5 shrink-0" />}
              <span>
                <b className="block">{tl(VENUE_TYPE[k])}</b>
                <span className="text-sm text-ink-3">
                  {k === 'timed'
                    ? t3('Muzey, koʻrgazma: odamlar limiti bilan soatlik slotlarga chiptalar', 'Музей, выставка: билеты на часовые слоты с лимитом людей', 'Museums and exhibitions: tickets for time slots with a people limit')
                    : t3('Teatr, kino, konsert, stadion: joylar sxemasi, fan-zonalar va stollar bilan zallar', 'Театр, кино, концерт, стадион: залы со схемой мест, фан-зонами и столами', 'Theatres, cinemas, concerts, stadiums: halls with a seating plan, standing areas and tables')}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Field>
      {!venue && f.type === 'scheme' && (
        <Field label={t3('Asosiy zal qanday boshlansin', 'С чего начать основной зал', 'Start the main hall from')} hint={t3('Keyin muharrirda istalgancha oʻzgartirasiz yoki SVG yuklaysiz.', 'Потом в редакторе можно всё изменить или загрузить SVG.', 'You can change everything in the editor later or upload an SVG.')}>
          <Select value={f.template} onChange={(e) => setF({ ...f, template: e.target.value as HallTemplate | 'empty' | 'arena' })}>
            <option value="arena">{t3('Koʻp maqsadli arena — 5 ta joylashuv (konsert, UFC, xokkey, boks, festival)', 'Многофункциональная арена — 5 конфигураций (концерт, UFC, хоккей, бокс, фестиваль)', 'Multi-purpose arena — 5 layouts (concert, UFC, hockey, boxing, festival)')}</option>
            <option value="theatre">{t3('Teatr shabloni', 'Шаблон: театр', 'Template: theatre')}</option>
            <option value="cinema">{t3('Kinozal shabloni', 'Шаблон: кинозал', 'Template: cinema hall')}</option>
            <option value="concert">{t3('Konsert zali shabloni', 'Шаблон: концертный зал', 'Template: concert hall')}</option>
            <option value="stadium">{t3('Stadion shabloni', 'Шаблон: стадион', 'Template: stadium')}</option>
            <option value="banquet">{t3('Banket (stollar) shabloni', 'Шаблон: банкет (столы)', 'Template: banquet (tables)')}</option>
            <option value="ga">{t3('Erkin joylashuv', 'Свободная рассадка', 'General admission')}</option>
            <option value="empty">{t3('Boʻsh sxema', 'Пустая схема', 'Empty plan')}</option>
          </Select>
        </Field>
      )}
      <div className="flex justify-end">
        <Button onClick={submit}>{venue ? t3('Saqlash', 'Сохранить', 'Save') : t3('Maydon yaratish', 'Создать площадку', 'Create venue')}</Button>
      </div>
    </div>
  );
}

export function VenueRequestModal({ open, onClose, orgId }: { open: boolean; onClose: () => void; orgId: string }) {
  useI18n();
  const [f, setF] = useState({ name: '', city: '', address: '', type: 'scheme' as VenueType, comment: '' });
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const e: Errs = {};
    if (f.name.trim().length < 2) e.name = t3('Maydon nomini kiriting', 'Укажите название площадки', 'Enter the venue name');
    if (!f.city) e.city = t3('Shaharni tanlang', 'Выберите город', 'Choose a city');
    if (!f.address.trim()) e.address = t3('Manzilni kiriting', 'Укажите адрес', 'Enter the address');
    if (file && file.size > 10 * 1024 * 1024) e.file = t3('Fayl 10 MB dan katta', 'Файл больше 10 МБ', 'The file is larger than 10 MB');
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    // small files travel with the request so the moderator can open them; big ones keep only the name
    const data = file && file.size <= 1.5 * 1024 * 1024 ? await readAsDataUrl(file) : undefined;
    tx((d) => {
      d.venueReqs.push({
        id: uid('vr'),
        orgId,
        name: f.name.trim(),
        city: f.city,
        address: f.address.trim(),
        type: f.type,
        file: file ? { name: file.name, size: file.size, data } : null,
        comment: f.comment.trim(),
        status: 'new',
        reason: '',
        venueId: null,
        createdAt: now(),
        history: [],
      });
      logAct('venue-request', f.name.trim());
    });
    setBusy(false);
    toast(t3('Soʻrov moderatorga yuborildi', 'Запрос отправлен модератору', 'Request sent to the moderators'), 'ok');
    setF({ name: '', city: '', address: '', type: 'scheme', comment: '' });
    setFile(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t3('Moderatordan maydon yaratishni soʻrash', 'Попросить модератора создать площадку', 'Ask a moderator to set up a venue')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t3('Bekor qilish', 'Отмена', 'Cancel')}
          </Button>
          <Button onClick={submit} loading={busy}>
            {t3('Soʻrovni yuborish', 'Отправить запрос', 'Send request')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-3">{t3('Murakkab zallar uchun mos, masalan oʻnlab sektorli arena. Moderator maydonni kabinetingizda yaratadi, keyin uni oʻzgartirishingiz mumkin.', 'Подходит для сложных залов, например арены с десятком секторов. Модератор создаст площадку в вашем кабинете, а вы потом сможете её менять.', 'Handy for complex halls such as an arena with a dozen sectors. A moderator builds the venue in your account and you can edit it afterwards.')}</p>
        <Field label={t3('Nomi', 'Название', 'Name')} required error={errs.name}>
          <Input value={f.name} maxLength={100} invalid={!!errs.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t3('Shahar', 'Город', 'City')} required error={errs.city}>
            <Select value={f.city} invalid={!!errs.city} onChange={(e) => setF({ ...f, city: e.target.value })}>
              <option value="">—</option>
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {tl(c.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t3('Turi', 'Вид', 'Kind')} required>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as VenueType })}>
              <option value="scheme">{tl(VENUE_TYPE.scheme)}</option>
              <option value="timed">{tl(VENUE_TYPE.timed)}</option>
            </Select>
          </Field>
        </div>
        <Field label={t3('Manzil', 'Адрес', 'Address')} required error={errs.address}>
          <Input value={f.address} maxLength={200} invalid={!!errs.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label={t3('Sxema fayli (ixtiyoriy)', 'Файл схемы (по желанию)', 'Plan file (optional)')} error={errs.file} hint={t3('SVG, PDF yoki rasm, 10 MB gacha', 'SVG, PDF или фото, до 10 МБ', 'SVG, PDF or a photo, up to 10 MB')}>
          <input type="file" accept=".svg,.pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-black/5 file:px-3 file:py-2 file:font-semibold" />
        </Field>
        <Field label={t3('Izoh', 'Комментарий', 'Comment')}>
          <Textarea rows={3} maxLength={1000} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function readAsDataUrl(f: File) {
  return new Promise<string | undefined>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => res(undefined);
    r.readAsDataURL(f);
  });
}
