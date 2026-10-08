/* Human-readable names of journal actions (db.log) and roles. */
import { tl, tx3, type L10n } from '../../lib/i18n';

export const ACTS: Record<string, L10n> = {
  'org-register': tx3('Tashkilotchi roʻyxatdan oʻtdi', 'Регистрация организатора', 'Organizer signed up'),
  'org-resubmit': tx3('Anketa qayta yuborildi', 'Анкета отправлена повторно', 'Application resubmitted'),
  'org-approve': tx3('Tashkilotchi tasdiqlandi', 'Организатор одобрен', 'Organizer approved'),
  'org-return': tx3('Anketa qaytarildi', 'Анкета возвращена', 'Application returned'),
  'password-change': tx3('Parol oʻzgartirildi', 'Смена пароля', 'Password changed'),
  'event-create': tx3('Tadbir yaratildi', 'Мероприятие создано', 'Event created'),
  'event-submit': tx3('Tadbir moderatsiyaga yuborildi', 'Мероприятие на модерацию', 'Event sent for moderation'),
  'event-withdraw': tx3('Ariza qaytarib olindi', 'Заявка отозвана', 'Submission withdrawn'),
  'event-approve': tx3('Tadbir eʼlon qilindi', 'Мероприятие одобрено', 'Event approved'),
  'event-return': tx3('Tadbir qaytarildi', 'Мероприятие возвращено', 'Event returned'),
  'event-edit': tx3('Tadbir oʻzgartirildi', 'Мероприятие изменено', 'Event edited'),
  'venue-change': tx3('Maydonni almashtirish soʻraldi', 'Запрошена смена площадки', 'Venue change requested'),
  'venue-change-approve': tx3('Maydon almashtirish tasdiqlandi', 'Смена площадки одобрена', 'Venue change approved'),
  'venue-change-return': tx3('Maydon almashtirish rad etildi', 'Смена площадки отклонена', 'Venue change declined'),
  'venue-create': tx3('Maydon yaratildi', 'Площадка создана', 'Venue created'),
  'venue-edit': tx3('Maydon oʻzgartirildi', 'Площадка изменена', 'Venue edited'),
  'venue-request': tx3('Maydon soʻrovi', 'Запрос площадки', 'Venue request'),
  'venue-request-take': tx3('Soʻrov ishga olindi', 'Запрос взят в работу', 'Request taken'),
  'venue-request-decline': tx3('Maydon soʻrovi rad etildi', 'Запрос площадки отклонён', 'Venue request declined'),
  'hall-create': tx3('Zal yaratildi', 'Зал создан', 'Hall created'),
  'hall-delete': tx3('Zal oʻchirildi', 'Зал удалён', 'Hall deleted'),
  'scheme-save': tx3('Sxema saqlandi', 'Схема сохранена', 'Plan saved'),
  'table-change': tx3('Stol oʻzgartirildi', 'Изменение стола', 'Table changed'),
  'session-add': tx3('Seans qoʻshildi', 'Сеанс добавлен', 'Session added'),
  'session-delete': tx3('Seans oʻchirildi', 'Сеанс удалён', 'Session deleted'),
  'price-change': tx3('Narx oʻzgardi', 'Изменение цены', 'Price changed'),
  postpone: tx3('Konsert koʻchirildi', 'Перенос концерта', 'Concert postponed'),
  hold: tx3('Joylar band qilindi', 'Бронь мест', 'Places held'),
  'sale-online': tx3('Onlayn sotuv', 'Продажа онлайн', 'Online sale'),
  'sale-box': tx3('Kassada sotuv', 'Продажа в кассе', 'Box office sale'),
  'pay-conflict': tx3('Toʻlov kech keldi', 'Оплата после брони', 'Late payment'),
  print: tx3('Chipta chop etildi', 'Печать билета', 'Ticket printed'),
  reprint: tx3('Qayta chop etish', 'Повторная печать', 'Reprint'),
  'entry-pass': tx3('Kirish: oʻtkazildi', 'Вход: пропущен', 'Entry: let in'),
  'entry-deny': tx3('Kirish: rad etildi', 'Вход: отказ', 'Entry: denied'),
  'demo-clock': tx3('Demo: vaqt surildi', 'Демо: сдвиг времени', 'Demo: time travel'),
  'demo-reset': tx3('Demo: maʼlumotlar tiklandi', 'Демо: сброс данных', 'Demo: data reset'),
  'demo-flag': tx3('Demo: sozlama', 'Демо: настройка', 'Demo: setting'),
};
export const actName = (a: string) => (ACTS[a] ? tl(ACTS[a]) : a);

export const ROLES: Record<string, L10n> = {
  org: tx3('Tashkilotchi', 'Организатор', 'Organizer'),
  mod: tx3('Moderator', 'Модератор', 'Moderator'),
  buyer: tx3('Xaridor', 'Покупатель', 'Buyer'),
  system: tx3('Tizim', 'Система', 'System'),
};
export const roleName = (r: string) => tl(ROLES[r] || r);
