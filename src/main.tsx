import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { ThemeProvider } from './contexts/ThemeContext'
import './app/styles.css'

// Global error handler for mobile debugging
window.onerror = function(message, source, lineno, colno, error) {
  // Ignore cross-origin or empty errors often found in PWA/ServiceWorker loading
  if (!message && !source) return false;
  
  const errStr = "Chyba aplikace: " + message + "\nZdroj: " + source + "\nŘádek: " + lineno;
  console.error(errStr, error);
  
  // Only alert if the error is significant enough to have a message
  if (!window.location.hostname.includes('localhost') && message !== 'Script error.') {
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
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </React.StrictMode>,
    )
  } catch (e) {
    alert("Kritická chyba při vykreslování: " + (e instanceof Error ? e.message : String(e)));
  }
}
