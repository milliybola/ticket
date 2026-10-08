/* Sent notifications (db.outbox): every SMS and email the platform would send, in the recipient's language. */
import { Mail, MessageSquare, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LANG_SHORT, useI18n } from '../../lib/i18n';
import { fmtPhone } from '../../lib/format';
import { fmtStamp } from '../../lib/time';
import { useDb } from '../../store/db';
import { Badge, Button, Card, Empty, Input, PageHeader, Segmented } from '../../components/ui';

const PAGE = 60;

export default function ModOutbox() {
  const { t3, lang } = useI18n();
  const db = useDb();
  const [ch, setCh] = useState<'' | 'sms' | 'email'>('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.outbox.filter((m) => (!ch || m.ch === ch) && (!s || `${m.to} ${m.subject} ${m.body}`.toLowerCase().includes(s)));
  }, [db, db.rev, ch, q, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t3('Yuborilgan xabarlar', 'Отправленные уведомления', 'Sent notifications')} sub={t3('Bu buildda shlyuz yoʻq: SMS va xatlar shu yerda saqlanadi.', 'В этой сборке нет шлюза: SMS и письма сохраняются здесь.', 'No gateway in this build: SMS and emails are kept here.')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={ch}
          onChange={setCh}
          options={[
            { value: '', label: `${t3('Hammasi', 'Все', 'All')} · ${db.outbox.length}` },
            { value: 'sms', label: `SMS · ${db.outbox.filter((m) => m.ch === 'sms').length}` },
            { value: 'email', label: `Email · ${db.outbox.filter((m) => m.ch === 'email').length}` },
          ]}
        />
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t3('Qabul qiluvchi yoki matn', 'Получатель или текст', 'Recipient or text')} />
        </div>
      </div>
      {rows.length ? (
        <div className="space-y-3">
          {rows.slice(0, limit).map((m) => (
            <Card key={m.id} className="!p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {m.ch === 'sms' ? <MessageSquare className="size-4 text-ink-3" /> : <Mail className="size-4 text-ink-3" />}
                <b>{m.ch === 'sms' ? fmtPhone(m.to) || m.to : m.to}</b>
                <Badge>{m.ch.toUpperCase()}</Badge>
                <Badge tone="info">{LANG_SHORT[m.lang] || m.lang}</Badge>
                {m.tag && <Badge>{m.tag}</Badge>}
                {m.failed && <Badge tone="bad">{t3('Yetkazilmadi', 'Не доставлено', 'Not delivered')}</Badge>}
                <span className="ml-auto text-ink-3 tabular-nums">{fmtStamp(m.at)}</span>
              </div>
              {m.subject && <div className="mt-2 font-semibold">{m.subject}</div>}
              <div className="mt-1 text-[15px] whitespace-pre-line text-ink-2">{m.body}</div>
            </Card>
          ))}
          {rows.length > limit && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setLimit((x) => x + PAGE)}>
                {t3('Yana koʻrsatish ({n})', 'Показать ещё ({n})', 'Show more ({n})', { n: rows.length - limit })}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <Empty title={t3('Xabarlar yoʻq', 'Сообщений нет', 'No messages')} />
        </Card>
      )}
    </div>
  );
}
