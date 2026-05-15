import { useEffect, useState } from 'react';

export default function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isCached, setIsCached] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check if Service Worker is active
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        setIsCached(true);
    } else if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(() => setIsCached(true));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="status-container">
      <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Internet: Online' : 'Internet: Offline'}>
        ●
      </div>
      <div className={`status-indicator ${isCached ? 'online' : 'offline'}`} title={isCached ? 'Offline Cache: Ready' : 'Offline Cache: Loading'}>
        ●
      </div>
    </div>
  );
}
