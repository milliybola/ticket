/* Landing page for organizers: what Sayohat gives them and the way in (registration, sign-in). */
import { ArrowRight, Building2, Globe2, LayoutGrid, QrCode, ScanLine, ShieldCheck, Store, Ticket } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { LinkButton } from '../../components/ui';

export default function OrganizerLanding() {
  const { t3 } = useI18n();
  const features: { icon: LucideIcon; title: string; text: string }[] = [
    {
      icon: LayoutGrid,
      title: t3('Maydonlar va zal sxemalari', 'Площадки и схемы залов', 'Venues and seating plans'),
      text: t3('SVG-sxemani yuklang — sektorlar avtomatik aniqlanadi — yoki qator va joylarni qoʻlda kiriting. Fan-zonalar, stollar, launjlar; muzeylar uchun vaqt boʻyicha kirish.', 'Загрузите SVG-схему — секторы распознаются сами — или задайте ряды и места вручную. Фан-зоны, столы, лаунжи; для музеев — вход по времени.', 'Upload an SVG plan and sectors are recognized automatically, or set rows and seats by hand. Fan zones, tables, lounges; timed entry for museums.'),
    },
    {
      icon: Store,
      title: t3('Onlayn va kassa — bitta qoldiq', 'Онлайн и касса — один остаток', 'Online and box office: one stock'),
      text: t3('Kassada tanlangan joy saytda darhol band boʻladi va aksincha. Bir joy hech qachon ikki marta sotilmaydi. Kassa naqd pul va QR toʻlovni qabul qiladi, chipta va chekni chop etadi.', 'Место, выбранное в кассе, сразу занято на сайте, и наоборот. Одно место никогда не продаётся дважды. Касса принимает наличные и оплату по QR, печатает билет и чек.', 'A seat picked at the box office is taken online at once, and the other way round: nothing is sold twice. The box office takes cash and QR payments and prints tickets and receipts.'),
    },
    {
      icon: ScanLine,
      title: t3('Kirishda QR tekshiruvi', 'Проверка QR на входе', 'QR check at the entrance'),
      text: t3('Telefon kamerasi bilan bir soniyadan kam vaqtda tekshirish. Imtiyozli chiptalar uchun talab koʻrsatiladi, takroriy kirish aniqlanadi.', 'Проверка камерой телефона меньше чем за секунду. Для льготных билетов показывается требование, повторный проход распознаётся.', 'Check with a phone camera in under a second. Concession requirements are shown and repeat entries are caught.'),
    },
    {
      icon: ShieldCheck,
      title: t3('Moderatsiya', 'Модерация', 'Moderation'),
      text: t3('Sayohat moderatori tashkilotchi anketasini va yangi tadbirni eʼlondan oldin tekshiradi. Yangi seanslar, narxlar va konsertni koʻchirish — darhol.', 'Модератор Sayohat проверяет анкету организатора и новое мероприятие до публикации. Новые сеансы, цены и перенос концерта — сразу.', 'A Sayohat moderator checks your organization and each new event before it goes live. New sessions, prices and concert date changes go live right away.'),
    },
    {
      icon: Globe2,
      title: t3('Sayyohlar uchun', 'Для туристов', 'Made for tourists'),
      text: t3('Uch tilda xarid: oʻzbek, rus, ingliz. Visa va Mastercard, narx soʻmda va dollarda moʻljal sifatida. Muzeylarda fuqarolar narxi pasport tekshiruvi bilan.', 'Покупка на трёх языках: узбекском, русском, английском. Visa и Mastercard, цена в сумах и ориентир в долларах. В музеях цена для граждан — с проверкой паспорта.', 'Buying in Uzbek, Russian and English. Visa and Mastercard, prices in soʻm with a dollar hint. Citizen rates in museums are passport-checked.'),
    },
    {
      icon: Ticket,
      title: t3('Har qanday tadbir', 'Любые мероприятия', 'Any kind of event'),
      text: t3('Konsertlar va sport — sektor va stol narxlari; teatr — haftalik jadval; kino — zallar boʻyicha seanslar; muzey — soatlik slotlar va chipta turlari.', 'Концерты и спорт — цены секторов и столов; театр — недельное расписание; кино — сеансы по залам; музей — часовые слоты и типы билетов.', 'Concerts and sport with sector and table prices; theatre with a weekly schedule; cinema with showtimes per hall; museums with hourly slots and ticket types.'),
    },
  ];
  const steps = [
    [t3('Roʻyxatdan oʻting', 'Зарегистрируйтесь', 'Sign up'), t3('Tashkilot anketasini toʻldiring — moderator uni tekshiradi.', 'Заполните анкету организации — модератор её проверит.', 'Fill in your organization’s details; a moderator checks them.')],
    [t3('Maydonni qoʻshing', 'Добавьте площадку', 'Add your venue'), t3('Zallar va sxemalar yoki muzeyning ish grafigi.', 'Залы и схемы или график работы музея.', 'Halls and seating plans, or museum opening hours.')],
    [t3('Tadbir yarating', 'Создайте мероприятие', 'Create an event'), t3('Kartochka, seanslar, narxlar — va moderatsiyaga yuboring.', 'Карточка, сеансы, цены — и отправьте на модерацию.', 'Card, sessions, prices, then send it for moderation.')],
    [t3('Soting va kiriting', 'Продавайте и пускайте', 'Sell and let people in'), t3('Sayt, kassa va kirish nazorati bitta kabinetda.', 'Сайт, касса и проверка на входе в одном кабинете.', 'Website, box office and entry check in one workspace.')],
  ];
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 md:py-14 lg:px-5">
      <section className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-10 text-white md:px-12 md:py-16">
        <div className="absolute -top-24 -right-24 size-72 rounded-full bg-brand opacity-90 blur-0 md:size-96" aria-hidden />
        <QrCode className="absolute right-8 bottom-8 hidden size-40 text-white/10 md:block" aria-hidden />
        <div className="relative max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-brand uppercase">{t3('Muzeylar, teatrlar, kinoteatrlar va konsertlar uchun', 'Для музеев, театров, кинотеатров и концертов', 'For museums, theatres, cinemas and concerts')}</p>
          <h1 className="mt-3 text-3xl leading-tight font-extrabold tracking-tight md:text-5xl" style={{ textWrap: 'balance' }}>
            {t3('Onlayn va kassa sotuvlari uchun yagona joy', 'Одно место для онлайн- и кассовых продаж', 'One place for online and box-office sales')}
          </h1>
          <p className="mt-4 text-lg text-white/80">
            {t3('Sayyohlar oʻz tilida va xorijiy karta bilan xarid qiladi, kassa va sayt bitta joy qoldigʻini koʻradi, hisobotlar har bir seans boʻyicha sotuvni koʻrsatadi.', 'Туристы покупают на своём языке и иностранной картой, касса и сайт видят один остаток мест, а отчёты показывают продажи по каждому сеансу.', 'Tourists buy in their own language with foreign cards, your box office and website share one seat stock, and reports show sales for every session.')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <LinkButton to="/org/register" size="lg">
              {t3('Tashkilotchi boʻlish', 'Стать организатором', 'Become an organizer')}
              <ArrowRight className="size-5" />
            </LinkButton>
            <LinkButton to="/org/login" size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:border-white">
              {t3('Kabinetga kirish', 'Войти в кабинет', 'Sign in to your account')}
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t3('Nima olasiz', 'Что вы получаете', 'What you get')}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
              <div className="grid size-12 place-items-center rounded-2xl bg-brand">
                <f.icon className="size-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-ink-2">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{t3('Bu qanday ishlaydi', 'Как это работает', 'How it works')}</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([h, p], i) => (
            <li key={h} className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)]">
              <span className="grid size-9 place-items-center rounded-full bg-ink font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 font-bold">{h}</h3>
              <p className="mt-1 text-ink-2">{p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-brand p-6 md:flex-row md:items-center md:justify-between md:p-8">
        <div className="flex items-start gap-3">
          <Building2 className="mt-1 size-7 shrink-0" />
          <div>
            <h2 className="text-xl font-extrabold">{t3('Sxemangiz murakkabmi?', 'Сложная схема зала?', 'A complicated hall?')}</h2>
            <p className="mt-1 text-ink-2">{t3('Faylni yuboring — Sayohat jamoasi maydonni siz uchun sozlaydi.', 'Пришлите файл — команда Sayohat настроит площадку за вас.', 'Send us the file and the Sayohat team will set up the venue for you.')}</p>
          </div>
        </div>
        <LinkButton to="/org/register" variant="dark" size="lg">
          {t3('Boshlash', 'Начать', 'Get started')}
        </LinkButton>
      </section>
    </div>
  );
}
