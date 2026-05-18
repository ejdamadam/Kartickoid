# Kartičkoid

Kartičkoid je offline-first PWA aplikace pro tvorbu, správu a procvičování studijních kartiček. Běží v prohlížeči bez backendu a bez přihlášení. Data se ukládají lokálně do IndexedDB v daném prohlížeči, proto je důležité pravidelně používat export zálohy.

## Hlavní funkce

- balíčky kartiček s vytvořením, úpravou, duplikací a mazáním
- kartičky s přední a zadní stranou, tagy, rich-text editorem a médii
- procvičování swipem: doleva Znovu, doprava Dobré, nahoru Snadné, dolů Těžké
- 3D flip kartičky v režimu procvičování
- hvězdičky pro důležité kartičky a filtr všechny / označené / neoznačené
- návrat na předchozí kartičku během učení
- Match mód pro párování pojmů a odpovědí
- samostatný Test mód s nastavením počtu otázek, směru dotazování, výsledků a hvězdičkových kartiček
- Study game Rychlá odpověď se skóre a závěrečným vyhodnocením
- hromadné přidání kartiček v jednom modalu:
  - vizuální editor více kartiček
  - raw text vstup ve formátu `pojem: vysvětlení`
  - kompatibilní starší zápis `otázka :: odpověď :: tagy`
- ZIP export/import jako doporučená varianta kompletní zálohy včetně souvisejících dat a příloh
- JSON export/import jako původní/starší technická varianta
- CSV a Markdown import
- Anki ZIP import
- dark mode s lokálně uloženou preferencí
- experimentální OneDrive zálohování
- PWA manifest, service worker a offline provoz po prvním načtení

## Instalace

```bash
npm install
```

## Vývojové spuštění

```bash
npm run dev
```

Vývojová verze běží typicky na `http://localhost:5173/Kartickoid/`. Pokud je port obsazený, Vite automaticky použije další volný port.

## Build

```bash
npm run build
```

Build spouští TypeScript kontrolu (`tsc`) a produkční Vite build do složky `dist`.

Pro lokální kontrolu produkčního buildu:

```bash
npm run preview
```

## Lint a testy

V projektu aktuálně nejsou definované samostatné npm skripty pro lint ani testy. Dostupná kontrola je:

```bash
npm run build
```

## Verzování

Verze aplikace je čtená z `package.json`. Vite ji při buildu předává do aplikace přes `__APP_VERSION__` a UI ji zobrazuje v menu / nastavení.

Patch verzi navýšíte příkazem:

```bash
npm run version:patch
```

Skript aktualizuje `package.json` i `package-lock.json`, takže číslo verze zůstává v jednom zdroji pravdy pro aplikaci i balíčkovací metadata.

## Deploy

Projekt je nastavený pro GitHub Pages:

- `homepage` v `package.json`: `https://ejdamadam.github.io/Kartickoid/`
- `vite.config.ts`: `base: '/Kartickoid/'`
- deploy script: `npm run deploy`

Deploy probíhá přes balíček `gh-pages`:

```bash
npm run deploy
```

Skript nejdřív spustí `predeploy`, tedy `npm run build`, a potom publikuje složku `dist` na GitHub Pages.

## Export a import zálohy

### Doporučené: ZIP

ZIP je hlavní doporučená varianta pro běžné zálohování a obnovu. Je vhodnější pro kompletní zálohu celé sady, protože drží databázový `backup.json`, související data a případné přílohy v jednom archivu.

ZIP používejte hlavně:

- před větším importem nebo úpravami
- před mazáním balíčků
- při přesunu na nové zařízení
- jako pravidelnou bezpečnostní zálohu

### Původní/starší: JSON

JSON export je původní/starší forma exportu v jednom souboru. Zůstává dostupná jako jednodušší nebo pokročilejší technická varianta, ale pro kompletní běžnou zálohu je vhodnější ZIP.

## Raw import kartiček

Nejjednodušší zápis:

```txt
ATP: Energetická měna buňky
Mitochondrie: Elektrárna buňky
Osmóza: Pohyb vody přes polopropustnou membránu
```

Starší zápis s tagy je stále podporovaný:

```txt
ATP :: Energetická měna buňky :: biologie,buňka
Mitochondrie :: Elektrárna buňky :: biologie
```

Každá dvojice patří na samostatný řádek.

## Soukromí a lokální data

Aplikace nepoužívá vlastní vzdálené API. Kartičky, obrázky, zvuky, nastavení i historie procvičování zůstávají lokálně v prohlížeči. Pro důležitá data používejte ZIP export, protože prohlížeče mohou lokální úložiště při nedostatku místa nebo dlouhé neaktivitě vyčistit.

## iOS PWA poznámky

- Instalace na plochu funguje přes Safari a sdílecí volbu Přidat na plochu.
- PWA a service worker vyžadují HTTPS na produkční doméně.
- Pokud se změny po deployi neprojeví, otevřete aplikaci v Safari a počkejte na aktualizaci service workeru, případně aplikaci z plochy odeberte a přidejte znovu.
- IndexedDB data jsou vázaná na konkrétní doménu a prohlížeč.

## Ukázková data a migrace

Ukázkový balíček je v `public/seed/biology-sample.json`. Poznámky k databázovým migracím jsou v `MIGRATIONS.md`.
