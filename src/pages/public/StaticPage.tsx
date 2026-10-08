/* /page/:slug — static pages from iticket.uz (about, rules, privacy, return, eticket, support) and the FAQ accordion. */
import { ChevronDown } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { useItPage } from '../../api/iticket';
import { useI18n } from '../../lib/i18n';
import { Button, Empty, LinkButton } from '../../components/ui';
import { sanitizeHtml } from '../../components/storefront/sanitize';

const PAGES: { slug: string; uz: string; ru: string; en: string }[] = [
  { slug: 'about', uz: 'Biz haqimizda', ru: 'О нас', en: 'About us' },
  { slug: 'faq', uz: 'Koʻp soʻraladigan savollar', ru: 'Частые вопросы', en: 'FAQ' },
  { slug: 'rules', uz: 'Foydalanish shartlari', ru: 'Условия использования', en: 'Terms of use' },
  { slug: 'privacy', uz: 'Maxfiylik siyosati', ru: 'Политика конфиденциальности', en: 'Privacy policy' },
  { slug: 'return', uz: 'Chiptalarni qaytarish', ru: 'Возврат билетов', en: 'Refunds' },
  { slug: 'eticket', uz: 'Elektron chipta', ru: 'Электронный билет', en: 'E-ticket' },
  { slug: 'support', uz: 'Qoʻllab-quvvatlash', ru: 'Служба поддержки', en: 'Support' },
];

export default function StaticPage() {
  const { t3 } = useI18n();
  const { slug } = useParams();
  const q = useItPage(slug);
  const content = q.data?.content;
  // iticket returns some titles in Azerbaijani (shared backend with iticket.az): prefer our own names.
  const known = PAGES.find((p) => p.slug === slug);
  const title = known ? t3(known.uz, known.ru, known.en) : q.data?.title;

  return (
    <div className="mx-auto grid max-w-[1280px] gap-8 px-4 pt-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-5 md:pt-10">
      <nav aria-label={t3('Maʼlumot', 'Информация', 'Information')} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
        {PAGES.map((p) => (
          <Link key={p.slug} to={`/page/${p.slug}`} aria-current={p.slug === slug ? 'page' : undefined} className={'shrink-0 rounded-full px-4 py-2 text-[15px] font-medium whitespace-nowrap lg:rounded-xl ' + (p.slug === slug ? 'bg-brand font-semibold' : 'bg-white hover:bg-black/5 lg:bg-transparent')}>
            {t3(p.uz, p.ru, p.en)}
          </Link>
        ))}
      </nav>
      <article className="min-w-0">
        {q.isLoading ? (
          <div className="animate-pulse">
            <div className="h-9 w-2/3 rounded bg-line" />
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="mt-4 h-4 rounded bg-line" style={{ width: `${90 - i * 7}%` }} />
            ))}
          </div>
        ) : q.isError || !q.data ? (
          <Empty
            title={(q.error as { status?: number } | null)?.status === 404 ? t3('Sahifa topilmadi', 'Страница не найдена', 'Page not found') : t3('Sahifa yuklanmadi', 'Не удалось загрузить страницу', 'Could not load the page')}
            action={
              (q.error as { status?: number } | null)?.status === 404 ? (
                <LinkButton to="/" variant="dark">
                  {t3('Bosh sahifa', 'На главную', 'Home')}
                </LinkButton>
              ) : (
                <Button variant="dark" onClick={() => q.refetch()}>
                  {t3('Qayta urinish', 'Повторить', 'Retry')}
                </Button>
              )
            }
          />
        ) : (
          <>
            <h1 className="text-[28px] leading-tight font-extrabold tracking-tight md:text-[40px]">{title}</h1>
            {Array.isArray(content) ? (
              <div className="mt-6 flex flex-col gap-3">
                {content.map((f, i) => (
                  <details key={i} className="group rounded-2xl bg-white shadow-[var(--shadow-card)] open:pb-1">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 text-[16px] font-semibold md:p-5 [&::-webkit-details-marker]:hidden">
                      <span>{f.question}</span>
                      <ChevronDown className="mt-0.5 size-5 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="prose-it px-4 pb-4 md:px-5" dangerouslySetInnerHTML={{ __html: sanitizeHtml(f.answer) }} />
                  </details>
                ))}
              </div>
            ) : (
              <div className="prose-it mt-6 max-w-3xl" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content || '') }} />
            )}
            <p className="mt-10 text-sm text-ink-3">{t3('Manba: iticket.uz', 'Источник: iticket.uz', 'Source: iticket.uz')}</p>
          </>
        )}
      </article>
    </div>
  );
}
