/* Modals of the seating-plan editor: markup help, buyer preview, hall templates. */
import { clsx } from 'clsx';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { t3, tl, useI18n } from '../../lib/i18n';
import { downloadBlob } from '../../lib/util';
import { capacityOf, sampleSvg, templateScheme, type HallTemplate } from '../../domain/scheme';
import type { Scheme, SchemeEl } from '../../domain/types';
import { SchemeLegend, SchemeView } from '../../components/scheme/SchemeView';
import { Button, Modal, Segmented, toast } from '../../components/ui';

export function downloadSample() {
  downloadBlob(new Blob([sampleSvg(false)], { type: 'image/svg+xml' }), 'sayohat-scheme-example.svg');
}

export function SvgHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useI18n();
  const rows: [string, string, string][] = [
    ['stage / screen', t3('Sahna yoki ekran', 'Сцена или экран', 'Stage or screen'), 'data-name'],
    ['sector / vip', t3('Joyli sektor; vip — darhol VIP toifa', 'Сектор с местами; vip — сразу категория VIP', 'Seated sector; vip sets the VIP category'), 'data-name, data-category'],
    ['lounge', t3('Joyli launj', 'Лаунж с местами', 'Lounge with seats'), 'data-name'],
    ['fan', t3('Fan-zona, tik turish joylari', 'Фан-зона, стоячие места', 'Standing fan zone'), 'data-name, data-limit'],
    ['table', t3('Stol', 'Стол', 'Table'), 'data-name, data-seats, data-mode = whole | seats | both'],
  ];
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t3('SVG Sayohat uchun qanday belgilanadi', 'Как разметить SVG для Sayohat', 'Marking up an SVG for Sayohat')}
      footer={
        <>
          <Button variant="outline" onClick={downloadSample}>
            <Download className="size-4" />
            {t3('Namunani yuklab olish', 'Скачать пример', 'Download the example')}
          </Button>
          <Button onClick={onClose}>{t3('Tushunarli', 'Понятно', 'Got it')}</Button>
        </>
      }
    >
      <div className="space-y-4 text-[15px] text-ink-2">
        <p>{t3('Sxemani istalgan muharrirda (Figma, Illustrator, Inkscape) chizing va har bir elementni data-sayohat atributi bilan belgilang. Belgilanmagan shakllar roʻyxatga «Aniqlanmadi» sifatida tushadi — turini shu yerda tanlaysiz.', 'Нарисуйте схему в любом редакторе (Figma, Illustrator, Inkscape) и отметьте каждый элемент атрибутом data-sayohat. Неотмеченные фигуры попадут в список как «Не распознано» — вид выберете здесь.', 'Draw the plan in any editor (Figma, Illustrator, Inkscape) and tag each element with a data-sayohat attribute. Untagged shapes show up as "Not recognized" — you pick their kind here.')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="py-2 pr-3">data-sayohat</th>
                <th className="py-2 pr-3">{t3('Bu nima', 'Что это', 'What it is')}</th>
                <th className="py-2">{t3('Qoʻshimcha', 'Дополнительно', 'Extra attributes')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, w, x]) => (
                <tr key={k} className="border-b border-line">
                  <td className="py-2 pr-3 font-mono">{k}</td>
                  <td className="py-2 pr-3">{w}</td>
                  <td className="py-2 font-mono text-xs">{x}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{t3('Joylar — sektor ichidagi qator va joy raqamli doirachalar:', 'Места — кружки внутри сектора с номером ряда и места:', 'Seats are circles inside a sector with row and seat numbers:')}</p>
        <pre className="overflow-x-auto rounded-xl bg-ink p-3 font-mono text-xs leading-relaxed text-white">{`<g data-sayohat="sector" data-name="A">
  <rect x="80" y="360" width="240" height="200"/>
  <circle data-row="1" data-seat="1" cx="96" cy="384" r="5"/>
  <circle data-row="1" data-seat="2" cx="112" cy="384" r="5"/>
</g>
<g data-sayohat="fan" data-name="Fan-zona" data-limit="500"><rect …/></g>
<g data-sayohat="table" data-name="4" data-seats="6" data-mode="both"><circle …/></g>`}</pre>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t3('Raqamsiz doirachalar guruhi ham sektor sifatida tanib olinadi: joylar y boʻyicha qatorlarga ajratilib, chapdan oʻngga avtomatik raqamlanadi.', 'Группа кружков без номеров тоже распознаётся как сектор: места делятся на ряды по высоте и нумеруются слева направо автоматически.', 'A group of unnumbered circles is recognized as a sector too: seats are split into rows by height and numbered left to right automatically.')}</li>
          <li>{t3('iticket uslubidagi belgilash ham qabul qilinadi: <g data-sector> ichida data-row/data-seat yoki class="seat".', 'Принимается и разметка в стиле iticket: <g data-sector> с data-row/data-seat или class="seat" внутри.', 'iticket-style markup works too: <g data-sector> with data-row/data-seat or class="seat" inside.')}</li>
          <li>{t3('Atribut oʻrniga qatlamni nomlash mumkin: id="sector-A", id="fan", id="table-4".', 'Вместо атрибута можно назвать слой: id="sector-A", id="fan", id="table-4".', 'Instead of the attribute you can name the layer: id="sector-A", id="fan", id="table-4".')}</li>
          <li>{t3('Fayl — faqat SVG, 5 MB gacha. Skriptlar va tashqi havolalar oʻchiriladi.', 'Файл — только SVG, до 5 МБ. Скрипты и внешние ссылки удаляются.', 'SVG only, up to 5 MB. Scripts and external links are removed.')}</li>
        </ul>
      </div>
    </Modal>
  );
}

/** The plan exactly as buyers will see it: sector overview, then seats; clicking demonstrates selection. */
export function PreviewModal({ open, onClose, scheme }: { open: boolean; onClose: () => void; scheme: Scheme }) {
  useI18n();
  const [mode, setMode] = useState<'overview' | 'seats'>('overview');
  const [focus, setFocus] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const onElement = (el: SchemeEl) => {
    if (el.type === 'fan') return toast(t3('Fan-zona: xaridor chiptalar sonini tanlaydi', 'Фан-зона: покупатель выбирает количество билетов', 'Fan zone: buyers choose how many tickets'));
    if (el.type === 'table')
      return toast(
        t3('Stol {n}: {m}', 'Стол {n}: {m}', 'Table {n}: {m}', {
          n: el.name,
          m: { whole: t3('faqat butun', 'только целиком', 'whole table only'), seats: t3('faqat joylar', 'только по местам', 'single seats only'), both: t3('butun yoki joylar', 'целиком или по местам', 'whole or single seats') }[el.mode || 'both'],
        }),
      );
    setMode('seats');
    setFocus(el.id);
  };
  return (
    <Modal open={open} onClose={onClose} size="xl" title={t3('Oldindan koʻrish: xaridor sxemani shunday koʻradi', 'Предпросмотр: так схему увидит покупатель', 'Preview: the plan as buyers will see it')}>
      <div className="space-y-3">
        <Segmented
          value={mode}
          onChange={(v) => {
            setMode(v);
            setFocus(null);
          }}
          options={[
            { value: 'overview', label: t3('Sektorlar', 'Обзор секторов', 'Sectors') },
            { value: 'seats', label: t3('Barcha joylar', 'Все места', 'All seats') },
          ]}
        />
        <SchemeView
          scheme={scheme}
          mode={mode}
          focus={focus}
          sel={sel}
          height="62vh"
          onElement={onElement}
          onSeat={(k) => {
            const n = new Set(sel);
            if (n.has(k)) n.delete(k);
            else n.add(k);
            setSel(n);
          }}
        />
        <SchemeLegend scheme={scheme} states={mode === 'seats'} />
        <p className="text-sm text-ink-3">{t3('Narxlar tadbirda belgilanadi. Bu yerda — joylar joylashuvi, raqamlari va toifalari. Joy qanday belgilanishini koʻrish uchun uni bosing.', 'Цены задаются в мероприятии. Здесь — расположение, номера и категории мест. Нажмите на место, чтобы увидеть, как оно выделяется.', 'Prices are set in each event. This shows layout, numbering and categories. Tap a seat to see how selection looks.')}</p>
      </div>
    </Modal>
  );
}

const TEMPLATES: { k: HallTemplate; name: () => string; hint: () => string }[] = [
  { k: 'cinema', name: () => t3('Kinozal', 'Кинозал', 'Cinema hall'), hint: () => t3('Ekran, 12 qator, oxirgi ikki qator VIP', 'Экран, 12 рядов, два последних — VIP', 'Screen, 12 rows, last two VIP') },
  { k: 'theatre', name: () => t3('Teatr', 'Театр', 'Theatre'), hint: () => t3('Parter (egri, VIP oldi), amfiteatr, balkon', 'Партер (дуга, VIP впереди), амфитеатр, балкон', 'Curved stalls with VIP front, amphitheatre, balcony') },
  { k: 'concert', name: () => t3('Konsert zali', 'Концертный зал', 'Concert hall'), hint: () => t3('Sahna, fan-zona, VIP va A/B/C sektorlari', 'Сцена, фан-зона, VIP и сектора A/B/C', 'Stage, fan zone, VIP and sectors A/B/C') },
  { k: 'stadium', name: () => t3('Stadion', 'Стадион', 'Stadium'), hint: () => t3('Maydon atrofida 4 tribuna va VIP lojasi', '4 трибуны вокруг поля и VIP-ложа', 'Four stands around the field and a VIP box') },
  { k: 'banquet', name: () => t3('Banket / gala', 'Банкет / гала', 'Banquet / gala'), hint: () => t3('Sahna va 13 ta stol (butun yoki joylar)', 'Сцена и 13 столов (целиком или по местам)', 'Stage and 13 tables (whole or seats)') },
  { k: 'ga', name: () => t3('Erkin joylashuv', 'Свободная рассадка', 'General admission'), hint: () => t3('Sahna va joysiz zona (limit bilan)', 'Сцена и зона без мест с лимитом', 'Stage and one standing zone with a limit') },
  { k: 'arena-concert', name: () => t3('Arena · Konsert', 'Арена · Концерт', 'Arena · Concert'), hint: () => t3('Sahna, fan-zona, VIP; sahna ortidagi sektorlar yopiq', 'Сцена, фан-зона, VIP; сектора за сценой закрыты', 'Stage, fan zone, VIP; sectors behind the stage closed') },
  { k: 'arena-ufc', name: () => t3('Arena · UFC / MMA', 'Арена · UFC / MMA', 'Arena · UFC / MMA'), hint: () => t3('Markazda oktagon, VIP qatorlar, 2 yarusli tribunalar', 'Октагон в центре, VIP-ряды, трибуны в 2 яруса', 'Octagon in the middle, VIP rows, two-tier stands') },
  { k: 'arena-hockey', name: () => t3('Arena · Xokkey', 'Арена · Хоккей', 'Arena · Hockey'), hint: () => t3('Muz maydoni va atrofida doimiy tribunalar', 'Ледовая площадка и трибуны вокруг', 'Ice rink with permanent stands around') },
  { k: 'arena-boxing', name: () => t3('Arena · Boks', 'Арена · Бокс', 'Arena · Boxing'), hint: () => t3('Ring va ringside VIP oʻrindiqlar', 'Ринг и VIP-места у ринга', 'Ring with ringside VIP seats') },
  { k: 'arena-festival', name: () => t3('Arena · Festival', 'Арена · Фестиваль', 'Arena · Festival'), hint: () => t3('Tik turish zonalari, sahna, ochiq yon tribunalar', 'Танцпол, сцена, открытые боковые трибуны', 'Standing zones, stage, open side stands') },
];

export function TemplatesModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (sc: Scheme, name: string) => void }) {
  useI18n();
  const [k, setK] = useState<HallTemplate>('theatre');
  const sc = useMemo(() => templateScheme(k), [k, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = TEMPLATES.find((x) => x.k === k)!;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={t3('Zal shabloni', 'Шаблон зала', 'Hall template')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t3('Bekor qilish', 'Отмена', 'Cancel')}
          </Button>
          <Button onClick={() => onPick(templateScheme(k), cur.name())}>{t3('Shablonni qoʻllash', 'Применить шаблон', 'Use this template')}</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
          {TEMPLATES.map((t) => (
            <li key={t.k}>
              <button type="button" onClick={() => setK(t.k)} className={clsx('w-full rounded-2xl border px-3 py-2.5 text-left', t.k === k ? 'border-ink bg-brand-soft' : 'border-line hover:border-line-2')}>
                <div className="font-semibold">{t.name()}</div>
                <div className="text-xs text-ink-3">{t.hint()}</div>
              </button>
            </li>
          ))}
        </ul>
        <div>
          <SchemeView scheme={sc} mode="preview" height={420} viewKey={k} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <SchemeLegend scheme={sc} />
            <span className="text-sm text-ink-3">{t3('sigʻim {n}', 'вместимость {n}', 'capacity {n}', { n: capacityOf(sc) })}</span>
          </div>
          <p className="mt-2 text-sm text-ink-3">{t3('Shablon — boshlangʻich nuqta: qatorlar, raqamlash, egrilik va toifalarni keyin oʻzgartirasiz. {n} element.', 'Шаблон — отправная точка: ряды, нумерацию, изгиб и категории поменяете потом. Элементов: {n}.', 'A template is a starting point: change rows, numbering, curve and categories afterwards. {n} elements.', { n: sc.els.length })}</p>
          <p className="sr-only">{tl(sc.cats[0]?.name)}</p>
        </div>
      </div>
    </Modal>
  );
}
