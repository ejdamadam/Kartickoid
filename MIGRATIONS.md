# Poznámky k migracím

## Databázová verze 2

Verze 2 zachovává stejné IndexedDB tabulky a indexy jako verze 1, ale přidává explicitní metadata schématu do `appMeta` a exporty ve formátu JSON verze 2.

Tabulky:

- `decks`: `id, updatedAt`
- `cards`: `id, deckId, dueAt, updatedAt, *tags`
- `media`: `id, cardId`
- `reviewLogs`: `id, cardId, deckId, reviewedAt`
- `appMeta`: `key`

Upgrade zapisuje `schemaVersion = 2` do `appMeta`.

## Kompatibilita záloh

Importer přijímá JSON zálohy verze 1 i 2. Verze 2 přidává `schemaName`, `source` a volitelné `appMeta`.

Při kolizi ID se import chová aditivně: kolidující ID se vygenerují znovu a vztahy mezi balíčky, kartičkami, médii a logy se přemapují.

## Budoucí kompatibilita s Anki

Importéry jsou ve složce `src/services/importers`. Placeholder pro `.apkg` zůstává oddělený od CSV, Markdownu a hromadného parseru, aby budoucí parser mohl namapovat externí modely na interní záznamy `Deck`, `Card`, `Media` a `ReviewLog` bez zásahu do UI.
