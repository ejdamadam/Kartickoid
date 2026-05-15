import React from 'react';
import { t } from '../i18n';

interface HelpPageProps {
  onBack: () => void;
}

export default function HelpPage({ onBack }: HelpPageProps) {
  return (
    <section className="page help-page">
      <button className="back-button" onClick={onBack}>← {t.common.back}</button>
      
      <div className="page-heading">
        <div>
          <p className="eyebrow">Nápověda</p>
          <h1>Jak používat Kartičkoid</h1>
          <p className="lead">Stručný přehled funkcí a tipů pro efektivní učení.</p>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <h2>🗂️ Správa balíčků</h2>
          <p>Na hlavní stránce můžete vytvářet nové sady kartiček (balíčky). Každý balíček má svůj název a popis. Balíčky můžete duplikovat, exportovat do formátu JSON pro zálohu nebo do CSV pro tabulkový procesor.</p>
        </section>

        <section className="panel">
          <h2>📝 Tvorba kartiček</h2>
          <p>Při vytváření karty máte k dispozici <strong>WYSIWYG editor</strong>. To znamená, že formátování (tučné písmo, kurzíva, seznamy) vidíte přímo při psaní. Ke každé straně karty (přední i zadní) můžete připojit libovolné množství <strong>obrázků a zvukových stop</strong>.</p>
        </section>

        <section className="panel">
          <h2>🔊 Multimédia</h2>
          <ul>
            <li><strong>Obrázky:</strong> Skvělé pro vizuální učení. Klepnutím na obrázek v seznamu otevřete náhled na celou obrazovku.</li>
            <li><strong>Zvuk:</strong> Umožňuje nahrát výslovnost nebo zvuky (např. zpěv ptáků). V režimu procvičování se zobrazí jednoduchý přehrávač.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>🧠 Režimy procvičování</h2>
          <ul>
            <li><strong>Učení:</strong> Klasické otáčení karet. Tažením (swipe) nebo tlačítky hodnotíte obtížnost. Aplikace sama plánuje opakování podle algoritmu SRS.</li>
            <li><strong>Test:</strong> Výběr z více možností (multiple choice). Pokud nevíte, můžete otázku přeskočit, což se počítá jako chyba.</li>
            <li><strong>Psaní:</strong> Procvičování přesné formulace. Aplikace využívá <em>fuzzy matching</em>, takže odpustí drobné překlepy, pokud zvolíte "tolerantní" režim.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>📥 Import dat</h2>
          <p>Kartičkoid podporuje širokou škálu importů:</p>
          <ul>
            <li><strong>JSON:</strong> Kompletní záloha celé databáze.</li>
            <li><strong>Anki ZIP:</strong> Podpora pro exporty z aplikací Anki (včetně médií a tagů).</li>
            <li><strong>CSV & Markdown:</strong> Pro rychlý import textových seznamů.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>⚙️ Nastavení a údržba</h2>
          <p>V nastavení si můžete vybrat z 16 barevných motivů. Také zde najdete nástroje pro údržbu databáze – smazání nepoužívaných médií nebo staré historie, což ušetří místo ve vašem zařízení.</p>
        </section>

        <section className="panel">
          <h2>☁️ Zálohování</h2>
          <p>Vaše data jsou uložena <strong>pouze ve vašem prohlížeči</strong>. Pro maximální bezpečí doporučujeme pravidelně využívat "Export zálohy". Aplikace vás na to sama upozorní v nastaveném intervalu.</p>
        </section>
      </div>
    </section>
  );
}
