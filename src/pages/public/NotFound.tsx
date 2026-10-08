/* Friendly 404 of the storefront. */
import { Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { LinkButton } from '../../components/ui';

export default function NotFound() {
  const { t3 } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center md:py-24">
      <div className="grid size-28 place-items-center rounded-full bg-brand text-5xl font-extrabold">404</div>
      <h1 className="mt-6 text-2xl font-extrabold md:text-3xl">{t3('Sahifa topilmadi', 'Страница не найдена', 'Page not found')}</h1>
      <p className="mt-2 text-ink-3">
        {t3('Havola eskirgan yoki notoʻgʻri yozilgan boʻlishi mumkin. Tadbirni qidirib koʻring:', 'Ссылка могла устареть или содержать ошибку. Попробуйте найти событие:', 'The link may be outdated or mistyped. Try searching for the event:')}
      </p>
      <form
        role="search"
        className="mt-6 flex h-12 w-full items-center gap-2 rounded-2xl bg-white px-4 shadow-[var(--shadow-card)] focus-within:ring-2 focus-within:ring-ink"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="size-5 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent outline-none" placeholder={t3('Tadbir yoki joy', 'Событие или площадка', 'Event or venue')} aria-label={t3('Qidiruv', 'Поиск', 'Search')} />
      </form>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <LinkButton to="/">{t3('Bosh sahifa', 'На главную', 'Home')}</LinkButton>
        <LinkButton to="/events" variant="outline">
          {t3('Barcha tadbirlar', 'Все события', 'All events')}
        </LinkButton>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-ink-2">
        <Link to="/venues" className="hover:underline">
          {t3('Joylar', 'Площадки', 'Venues')}
        </Link>
        <Link to="/find-ticket" className="hover:underline">
          {t3('Chiptani topish', 'Найти билет', 'Find ticket')}
        </Link>
        <Link to="/page/faq" className="hover:underline">
          {t3('Savollar', 'Вопросы', 'FAQ')}
        </Link>
        <Link to="/organizers" className="hover:underline">
          {t3('Tashkilotchilarga', 'Организаторам', 'For organizers')}
        </Link>
      </div>
    </div>
  );
}
