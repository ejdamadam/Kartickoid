export interface FutureAnkiImportOptions {
  file: File;
  targetDeckId?: string;
}

export async function importAnkiPackagePlaceholder(_options: FutureAnkiImportOptions): Promise<never> {
  throw new Error('Přímý import .apkg zatím není v této verzi implementovaný.');
}
