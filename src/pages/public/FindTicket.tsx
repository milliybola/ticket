/* Find ticket (US-34): phone + order number; never tells whether the phone has other orders. */
import { FlaskConical, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { normPhone } from '../../lib/format';
import { useDb } from '../../store/db';
import { findOrder } from '../../domain/rules';
import { unlockOrder } from '../../domain/purchase';
import { Button, Field, Input, Notice } from '../../components/ui';
import { PhoneField } from '../../components/purchase/parts';

export default function FindTicket() {
  const { t3 } = useI18n();
  useDb();
  const nav = useNavigate();
  const [iso, setIso] = useState('UZ');
  const [num, setNum] = useState('');
  const [no, setNo] = useState('');
  const [errs, setErrs] = useState<{ phone?: string; order?: string; nf?: string }>({});
  return (
    <div className="mx-auto max-w-md px-4 py-8 md:py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{t3('Chiptani topish', 'Найти билет', 'Find my ticket')}</h1>
      <p className="mt-2 text-ink-3">{t3('Agar email koʻrsatmagan boʻlsangiz yoki faylni yoʻqotgan boʻlsangiz, buyurtmani telefon va buyurtma raqami orqali toping.', 'Если вы не указали email или потеряли файл, найдите заказ по телефону и номеру заказа.', 'If you skipped email or lost the file, find your order by phone number and order number.')}</p>
      <form
        noValidate
        className="mt-6 space-y-4 rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const phone = normPhone(iso, num);
          const order = no.trim().toUpperCase().replace(/\s+/g, '');
          const er: typeof errs = {};
          if (!phone) er.phone = t3('Telefon raqamini tekshiring', 'Проверьте номер телефона', 'Check the phone number');
          if (!order) er.order = t3('Buyurtma raqamini kiriting', 'Укажите номер заказа', 'Enter the order number');
          if (!er.phone && !er.order) {
            const o = findOrder(phone!, order);
            if (o) {
              unlockOrder(o.id);
              nav(`/order/${o.id}`);
              return;
            }
            er.nf = t3('Buyurtma topilmadi', 'Заказ не найден', 'Order not found');
          }
          setErrs(er);
        }}
      >
        <Field label={t3('Telefon', 'Телефон', 'Phone')} required error={errs.phone}>
          <PhoneField iso={iso} num={num} onIso={setIso} onNum={setNum} invalid={!!errs.phone} autoFocus />
        </Field>
        <Field label={t3('Buyurtma raqami', 'Номер заказа', 'Order number')} required error={errs.order} hint={t3('U SMS va muvaffaqiyatli toʻlov sahifasida bor.', 'Он есть в SMS и на странице успешной оплаты.', 'It is in the SMS and on the payment confirmation page.')}>
          <Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="SY-100245" autoCapitalize="characters" autoComplete="off" className="font-mono uppercase" invalid={!!errs.order} />
        </Field>
        {errs.nf && <Notice tone="bad">{errs.nf}</Notice>}
        <Button type="submit" block size="lg">
          <Search className="size-5" />
          {t3('Topish', 'Найти', 'Find')}
        </Button>
        <p className="flex items-start gap-2 text-sm text-ink-3">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          {t3('Buyurtmalar shu brauzerda bir kun saqlanadi.', 'Заказы хранятся в этом браузере один день.', 'Orders are kept in this browser for one day.')}
        </p>
      </form>
    </div>
  );
}
