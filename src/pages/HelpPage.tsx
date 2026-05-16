export default function HelpPage() {
  return (
    <section className="page help-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dokumentace</p>
          <h1>Uživatelská příručka</h1>
          <p className="lead">Praktický průvodce pro první spuštění, každodenní procvičování, importy, zálohy a správu dat v aplikaci Kartičkoid.</p>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <h2>Jak začít</h2>
          <ol>
            <li><strong>Vytvořte první balíček:</strong> Na úvodní stránce klikněte na Nový balíček, pojmenujte ho podle předmětu nebo tématu a případně přidejte krátký popis.</li>
            <li><strong>Přidejte několik kartiček:</strong> Otevřete balíček, zvolte Nová kartička a vyplňte přední i zadní stranu. Začněte klidně s 10-20 kartami, ať si ověříte styl otázek.</li>
            <li><strong>Používejte tagy:</strong> Tagy se hodí pro kapitoly, zkouškové okruhy nebo obtížnost. Později podle nich snadno vyberete vlastní procvičování napříč více balíčky.</li>
            <li><strong>Procvičujte krátce a často:</strong> Lepší je několik minut každý den než dlouhé dohánění jednou týdně. Kartičkoid sám ukazuje, co je k opakování dnes.</li>
            <li><strong>Po první větší úpravě udělejte zálohu:</strong> V Nastavení exportujte JSON zálohu. Je to nejjistější způsob, jak přenést nebo obnovit všechna data včetně médií.</li>
          </ol>
        </section>

        <section className="panel">
          <h2>Doporučený postup pro nové uživatele</h2>
          <ul>
            <li><strong>Pište atomické otázky:</strong> Jedna kartička má zkoušet jednu věc. Místo dlouhé otázky s pěti fakty vytvořte pět kratších karet.</li>
            <li><strong>Formulujte přední stranu aktivně:</strong> Dobrá otázka vás donutí vybavit odpověď z paměti, ne ji jen poznat v textu.</li>
            <li><strong>Odpovídejte poctivě:</strong> Zvolte Znovu, když byste odpověď nedali bez nápovědy; Těžké, když jste ji dali váhavě; Dobré při normálním vybavení; Snadné jen tehdy, když byla opravdu okamžitá.</li>
            <li><strong>Nepřetěžujte média:</strong> Obrázky a zvuky jsou výborné pro anatomii, jazyky nebo poznávačky, ale u běžných pojmů často stačí čistý text.</li>
            <li><strong>Pravidelně čistěte a upravujte:</strong> Karty, které opakovaně selhávají, bývají moc široké nebo nejasné. Upravte otázku dřív, než jen donekonečna mačkat Znovu.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Stav aplikace</h2>
          <p>V pravém horním rohu záhlaví uvidíte dva indikátory (tečky):</p>
          <ul>
            <li><strong>Levá tečka:</strong> Internetové připojení. Zelená značí, že jste online.</li>
            <li><strong>Pravá tečka:</strong> Připravenost pro offline. Zelená značí, že aplikace je plně načtena v mezipaměti a bude fungovat i bez signálu.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Editor a formátování</h2>
          <p>Aplikace využívá jednoduchý WYSIWYG editor, který ukládá obsah jako HTML. Text můžete kombinovat s médii a tagy, aniž byste potřebovali účet nebo server.</p>
          <ul>
            <li><strong>Tučné písmo a kurzíva:</strong> Standardní značky <code>&lt;b&gt;</code> a <code>&lt;i&gt;</code>.</li>
            <li><strong>Seznamy:</strong> Struktura <code>&lt;ul&gt;</code> a <code>&lt;li&gt;</code> pro odrážky.</li>
            <li><strong>Média:</strong> Ke každé straně lze připojit neomezené množství souborů (JPG, PNG, MP3, WAV). Soubory se ukládají jako binární bloby přímo do IndexedDB.</li>
            <li><strong>Prohození stran:</strong> U existující kartičky můžete přední a zadní stranu prohodit včetně připojených médií.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Importy z externích zdrojů</h2>
          <p>Pro hromadné nahrávání dat zvolte odpovídající formát v záložce Import:</p>
          <ul>
            <li><strong>Anki ZIP:</strong> Očekává .zip archiv obsahující jedno .xml se strukturou karet a složku <code>blobs/</code> s mediálními soubory pojmenovanými podle hashů v XML.</li>
            <li><strong>CSV:</strong> Textový soubor s oddělovačem (čárka/středník). V průvodci namapujte sloupce pro přední stranu, zadní stranu a tagy.</li>
            <li><strong>Markdown:</strong> Importuje strukturované soubory, kde nadpisy <code>##</code> definují novou kartu.</li>
            <li><strong>Hromadný editor:</strong> Pro rychlé ruční zadání většího množství karet použijte hromadné vytváření přímo v balíčku.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Procvičování</h2>
          <p>Procvičování můžete spustit z balíčku nebo z úvodní stránky pro více sad najednou. V balíčku si vyberete zdroj karet, počet karet v průchodu a pořadí.</p>
          <ul>
            <li><strong>K opakování dnes:</strong> Karty, kterým už nastal čas podle plánování.</li>
            <li><strong>Všechny kartičky:</strong> Celý balíček bez ohledu na datum dalšího opakování.</li>
            <li><strong>Těžké kartičky:</strong> Karty s chybami nebo nízkou snadností.</li>
            <li><strong>Špatně zodpovězené:</strong> Karty, které měly v historii odpověď Znovu nebo Těžké.</li>
            <li><strong>Nové kartičky:</strong> Karty, které ještě nebyly procvičované.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Režimy procvičování</h2>
          <ul>
            <li><strong>Učení:</strong> Kartu otočíte klepnutím. Potom zvolíte hodnocení nebo použijete gesto: doleva Znovu, doprava Dobré, nahoru Snadné, dolů Těžké.</li>
            <li><strong>Test:</strong> Aplikace nabídne správnou odpověď a distraktory z ostatních karet v balíčku. Přeskočení se zapíše jako Znovu.</li>
            <li><strong>Psaní:</strong> Napíšete odpověď ručně. Tolerantní režim odpustí drobné překlepy pomocí podobnosti textu, striktní režim vyžaduje přesnější shodu.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Snadnost a plánování</h2>
          <p>Aplikace používá SRS (Spaced Repetition System) založený na intervalu, počtu opakování, chybách a faktoru snadnosti.</p>
          <ul>
            <li><strong>Snadnost:</strong> Číslo u kartičky říká, jak rychle se prodlužuje interval mezi opakováními. Nová karta začíná na hodnotě 2.50. Vyšší hodnota znamená, že se po správné odpovědi objeví později; nižší hodnota ji drží častěji v procvičování.</li>
            <li><strong>Znovu:</strong> Resetuje interval, přidá chybu, sníží snadnost o 0.20 a naplánuje kartu přibližně za 10 minut.</li>
            <li><strong>Těžké:</strong> Nechá kartu v kratším intervalu, sníží snadnost o 0.15 a započítá opakování.</li>
            <li><strong>Dobré:</strong> Posune kartu podle aktuálního intervalu a snadnosti. První správná odpověď nastaví interval 1 den, druhá 3 dny, další se násobí snadností.</li>
            <li><strong>Snadné:</strong> Výrazněji prodlouží interval, zvýší snadnost o 0.15 a u nové karty nastaví první interval na 4 dny.</li>
            <li><strong>Minimum snadnosti:</strong> Hodnota neklesne pod 1.30, aby se karta dala dál rozumně plánovat.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Správa úložiště a zálohy</h2>
          <p>Všechna data jsou uložena lokálně v prohlížeči (IndexedDB). Prohlížeč může data smazat při nedostatku místa na disku.</p>
          <ul>
            <li><strong>JSON Export:</strong> Jediný způsob kompletní zálohy. Obsahuje kompletní dump databáze včetně médií v Base64 kódování.</li>
            <li><strong>Export balíčku:</strong> Hodí se pro sdílení nebo přenos jedné sady kartiček.</li>
            <li><strong>CSV Export:</strong> Praktický pro kontrolu a další zpracování textových karet mimo aplikaci.</li>
            <li><strong>Údržba:</strong> Funkce "Smazat nepřiřazená média" v nastavení odstraní soubory, jejichž mateřské karty byly smazány.</li>
            <li><strong>Interval:</strong> Připomínač zálohy v nastavení určuje frekvenci výzvy k exportu (výchozí 7 dní).</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Když se něco chová zvláštně</h2>
          <ul>
            <li><strong>Nevidíte kartu k opakování:</strong> Zkontrolujte volbu zdroje karet. Režim K opakování dnes ukáže jen karty s nastalým termínem.</li>
            <li><strong>Karta se vrací moc často:</strong> Pravděpodobně má nízkou snadnost nebo více chyb. Pomůže ji přeformulovat na menší a jasnější otázku.</li>
            <li><strong>Potřebujete začít znovu:</strong> Vytvořte kopii balíčku. Kopie zachová obsah, ale resetuje historii procvičování.</li>
            <li><strong>Měníte prohlížeč nebo zařízení:</strong> Nejprve exportujte JSON zálohu a na novém místě ji importujte.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
