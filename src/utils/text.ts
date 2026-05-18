export function htmlToPlainText(html: string): string {
  if (!html) return '';
  const element = document.createElement('div');
  element.innerHTML = html;
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeAnswer(value: string): string {
  return htmlToPlainText(value)
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
