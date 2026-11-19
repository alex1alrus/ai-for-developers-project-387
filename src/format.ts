/** Date and time formats of the UI, in the browser's time zone. */
export const time = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' })
/** «18 ноября» */
export const dayMonth = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' })
/** «ср, 18 нояб.» */
export const weekdayDay = new Intl.DateTimeFormat('ru', { weekday: 'short', day: 'numeric', month: 'short' })
/** «Europe/Moscow, GMT+3»: the browser's time zone and its offset at `date`. */
export function timeZoneLabel(date: Date) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = new Intl.DateTimeFormat('ru', { timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value
  return offset ? `${zone}, ${offset}` : zone
}
