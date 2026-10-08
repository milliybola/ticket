/* Shows its children once the seating plan of an imported session is loaded from iticket.uz. */
import type { ReactNode } from 'react';
import { t3, useI18n } from '../lib/i18n';
import { useDb } from '../store/db';
import { ensurePlan, useEnsurePlan } from '../sync/iticket';
import { Button, Loading, Notice } from './ui';

export function PlanLoader({ sid, children }: { sid: string | null | undefined; children: ReactNode }) {
  useI18n();
  useDb();
  const { loading, error } = useEnsurePlan(sid);
  if (error)
    return (
      <Notice tone="bad" title={t3('Zal sxemasini yuklab boʻlmadi', 'Не удалось загрузить схему зала', 'Couldn’t load the seating plan')} action={<Button size="sm" variant="outline" onClick={() => ensurePlan(sid).catch(() => undefined)}>{t3('Qayta urinish', 'Повторить', 'Try again')}</Button>}>
        {error}
      </Notice>
    );
  if (loading) return <Loading label={t3('Zal sxemasi va boʻsh joylar iticket.uz dan yuklanmoqda…', 'Загружаем схему зала и свободные места с iticket.uz…', 'Loading the plan and free seats from iticket.uz…')} />;
  return <>{children}</>;
}
