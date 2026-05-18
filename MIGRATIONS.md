# Poznámky k migracím

## Aktuální databázová verze 3

Aplikace používá IndexedDB databázi `local-flashcards-pwa` přes Dexie. Aktuální databázová verze je `3` a ukládá se také do `appMeta` pod klíčem `schemaVersion`.

Tabulky:

- `decks`: `id, updatedAt`
- `cards`: `id, deckId, dueAt, updatedAt, *tags`
- `media`: `id, cardId`
- `reviewLogs`: `id, cardId, deckId, reviewedAt`
- `appMeta`: `key`
- `backups`: `id, createdAt, reason`

Verze 3 navazuje na předchozí strukturu dat a přidává lokální historii záloh. Kartičky zůstávají kompatibilní se staršími daty: pole jako `starred` je volitelné a starší kartičky bez tohoto pole se berou jako neoznačené.

## Exportní schéma 3

Aktuální exporty mají `schemaVersion = 3`, `schemaName = kartickoid-backup`, `source = kartickoid` a `appVersion` čtenou z `package.json`.

JSON export obsahuje:

- balíčky,
- kartičky,
- média jako Base64 `dataUrl`,
- historii procvičování,
- vybraná nastavení z `appMeta`,
- metadata exportu (`exportId`, `exportedAt`, `mediaStorage`, `mediaIncludesBlobs`).

ZIP export je doporučená forma kompletní zálohy. Obsahuje `backup.json` a související média jako samostatné soubory, takže je vhodnější pro běžnou obnovu celé sady včetně příloh. JSON zůstává dostupný hlavně jako původní/starší a techničtější varianta exportu.

## Lokální historie záloh

Ruční export JSON i ZIP se ukládá do lokální historie záloh v tabulce `backups`. Historie drží posledních 8 záznamů a u každého ukládá:

- název souboru,
- formát (`json` nebo `zip`),
- velikost,
- důvod vytvoření,
- verzi aplikace,
- blob se samotnou zálohou.

Při obnovení dat režimem reset se před přepisem aktuálních dat vytváří bezpečnostní snapshot, pokud není explicitně vypnutý.

## Importní režimy

Importer přijímá JSON zálohy verze 1, 2 i 3 a také ZIP zálohy obsahující `backup.json`.

- Soft import slučuje zálohu s aktuálními daty, hledá shody podle ID i obsahu a snaží se neprodukovat duplicity.
- Hard import přidá obsah zálohy jako další data. Při kolizi ID generuje nová ID a může vytvořit duplicity.
- Reset import nahradí aktuální lokální data obsahem zálohy. Před obnovou se vytváří bezpečnostní snapshot.

Při kolizi ID se vztahy mezi balíčky, kartičkami, médii a logy přemapují na nová ID. Import starších záloh doplňuje chybějící pole bez rozbití existujících dat.

## OneDrive

OneDrive je experimentální doplňková cesta pro uložení ZIP záloh do aplikační složky Kartičkoid v OneDrive. Nepovažuje se za primární migrační mechanismus ani za jedinou spolehlivou kopii dat. Pro běžnou obnovu zůstává doporučený ZIP export stažený mimo prohlížeč.

## Budoucí kompatibilita s Anki

Importéry jsou ve složce `src/services/importers`. Anki ZIP importer je oddělený od CSV, Markdownu a hromadného parseru, aby šlo externí modely mapovat na interní záznamy `Deck`, `Card`, `Media` a `ReviewLog` bez zásahu do hlavního UI.
