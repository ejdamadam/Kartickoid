# Kartičkoid

Offline-first PWA aplikace pro procvičování studijních kartiček. Běží čistě v prohlížeči, bez backendu, přihlašování a cloudové synchronizace. Data zůstávají na zařízení v IndexedDB.

## Funkce

- čistá mobilní hlavní obrazovka se seznamem balíčků, rychlým pokračováním a vyhledáváním
- hamburger menu pro import, export, statistiky, nastavení a nápovědu
- balíčky kartiček s vytvořením, úpravou, duplikací a smazáním
- kartičky s textem, chip tagy a více obrázky na přední nebo zadní straně
- image-only kartičky: text otázky ani odpovědi není povinný, pokud karta obsahuje obrázek
- obrázky přímo při vytváření kartičky, drag & drop, náhled, odebrání, přeřazení a zvětšený náhled
- režim Učení: klepnutím otočíš kartu, tažením doprava = Dobré, doleva = Znovu, nahoru = Snadné, dolů = Těžké
- režim Test: výběr odpovědi z možností s okamžitou zpětnou vazbou
- režim Psaní: fuzzy porovnání odpovědi, přísný/tolerantní režim a zvýraznění rozdílů
- vlastní studijní session, náhodný režim a opakování obtížných kartiček i po dokončení dne
- jednoduché statistiky: dnes procvičeno, série, úspěšnost, týdenní aktivita, nejtěžší kartičky
- JSON export/import celé lokální databáze včetně médií
- JSON export konkrétního balíčku a CSV export balíčku
- CSV import s náhledem a mapováním sloupců
- Markdown import a hromadný editor `Otázka :: Odpověď :: tagy`
- PWA manifest, Apple touch ikony, service worker a banner pro aktualizaci

## Lokální spuštění

```bash
npm install
npm run dev
```

Vývojová verze poběží typicky na `http://localhost:5173`.

## Produkční build

```bash
npm run build
npm run preview
```

Pro ověření PWA chování používejte produkční build přes `npm run preview`, protože service worker se generuje při buildu.

## Nasazení

### Vercel

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

### Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Node version: aktuální LTS nebo novější

### GitHub Pages

1. Spusťte `npm run build`.
2. Publikujte obsah složky `dist`.
3. Pokud aplikace neběží z kořene domény, nastavte ve `vite.config.ts` vlastnost `base` na cestu repozitáře, například `base: '/nazev-repa/'`.

## Jak testovat na iPhone

1. Spusťte `npm run build`.
2. Nasaďte složku `dist` na Vercel, Netlify nebo Cloudflare Pages.
3. Otevřete nasazenou URL v Safari na iPhonu.
4. Klepněte na sdílecí tlačítko.
5. Vyberte `Přidat na plochu`.
6. Spusťte Kartičkoid ikonou z plochy jako samostatnou PWA aplikaci.

Po prvním úspěšném načtení základní aplikace funguje offline. Data jsou uložená v Safari IndexedDB pro danou doménu.

## Řešení potíží na iOS PWA

- Pokud se aplikace neinstaluje, ověřte, že běží přes HTTPS a má dostupný `manifest.webmanifest`.
- Pokud se změny neprojeví, otevřete aplikaci v Safari, počkejte na aktualizační banner, případně odstraňte aplikaci z plochy a přidejte ji znovu.
- Pokud zmizí lokální data, pravděpodobně je Safari odstranilo kvůli místu nebo dlouhé neaktivitě. Pro důležitá data používejte JSON export zálohy.
- Kamera a galerie závisí na oprávněních Safari a konkrétní verzi iOS.

## Známá omezení Safari PWA

- iOS může při nedostatku místa odstranit IndexedDB data.
- Periodické úlohy na pozadí a spolehlivá synchronizace nejsou pro tento typ aplikace dostupné.
- Service worker se aktualizuje podle pravidel Safari, ne vždy okamžitě.
- PWA je potřeba přidat na plochu ze Safari, jiné iOS prohlížeče používají stejný WebKit základ.

## Export a import zálohy

Aktuální JSON formát:

```json
{
  "version": 2,
  "schemaName": "kartickoid-backup",
  "source": "kartickoid",
  "exportedAt": "...",
  "decks": [],
  "cards": [],
  "media": [],
  "reviewLogs": [],
  "appMeta": []
}
```

Obrázky se exportují jako base64 data URL. Import přijme verzi 1 i 2, přidává data do existující databáze a při kolizi ID automaticky přemapuje vztahy.

## CSV

CSV průvodce podporuje:

```csv
front,back,tags,image
"Co je ATP?","Energetická měna buňky.","biologie,biochemie","mitochondrie.png"
```

Pole `image` je připravené pro kompatibilitu s externími nástroji. Přímé připojení souborů podle názvu je oddělené pro další rozšíření.

## Markdown

```md
# Balíček: Biologie

## Karta
Přední:
Co je ATP?

Zadní:
Energetická měna buňky.

Tagy:
biologie,biochemie

Obrázek:
mitochondrie.png
```

## Hromadný editor

```txt
ATP :: Energetická měna buňky :: biologie,buňka
Mitochondrie :: Elektrárna buňky :: biologie
```

Editor ukáže živý náhled, validaci a vytvoří více kartiček najednou.

## Ukázková data

Ukázkový balíček je v `public/seed/biology-sample.json`. Importujte ho přes `Import -> JSON`.

## Migrace

Poznámky k databázovým migracím jsou v `MIGRATIONS.md`.

## Soukromí

Aplikace nepoužívá žádné vzdálené API. Kartičky, obrázky i logy zůstávají lokálně v prohlížeči na zařízení.
