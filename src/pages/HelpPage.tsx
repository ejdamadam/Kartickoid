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
          <p className="eyebrow">Dokumentace</p>
          <h1>Uživatelská příručka</h1>
          <p className="lead">Technický přehled funkcí, formátů a správy dat v aplikaci Kartičkoid.</p>
        </div>
      </div>

      <div className="stack">
        <section className="panel">
          <h2>Editor a formátování</h2>
          <p>Aplikace využívá WYSIWYG editor, který ukládá text ve formátu čistého HTML. Podporovány jsou následující prvky:</p>
          <ul>
            <li><strong>Tučné písmo a kurzíva:</strong> Standardní značky <code>&lt;b&gt;</code> a <code>&lt;i&gt;</code>.</li>
            <li><strong>Seznamy:</strong> Struktura <code>&lt;ul&gt;</code> a <code>&lt;li&gt;</code> pro odrážky.</li>
            <li><strong>Média:</strong> Ke každé straně lze připojit neomezené množství souborů (JPG, PNG, MP3, WAV). Soubory se ukládají jako binární bloby přímo do IndexedDB.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Importy z externích zdrojů</h2>
          <p>Pro hromadné nahrávání dat zvolte odpovídající formát v záložce Import:</p>
          <ul>
            <li><strong>Anki ZIP:</strong> Očekává .zip archiv obsahující jedno .xml se strukturou karet a složku <code>blobs/</code> s mediálními soubory pojmenovanými podle hashů v XML.</li>
            <li><strong>CSV:</strong> Textový soubor s oddělovačem (čárka/středník). V průvodci namapujte sloupce pro přední stranu, zadní stranu a tagy.</li>
            <li><strong>Markdown:</strong> Importuje strukturované soubory, kde nadpisy <code>##</code> definují novou kartu.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Algoritmus a plánování</h2>
          <p>Aplikace používá SRS (Spaced Repetition System) založený na faktoru snadnosti (Ease). </p>
          <ul>
            <li><strong>Znovu:</strong> Resetuje interval, karta se vrátí do fáze učení.</li>
            <li><strong>Těžké/Dobré/Snadné:</strong> Upravují Ease faktor a násobí aktuální interval pro výpočet <code>dueAt</code> (příští opakování).</li>
            <li><strong>Psaní:</strong> Vyžaduje přesnou shodu textu. "Tolerantní" režim využívá Levenshteinovy vzdálenosti pro povolení drobných překlepů.</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Správa úložiště a zálohy</h2>
          <p>Všechna data jsou uložena lokálně v prohlížeči (IndexedDB). Prohlížeč může data smazat při nedostatku místa na disku.</p>
          <ul>
            <li><strong>JSON Export:</strong> Jediný způsob kompletní zálohy. Obsahuje kompletní dump databáze včetně médií v Base64 kódování.</li>
            <li><strong>Údržba:</strong> Funkce "Smazat nepřiřazená média" v nastavení odstraní soubory, jejichž mateřské karty byly smazány.</li>
            <li><strong>Interval:</strong> Připomínač zálohy v nastavení určuje frekvenci výzvy k exportu (výchozí 7 dní).</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Režim Test</h2>
          <p>Generuje distraktory (špatné odpovědi) náhodně z ostatních karet v rámci aktuálního balíčku. Tlačítko "Přeskočit" automaticky zaznamená hodnocení "Znovu" a odhalí správnou odpověď pro kontrolu.</p>
        </section>
      </div>
    </section>
  );
}
