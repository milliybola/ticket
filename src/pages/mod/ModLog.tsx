/* Action log (db.log): who did what and when, with filters by role and action and a text search. */
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useI18n } from '../../lib/i18n';
import { fmtStamp } from '../../lib/time';
import { uniq } from '../../lib/util';
import { useDb } from '../../store/db';
import { Badge, Button, Card, Empty, Input, PageHeader, Select } from '../../components/ui';
import { actName, roleName } from '../../features/ops/labels';

const PAGE = 100;

export default function ModLog() {
  const { t3, lang } = useI18n();
  const db = useDb();
  const [role, setRole] = useState('');
  const [act, setAct] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const acts = useMemo(() => uniq(db.log.map((l) => l.act)).sort((a, b) => actName(a).localeCompare(actName(b))), [db, db.rev, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.log.filter((l) => (!role || l.who.role === role) && (!act || l.act === act) && (!s || `${l.who.name} ${l.obj} ${l.details} ${actName(l.act)}`.toLowerCase().includes(s)));
  }, [db, db.rev, role, act, q, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t3('Harakatlar jurnali', 'Журнал действий', 'Action log')} sub={t3('Kim, qachon va nima qildi: qarorlar, sotuvlar, kirishlar.', 'Кто, когда и что сделал: решения, продажи, проходы.', 'Who did what and when: decisions, sales, entries.')} />
      <div className="mb-4 grid gap-3 sm:grid-cols-[180px_260px_1fr]">
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label={t3('Rol', 'Роль', 'Role')}>
          <option value="">{t3('Barcha rollar', 'Все роли', 'All roles')}</option>
          {['org', 'mod', 'buyer', 'system'].map((r) => (
            <option key={r} value={r}>
              {roleName(r)}
            </option>
          ))}
        </Select>
        <Select value={act} onChange={(e) => setAct(e.target.value)} aria-label={t3('Harakat', 'Действие', 'Action')}>
          <option value="">{t3('Barcha harakatlar', 'Все действия', 'All actions')}</option>
          {acts.map((a) => (
            <option key={a} value={a}>
              {actName(a)}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t3('Qidirish: ism, obyekt, tafsilot', 'Поиск: имя, объект, детали', 'Search: name, object, details')} />
        </div>
      </div>
      {rows.length ? (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[820px] text-left text-[15px]">
              <thead>
                <tr className="border-b border-line text-sm text-ink-3">
                  {[t3('Vaqt', 'Время', 'Time'), t3('Kim', 'Кто', 'Who'), t3('Harakat', 'Действие', 'Action'), t3('Obyekt', 'Объект', 'Object'), t3('Tafsilotlar', 'Детали', 'Details')].map((h, i) => (
                    <th key={i} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr]:border-line [&_td]:px-4 [&_td]:py-2.5 [&_td]:align-top">
                {rows.slice(0, limit).map((l) => (
                  <tr key={l.id}>
                    <td className="text-sm whitespace-nowrap tabular-nums">{fmtStamp(l.at)}</td>
                    <td className="text-sm">
                      <Badge tone={l.who.role === 'mod' ? 'info' : l.who.role === 'org' ? 'brand' : 'neutral'}>{roleName(l.who.role)}</Badge>
                      <span className="mt-0.5 block">{l.who.name}</span>
                    </td>
                    <td className="font-medium">{actName(l.act)}</td>
                    <td className="text-sm">{l.obj}</td>
                    <td className="text-sm text-ink-2">{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => setLimit((x) => x + PAGE)}>
                {t3('Yana koʻrsatish ({n})', 'Показать ещё ({n})', 'Show more ({n})', { n: rows.length - limit })}
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <Empty title={t3('Yozuvlar topilmadi', 'Записей не найдено', 'No entries found')} />
        </Card>
      )}
    </div>
  );
}
