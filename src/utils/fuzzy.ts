export interface FuzzyResult {
  similarity: number;
  distance: number;
  normalizedExpected: string;
  normalizedActual: string;
  accepted: boolean;
  diff: Array<{ type: 'match' | 'missing' | 'extra'; value: string }>;
}

export function normalizeAnswer(value: string, ignoreDiacritics = true): string {
  const collapsed = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!ignoreDiacritics) return collapsed;
  return collapsed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function compareFuzzy(expected: string, actual: string, strictMode = false): FuzzyResult {
  const normalizedExpected = normalizeAnswer(expected, !strictMode);
  const normalizedActual = normalizeAnswer(actual, !strictMode);
  const distance = levenshtein(normalizedExpected, normalizedActual);
  const longest = Math.max(normalizedExpected.length, normalizedActual.length, 1);
  const similarity = Math.max(0, Math.round((1 - distance / longest) * 100));
  const threshold = strictMode ? 92 : 72;

  return {
    similarity,
    distance,
    normalizedExpected,
    normalizedActual,
    accepted: similarity >= threshold,
    diff: buildWordDiff(normalizedExpected, normalizedActual)
  };
}

export function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function buildWordDiff(expected: string, actual: string): FuzzyResult['diff'] {
  const expectedWords = expected.split(' ').filter(Boolean);
  const actualWords = actual.split(' ').filter(Boolean);
  const length = Math.max(expectedWords.length, actualWords.length);
  const diff: FuzzyResult['diff'] = [];

  for (let i = 0; i < length; i += 1) {
    const expectedWord = expectedWords[i];
    const actualWord = actualWords[i];
    if (expectedWord && actualWord && expectedWord === actualWord) {
      diff.push({ type: 'match', value: actualWord });
    } else {
      if (actualWord) diff.push({ type: 'extra', value: actualWord });
      if (expectedWord) diff.push({ type: 'missing', value: expectedWord });
    }
  }

  return diff;
}
