/**
 * DESIGN.md §4 timestamps: "Nov 4, 14:05" this year, "Nov 4, 2025, 14:05" otherwise. 24-hour, no seconds.
 */
export const formatFleetTimestamp = (value: Date | string, locale = 'en-US') => {
  const date = typeof value === 'string' ? new Date(value) : value;
  const sameYear = date.getFullYear() === new Date().getFullYear();

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
};
