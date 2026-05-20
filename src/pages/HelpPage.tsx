export default function HelpPage() {
  return (
    <section className="page help-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Dokumentace</p>
          <h1>Návod</h1>
          <p className="lead">Praktický průvodce pro první spuštění, tvorbu kartiček, procvičování, herní režimy a bezpečné zálohování v Kartičkoidu.</p>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <h2>Rychlý start pro nového uživatele</h2>
          <ol>
            <li><strong>Vytvořte první balíček:</strong> na stránce Balíčky klikněte na Nový balíček. Název zvolte podle předmětu, kapitoly nebo konkrétní zkoušky.</li>
            <li><strong>Přidejte první kartičku:</strong> otevřete balíček, klikněte na Nová kartička a vyplňte přední stranu jako otázku a zadní stranu jako odpověď.</li>
            <li><strong>Přidejte víc karet najednou:</strong> použijte Přidat více kartiček. Vizuální editor je pomalejší, ale přehledný; raw text je rychlý pro obsah z poznámek.</li>
            <li><strong>Spusťte procvičování:</strong> v balíčku vyberte zdroj kartiček, například Všechny kartičky, a klikněte na Procvičovat.</li>
            <li><strong>Zálohujte přes ZIP:</strong> po větší práci otevřete import/export nebo Nastavení a stáhněte ZIP zálohu. ZIP je doporučená cesta pro kompletní obnovu.</li>
          </ol>
          <p className="muted">Tip: Pro první test si vytvořte 5-10 jednoduchých kartiček. Rychle poznáte, jestli vám vyhovuje formulace otázek, a až potom má smysl přidávat větší množství.</p>
        </section>

        <section className="panel">
          <h2>Technologie PWA a její limity</h2>
          <p>Kartičkoid využívá technologii <strong>PWA (Progressive Web App)</strong>. To znamená, že se v telefonu chová téměř jako běžná aplikace, ale běží v jádru prohlížeče (Chrome/Safari).</p>
          <ul>
            <li><strong>Funguje offline:</strong> Jakmile aplikaci jednou načtete, Service Worker uloží její soubory. I když zdrojový server vypadne, Kartičkoid se vám z plochy nebo záložky normálně spustí.</li>
            <li><strong>Soukromí:</strong> Vaše data (kartičky, obrázky) nikdy neopouštějí zařízení, pokud nepoužijete OneDrive synchronizaci. Vše je uloženo v lokální databázi prohlížeče (IndexedDB).</li>
          </ul>
          <div className="callout caution">
            <p><strong>⚠️ Pozor na automatické mazání dat:</strong> Operační systémy Android a iOS mohou při nedostatku místa na disku nebo dlouhé neaktivitě (typicky 30+ dní) automaticky "vyčistit" data prohlížečů, včetně vaší databáze kartiček.</p>
            <p><strong>Pravidelně používejte ZIP export</strong> pro trvalou zálohu svých dat mimo prohlížeč. Nativní aplikace (APK) tímto rizikem netrpí, ale PWA je na správu paměti systémem náchylná.</p>
          </div>
        </section>

        <section className="panel">
          <h2>Základní workflow</h2>
          <p>Kartičkoid je lokální aplikace v prohlížeči. Data se ukládají do zařízení, takže nepotřebujete účet ani server. Typický postup je: vytvořit balíček, přidat kartičky, učit se swipem, průběžně upravovat špatně formulované karty a pravidelně exportovat ZIP zálohu.</p>
          <ul>
            <li><strong>Balíček:</strong> používejte jako větší celek, například Biologie, Angličtina B2 nebo Anatomie - svaly.</li>
            <li><strong>Kartička:</strong> měla by zkoušet jednu konkrétní věc. Pokud je odpověď dlouhá, rozdělte ji na víc karet.</li>
            <li><strong>Tagy:</strong> hodí se pro kapitoly, zdroje, prioritu nebo typ otázky. Později podle nich můžete filtrovat.</li>
            <li><strong>Údržba:</strong> když se karta často plete, často je lepší ji přeformulovat než ji jen znovu a znovu opakovat.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Vytváření kartiček</h2>
          <p>Každá kartička má přední a zadní stranu. Přední strana je obvykle otázka, pojem nebo obrázek k poznání. Zadní strana je odpověď, vysvětlení nebo správný název.</p>
          <ul>
            <li><strong>Jedna kartička ručně:</strong> zvolte Nová kartička. Hodí se pro pečlivé zadání textu, tagů, obrázků nebo zvuků.</li>
            <li><strong>Více kartiček vizuálně:</strong> zvolte Přidat více kartiček a nechte aktivní Vizuální editor. Začnete jednou prázdnou kartou, další přidáte plus buttonem pod poslední kartičkou.</li>
            <li><strong>Raw import:</strong> ve stejném modalu přepněte na Raw text. Každá dvojice patří na samostatný řádek ve formátu <code>pojem: vysvětlení</code>.</li>
            <li><strong>Starší raw formát:</strong> stále funguje i zápis <code>otázka :: odpověď :: tagy</code>, takže starší poznámky nemusíte přepisovat.</li>
            <li><strong>Přílohy:</strong> obrázky přidávejte tam, kde nesou informaci: schémata, mapy, anatomie, poznávačky nebo vzorce. Zvuk je vhodný hlavně u jazyků.</li>
          </ul>
          <p><strong>Příklad raw vstupu:</strong></p>
          <pre><code>{`ATP: Energetická měna buňky
Mitochondrie: Elektrárna buňky
Ribozom :: Místo tvorby bílkovin :: biologie,buňka`}</code></pre>
          <p className="muted">Tip pro dobré kartičky: ptejte se konkrétně, odpověď držte krátkou a nedávejte na jednu kartu více nezávislých faktů.</p>
        </section>

        <section className="panel">
          <h2>Přehled balíčku, hvězdičky a filtrování</h2>
          <p>V detailu balíčku vidíte přední a zadní stranu každé kartičky odděleně. Delší texty zůstávají čitelné, karty můžete upravit, smazat, prohodit strany nebo doplnit média.</p>
          <ul>
            <li><strong>Hvězdička:</strong> označuje důležité, problematické nebo zkouškově klíčové kartičky. Zapnete ji v přehledu i přímo při procvičování.</li>
            <li><strong>Filtr hvězdiček:</strong> v řádku s tagy je malé hvězdičkové tlačítko. Prázdná hvězdička znamená všechny kartičky, zlatá pouze označené a škrtnutá kartičky bez hvězdičky. Klepnutím se režimy cyklicky střídají.</li>
            <li><strong>Hledání:</strong> prohledává text na obou stranách a tagy.</li>
            <li><strong>Tagy:</strong> klikáním na tagy rychle zúžíte balíček na konkrétní téma.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Procvičování swipem</h2>
          <p>Procvičování je hlavní režim pro učení. Kartičku otočíte klepnutím. Hodnocení obtížnosti se dělá gestem, ne tlačítky pod kartou, aby obrazovka zůstala čistá i na malém telefonu. Krátká nápověda ke směrům swipu se zobrazí jen u první kartičky v průchodu.</p>
          <ul>
            <li><strong>Doprava:</strong> Dobré - odpověď jste zvládli.</li>
            <li><strong>Doleva:</strong> Znovu - odpověď nevyšla a karta se má brzy vrátit.</li>
            <li><strong>Nahoru:</strong> Snadné - odpověď naskočila okamžitě.</li>
            <li><strong>Dolů:</strong> Těžké - odpověď byla správná nebo skoro správná, ale s váháním.</li>
            <li><strong>Zpět na předchozí kartu:</strong> použijte malou šipku přímo na kartičce.</li>
            <li><strong>Hvězdička při učení:</strong> hvězdičkou si kartu označíte bez opuštění průchodu.</li>
          </ul>
          <p>Delší kartičky se na telefonu čtou scrollováním uvnitř kartičky. Tělo karty zůstává ve velikosti, která se vejde na displej, a text začíná odshora na přední i zadní straně.</p>
          <p>Po dokončení průchodu použijte <strong>Procvičit znovu</strong>, pokud chcete bez přemýšlení zopakovat právě dokončené kartičky. Pro jiný typ průchodu se vraťte do balíčku a spusťte procvičování znovu z požadovaného zdroje.</p>
          <p className="muted">Tip: Snadné používejte střídmě. Pokud jste dlouho přemýšleli, je přesnější Dobré nebo Těžké.</p>
        </section>

        <section className="panel">
          <h2>Režimy v procvičování</h2>
          <ul>
            <li><strong>Učení:</strong> klasická otočná kartička s hodnocením swipem.</li>
            <li><strong>Test:</strong> rychlý výběr odpovědi z možností uvnitř procvičování.</li>
            <li><strong>Psaní:</strong> odpověď píšete ručně. Tolerantní režim odpustí drobné překlepy, přísný režim vyžaduje přesnější shodu.</li>
          </ul>
          <p>Před spuštěním v balíčku můžete vybrat, jestli chcete všechny karty, dnešní opakování, nové karty, těžké karty nebo chyby. Můžete také omezit počet karet a pořadí.</p>
        </section>

        <section className="panel">
          <h2>Match mód</h2>
          <p>Match je samostatný režim mimo klasické procvičování. Neodděluje pojmy a odpovědi do sloupců: všechny části dvojic jsou zamíchané dohromady na jedné ploše. Vyberete libovolné dvě související kartičky.</p>
          <ul>
            <li><strong>Správná dvojice:</strong> obě položky zmizí ze hry a plocha se postupně čistí.</li>
            <li><strong>Špatná dvojice:</strong> položky krátce signalizují chybu a zůstávají ve hře.</li>
            <li><strong>Výsledek:</strong> po dokončení uvidíte skóre a přehled chybných pokusů.</li>
          </ul>
          <p className="muted">Tip: Match je dobrý pro pojmy, slovíčka, definice a dvojice typu stát - hlavní město.</p>
        </section>

        <section className="panel">
          <h2>Test mód</h2>
          <p>Test je samostatný režim určený pro kontrolu znalostí. Před spuštěním si nastavíte počet otázek, směr dotazování, typ odpovědí a zda chcete průběžné vyhodnocení nebo výsledky až na konci.</p>
          <ul>
            <li><strong>Přední → zadní:</strong> vidíte otázku nebo pojem a odpovídáte zadní stranou.</li>
            <li><strong>Zadní → přední:</strong> vidíte odpověď nebo definici a hledáte původní pojem.</li>
            <li><strong>Výběr z možností:</strong> aplikace vytvoří distraktory z ostatních kartiček v balíčku.</li>
            <li><strong>Pouze hvězdičkové:</strong> hodí se pro rychlou kontrolu důležitých nebo problémových karet.</li>
            <li><strong>Výsledky:</strong> na konci uvidíte skóre, procenta, správné a špatné odpovědi a možnost test zopakovat.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Study game: Rychlá odpověď</h2>
          <p>Rychlá odpověď je jednoduchá hra na čas. Aplikace ukáže zadání a vy vybíráte správnou odpověď z možností. Cílem je odpovídat přesně a rychle, protože skóre vychází ze správných odpovědí a tempa.</p>
          <p className="muted">Tip: Používejte ji jako rozehřátí nebo krátkou kontrolu před testem. Pro hlubší učení je lepší klasické procvičování swipem.</p>
        </section>

        <section className="panel">
          <h2>Export a import</h2>
          <p>Protože jsou data uložená lokálně v prohlížeči, záloha je zásadní. Nejbezpečnější běžný postup je pravidelně stáhnout ZIP zálohu a uložit ji mimo prohlížeč, například do souborů, iCloudu, OneDrivu nebo na disk. Zálohujte hlavně před větším importem, mazáním nebo přesunem na jiné zařízení.</p>
          <ul>
            <li><strong>ZIP záloha:</strong> doporučená a lepší varianta pro kompletní zálohu celé sady. Je vhodnější pro běžné uživatele, protože obsahuje databázový <code>backup.json</code>, související data a případné přílohy jako samostatné soubory.</li>
            <li><strong>JSON export:</strong> původní/starší forma exportu. Zůstává dostupná jako jednodušší nebo pokročilejší technická varianta v jednom souboru, ale pro kompletní zálohu celé aplikace používejte raději ZIP.</li>
            <li><strong>Soft import:</strong> sloučí zálohu s aktuálními daty a snaží se nepřidávat duplicity. Hodí se pro běžné doplnění dat.</li>
            <li><strong>Hard import:</strong> přidá celý obsah zálohy k aktuálním datům a může vytvořit duplicity. Používejte ho jen tehdy, když víte proč.</li>
            <li><strong>Reset / obnova:</strong> nahradí aktuální lokální data obsahem zálohy. Aplikace před tím vytvoří bezpečnostní snapshot.</li>
            <li><strong>CSV:</strong> hodí se pro tabulky a jednoduchý přenos textových kartiček.</li>
            <li><strong>Markdown:</strong> je užitečný pro strukturované poznámky.</li>
            <li><strong>Anki ZIP:</strong> slouží pro import balíčku z Anki včetně mediálních souborů, pokud jsou v exportu dostupné.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Řešení problémů při exportu (iPhone a velké knihovny)</h2>
          <p>U velmi velkých knihoven (stovky megabajtů) se může stát, že prohlížeč (zejména na iPhone) při vytváření ZIP zálohy zkolabuje kvůli nedostatku operační paměti.</p>
          <ul>
            <li><strong>Rozdělený export:</strong> v Nastavení najdete volbu pro rozdělení exportu na více menších souborů. Zvolte počet médií v jednom dílu (např. 50) a stáhněte si díly jeden po druhém.</li>
            <li><strong>Import dílů:</strong> stažené části pak na novém zařízení nahrajte jednu po druhé pomocí <strong>Soft importu</strong>. První díl vytvoří strukturu a nahraje část fotek, další díly pak postupně doplní zbytek.</li>
            <li><strong>Export balíčku:</strong> pokud padá celková záloha, můžete také zkusit exportovat balíčky jeden po druhém přímo z jejich detailu nebo seznamu.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Dark mode</h2>
          <p>Tmavý režim zapnete v Nastavení. Preference se ukládá lokálně, takže aplikace si ji zapamatuje i po zavření. Základ je tmavě modrý/slate, ale akcenty respektují vybranou barvu aplikace podobně jako ve světlém režimu.</p>
        </section>

        <section className="panel">
          <h2>OneDrive</h2>
          <p>OneDrive zálohy jsou ve vývoji jako doplňková cloudová možnost. V Nastavení jsou ve výchozím stavu sbalené, aby nepřekážely běžným volbám. Pro jistou obnovu používejte pravidelně ZIP zálohu.</p>
        </section>

        <section className="panel">
          <h2>Snadnost a obtížnost</h2>
          <p>Snadnost je interní hodnota, která ovlivňuje, jak rychle se kartě prodlužuje interval mezi opakováními. Nová kartička začíná na běžné hodnotě a podle vašich gest se postupně mění.</p>
          <ul>
            <li><strong>Znovu:</strong> karta se vrátí brzy, započítá se chyba a snadnost klesne.</li>
            <li><strong>Těžké:</strong> interval zůstane kratší, protože odpověď nebyla jistá.</li>
            <li><strong>Dobré:</strong> karta se posune podle aktuálního plánu.</li>
            <li><strong>Snadné:</strong> interval se prodlouží výrazněji a snadnost stoupne.</li>
          </ul>
          <p>V hlavním procvičování tyto volby nevybíráte tlačítky pod kartičkou, ale swipem: doleva Znovu, dolů Těžké, doprava Dobré, nahoru Snadné.</p>
        </section>

        <section className="panel">
          <h2>Mobilní ovládání</h2>
          <ul>
            <li><strong>Menu:</strong> otevřete tlačítkem nebo tahem od levého okraje. Otevřené menu zavřete tahem doleva.</li>
            <li><strong>Návrat:</strong> na podstránkách používejte decentní šipku zpět nebo swipe gesto z levé části obrazovky.</li>
            <li><strong>Krátké průchody:</strong> na telefonu bývá nejlepší učit se v dávkách 10-20 karet.</li>
            <li><strong>Malé displeje:</strong> procvičování je záměrně čisté, bez spodních hodnoticích tlačítek, aby zůstalo místo pro samotnou kartu.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
