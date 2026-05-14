import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../i18n';

export default function OfflineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [ready, setReady] = useState(false);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    navigator.serviceWorker?.ready
      .then(() => setReady(true))
      .catch(() => setReady(false));

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return (
    <div className="status-pills" aria-label="Stav aplikace">
      <span className={`pill ${online ? 'pill-ok' : 'pill-warn'}`}>{online ? t.pwa.online : t.pwa.offline}</span>
      <span className={`pill ${ready || offlineReady ? 'pill-ok' : 'pill-muted'}`}>{ready || offlineReady ? t.pwa.ready : t.pwa.preparing}</span>
      {needRefresh && (
        <button className="update-pill" onClick={() => updateServiceWorker(true)}>{t.pwa.update}</button>
      )}
    </div>
  );
}
