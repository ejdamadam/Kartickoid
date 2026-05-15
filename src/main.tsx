import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './app/styles.css'

// Global error handler for mobile debugging
window.onerror = function(message, source, lineno, colno, error) {
  const errStr = "Chyba aplikace: " + message + "\nZdroj: " + source + "\nŘádek: " + lineno;
  console.error(errStr, error);
  // Only alert if we are not on local dev
  if (!window.location.hostname.includes('localhost')) {
    alert(errStr);
  }
  return false;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  alert("Chyba: Element 'root' nebyl nalezen.");
} else {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  } catch (e) {
    alert("Kritická chyba při vykreslování: " + (e instanceof Error ? e.message : String(e)));
  }
}
