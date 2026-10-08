/* Step 5: sessions by kind — dates, a weekly schedule, cinema showtimes or museum hours. */
import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useDb } from '../../store/db';
import { byId } from '../../lib/util';
import type { EventItem } from '../../domain/types';
import { Button, Empty, LinkButton } from '../../components/ui';
import { ConcertSessions } from './SessionsConcert';
import { TheatreSessions } from './SessionsTheatre';
import { CinemaSessions } from './SessionsCinema';
import { MuseumSessions } from './SessionsMuseum';

export function SessionsStep({ ev, ro, onNext }: { ev: EventItem; ro: boolean; onNext: () => void }) {
  const { t3 } = useI18n();
  const db = useDb();
  const venue = byId(db.venues, ev.venueId);
  if (!venue || (ev.kind !== 'museum' && !venue.halls.length))
    return (
      <Empty
        title={t3('Avval maydonni tanlang', 'Сначала выберите площадку', 'Choose a venue first')}
        action={
          <LinkButton to={`/org/events/${ev.id}/kind`} variant="outline">
            {t3('Maydonga', 'К площадке', 'Go to the venue')}
          </LinkButton>
        }
      />
    );
  const body =
    ev.kind === 'museum' ? (
      ev.museum ? (
        <MuseumSessions ev={ev} ro={ro} />
      ) : null
    ) : ev.kind === 'cinema' ? (
      <CinemaSessions ev={ev} ro={ro} />
    ) : ev.kind === 'theatre' ? (
      <TheatreSessions ev={ev} ro={ro} />
    ) : (
      <ConcertSessions ev={ev} ro={ro} />
    );
  return (
    <div className="space-y-6">
      {body}
      <div className="flex justify-end">
        <Button onClick={onNext}>
          {t3('Davom etish', 'Далее', 'Continue')}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
