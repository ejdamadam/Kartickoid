import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { ThemeProvider } from './contexts/ThemeContext'
import './app/styles.css'

const ignoredGlobalErrorPatterns = [
  'Script error.',
  'EmptyRanges',
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded'
];
const shownGlobalErrors = new Map<string, number>();
let lastGlobalErrorAlertAt = 0;

function shouldIgnoreGlobalError(message: string, source?: string): boolean {
  if (!message) return true;
  if (ignoredGlobalErrorPatterns.some((pattern) => message.includes(pattern))) return true;

  // Safari/WebKit can report internal reference errors without a script source
  // during focus, selection, alert, reload, or PWA lifecycle transitions.
  return !source && message.includes('ReferenceError:');
}

function reportGlobalError(message: unknown, source?: string, lineno?: number, error?: unknown): void {
  const messageText = String(message || '');
  if (shouldIgnoreGlobalError(messageText, source)) {
    console.warn('Ignorovaná chyba prostředí:', messageText, { source, lineno, error });
    return;
  }

  const errStr = `Chyba aplikace: ${messageText}\nZdroj: ${source || 'neznámý'}\nŘádek: ${lineno ?? 'neznámý'}`;
  console.error(errStr, error);

  if (window.location.hostname.includes('localhost')) return;

  const now = Date.now();
  const key = `${messageText}|${source || ''}|${lineno || ''}`;
  const lastShownAt = shownGlobalErrors.get(key) ?? 0;
  if (now - lastShownAt < 60_000 || now - lastGlobalErrorAlertAt < 10_000) return;

  shownGlobalErrors.set(key, now);
  lastGlobalErrorAlertAt = now;
  window.alert(errStr);
}

// Global error handler for mobile/PWA debugging without trapping users in alert loops.
window.onerror = function(message, source, lineno, _colno, error) {
  reportGlobalError(message, source, lineno, error);
  return false;
};

window.onunhandledrejection = function(event) {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason || '');
  reportGlobalError(message, undefined, undefined, reason);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  alert("Chyba: Element 'root' nebyl nalezen.");
} else {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </React.StrictMode>,
    )
  } catch (e) {
    alert("Kritická chyba při vykreslování: " + (e instanceof Error ? e.message : String(e)));
  }
}
