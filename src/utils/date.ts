export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDateTime(value?: string): string {
  if (!value) return 'Zatím nikdy';

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function formatDate(value?: string): string {
  if (!value) return 'Zatím nikdy';

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium'
  }).format(new Date(value));
}

export function startOfTodayIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
