import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { fr } from 'date-fns/locale';

/**
 * Fuseau de référence de PORTEO GROUP.
 * Abidjan est en UTC+0 toute l'année (pas d'heure d'été), mais on passe
 * explicitement par date-fns-tz pour rester correct si l'application est
 * exécutée sur un serveur configuré dans un autre fuseau (Vercel = UTC).
 */
export const TIMEZONE = 'Africa/Abidjan';

/** Convertit une saisie locale (« 2026-08-19T13:00 ») en instant UTC. */
export function zonedToUtc(localIsoString: string): Date {
  return fromZonedTime(localIsoString, TIMEZONE);
}

/** Convertit un instant UTC en Date « murale » dans le fuseau d'Abidjan. */
export function utcToZoned(date: Date): Date {
  return toZonedTime(date, TIMEZONE);
}

/** `19/08/2026` */
export function formatDate(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'dd/MM/yyyy', { locale: fr });
}

/** `19/08/2026 à 13h00` */
export function formatDateTime(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "dd/MM/yyyy 'à' HH'h'mm", { locale: fr });
}

/** `13h00` */
export function formatTime(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "HH'h'mm", { locale: fr });
}

/** `19/08` — utilisé dans les objets d'e-mail. */
export function formatDayMonth(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, 'dd/MM', { locale: fr });
}

/** `mardi 19 août 2026 à 13h00` — libellés longs des e-mails. */
export function formatLong(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "EEEE d MMMM yyyy 'à' HH'h'mm", { locale: fr });
}

/** Valeur pour un `<input type="datetime-local">`, exprimée en heure d'Abidjan. */
export function toDatetimeLocalValue(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}
