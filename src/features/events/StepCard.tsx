/* Step 2: the event card — title and description in three languages, duration, age, language, poster. */
import { ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { tl, useI18n } from '../../lib/i18n';
import { byId } from '../../lib/util';
import { tx } from '../../store/db';
import { evTitle, logAct } from '../../domain/rules';
import type { EventCard, EventItem } from '../../domain/types';
import { Poster } from '../../components/common';
import { Button, Field, Input, Segmented, Select, toast } from '../../components/ui';
import { AGES, has3, MOTIFS, readPoster, trim3 } from './helpers';
import { ErrText, L3Input, pubConfirm, Section } from './ui';

export function CardStep({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  const { t3 } = useI18n();
  const [c, setC] = useState<EventCard>(() => ({ ...ev.card, lang: ev.card.lang || '', poster: { ...ev.card.poster } }));
  const [dur, setDur] = useState(String(ev.card.duration || ''));
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'gen' | 'img'>(ev.card.poster.image ? 'img' : 'gen');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<EventCard>) => setC((o) => ({ ...o, ...patch }));
  const setPoster = (patch: Partial<EventCard['poster']>) => setC((o) => ({ ...o, poster: { ...o.poster, ...patch } }));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const data = await readPoster(f);
      setPoster({ image: data });
      setMode('img');
    } catch {
      toast(t3('Rasmni oʻqib boʻlmadi. JPG yoki PNG faylni tanlang.', 'Не удалось прочитать изображение. Выберите JPG или PNG.', 'Couldn’t read the image. Choose a JPG or PNG file.'), 'bad');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async (next: boolean) => {
    const e: Record<string, string> = {};
    if (!has3(c.title)) e.title = t3('Nomini kamida bitta tilda kiriting', 'Укажите название хотя бы на одном языке', 'Enter the title in at least one language');
    const d = parseInt(dur, 10);
    if (!(d >= 1 && d <= 600)) e.duration = t3('Davomiylikni kiriting (1–600 daqiqa)', 'Укажите длительность (1–600 мин)', 'Enter the duration (1–600 min)');
    setErr(e);
    if (Object.keys(e).length) {
      toast(t3('Belgilangan maydonlarni tekshiring', 'Проверьте подсвеченные поля', 'Check the highlighted fields'), 'bad');
      return;
    }
    if (!(await pubConfirm(ev))) return;
    const poster = mode === 'gen' ? { hue: c.poster.hue, motif: c.poster.motif, image: null } : c.poster;
    tx((db) => {
      const x = byId(db.events, ev.id)!;
      const descChanged = JSON.stringify(trim3(x.card.desc)) !== JSON.stringify(trim3(c.desc));
      x.card = { ...x.card, title: trim3(c.title), desc: trim3(c.desc), duration: d, age: c.age, lang: (c.lang || '').trim(), poster };
      logAct('event-update', evTitle(x), x.status === 'published' && descChanged ? t3('tavsif oʻzgartirildi', 'описание изменено', 'description changed') : t3('kartochka', 'карточка', 'card'));
    });
    toast(t3('Kartochka saqlandi', 'Карточка сохранена', 'Card saved'), 'ok');
    if (next) onNext();
  };

  const preview: EventCard = { ...c, poster: mode === 'gen' ? { ...c.poster, image: null } : c.poster };
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Section title={t3('Kartochka', 'Карточка', 'Event card')} sub={t3('Xaridor oʻz tilini koʻradi; tarjima boʻlmasa — boshqa tildagi matn.', 'Покупатель увидит свой язык; если перевода нет — текст на другом языке.', 'Buyers see their language; without a translation they see another one.')}>
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink-2">
              {t3('Nomi', 'Название', 'Title')}
              <span className="text-bad"> *</span>
            </div>
            <L3Input value={c.title} max={120} invalid={!!err.title} onChange={(v) => set({ title: v })} />
            <ErrText>{err.title}</ErrText>
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink-2">{t3('Tavsif', 'Описание', 'Description')}</div>
            <L3Input area value={c.desc} max={3000} onChange={(v) => set({ desc: v })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t3('Davomiyligi, daqiqa', 'Длительность, мин', 'Duration, min')} required error={err.duration}>
              <Input type="number" min={1} max={600} value={dur} invalid={!!err.duration} onChange={(e) => setDur(e.target.value)} />
            </Field>
            <Field label={t3('Yosh chegarasi', 'Возраст', 'Age rating')}>
              <Select value={c.age} onChange={(e) => set({ age: e.target.value })}>
                <option value="">—</option>
                {AGES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t3('Ijro tili', 'Язык исполнения', 'Performance language')}>
              <Input value={c.lang || ''} maxLength={60} placeholder={t3('Masalan, oʻzbek tilida', 'Например, на узбекском', 'E.g. in Uzbek')} onChange={(e) => set({ lang: e.target.value })} />
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink-2">{t3('Afisha', 'Афиша', 'Poster')}</span>
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'gen', label: t3('Naqshli', 'Узор', 'Generated') },
                  { value: 'img', label: t3('Rasm', 'Изображение', 'Image') },
                ]}
              />
            </div>
            {mode === 'gen' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t3('Rang', 'Цвет', 'Colour')}>
                  <input type="range" min={0} max={359} value={c.poster.hue} onChange={(e) => setPoster({ hue: Number(e.target.value) })} className="h-11 w-full accent-ink" style={{ background: 'transparent' }} />
                </Field>
                <Field label={t3('Naqsh', 'Мотив', 'Motif')}>
                  <Select value={c.poster.motif} onChange={(e) => setPoster({ motif: e.target.value })}>
                    {MOTIFS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {tl(m.name)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <Button variant="outline" loading={busy} onClick={() => fileRef.current?.click()}>
                  <ImagePlus className="size-4" />
                  {c.poster.image ? t3('Boshqa rasm', 'Другое изображение', 'Another image') : t3('Rasm yuklash', 'Загрузить изображение', 'Upload an image')}
                </Button>
                {c.poster.image && (
                  <Button variant="ghost" onClick={() => setPoster({ image: null })}>
                    <Trash2 className="size-4" />
                    {t3('Olib tashlash', 'Убрать', 'Remove')}
                  </Button>
                )}
                <span className="text-xs text-ink-3">{t3('JPG yoki PNG; 900 px kenglikkacha kichraytiriladi.', 'JPG или PNG; уменьшается до 900 px по ширине.', 'JPG or PNG; scaled down to 900 px wide.')}</span>
              </div>
            )}
          </div>
        </div>
        {!ro && (
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => save(false)}>
              {t3('Saqlash', 'Сохранить', 'Save')}
            </Button>
            <Button onClick={() => save(true)}>
              {t3('Saqlash va davom etish', 'Сохранить и дальше', 'Save and continue')}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
      </Section>
      <div className="xl:sticky xl:top-6 xl:self-start">
        <div className="mb-2 text-sm text-ink-3">{t3('Afishada shunday koʻrinadi', 'Так увидят на афише', 'How it looks on the storefront')}</div>
        <div className="aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded-2xl shadow-[var(--shadow-card)]">
          <Poster card={preview} />
        </div>
      </div>
    </div>
  );
}
