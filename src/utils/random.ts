export function shuffle<T>(items: T[] | readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function takeRandom<T>(items: T[] | readonly T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}
