import { useEffect, useState } from 'react';
import type { CardSide, Media } from '../types';
import ObjectImage from './ObjectImage';

interface CardMediaListProps {
  media: Media[];
  side: CardSide;
  onRemove?: (mediaId: string) => void;
}

export default function CardMediaList({ media, side, onRemove }: CardMediaListProps) {
  const items = media.filter((item) => item.side === side);
  if (items.length === 0) return null;

  return (
    <div className="media-grid">
      {items.map((item) => (
        <figure key={item.id} className="media-item" onClick={(e) => {
          if (item.type === 'audio') {
            e.stopPropagation();
          }
        }}>
          {item.type === 'audio' ? (
            <AudioPlayer media={item} />
          ) : (
            <ObjectImage blob={item.blob} alt={item.name || 'Obrázek kartičky'} />
          )}
          {onRemove && (
            <button className="tiny-button" onClick={() => onRemove(item.id)} type="button">
              Odebrat
            </button>
          )}
        </figure>
      ))}
    </div>
  );
}

function AudioPlayer({ media }: { media: Media }) {
  const [url, setUrl] = useState<string>();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!media.blob || media.blob.size === 0) {
      setState('error');
      setUrl(undefined);
      return;
    }

    const nextUrl = URL.createObjectURL(media.blob);
    setUrl(nextUrl);
    setState('loading');

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [media.blob]);

  const meta = formatAudioMeta(media);

  if (state === 'error') {
    return (
      <div className="audio-status error-box">
        Zvuk se v tomto prohlížeči nepodařilo načíst. Zkuste soubor převést na MP3, WAV nebo M4A/AAC.
        {meta && <small>{meta}</small>}
      </div>
    );
  }

  return (
    <div className="audio-shell">
      {state === 'loading' && <p className="audio-status muted">Načítám zvuk…</p>}
      {url && (
        <audio
          className="audio-player"
          src={url}
          controls
          preload="metadata"
          onCanPlay={() => setState('ready')}
          onLoadedMetadata={() => setState('ready')}
          onError={() => setState('error')}
        />
      )}
      {state === 'ready' && meta && <small className="media-meta">{meta}</small>}
    </div>
  );
}

function formatAudioMeta(media: Media): string {
  const parts = [
    media.name,
    typeof media.durationSeconds === 'number' ? formatDuration(media.durationSeconds) : undefined,
    typeof media.size === 'number' ? formatBytes(media.size) : undefined
  ].filter(Boolean);

  return parts.join(' · ');
}

function formatDuration(value: number): string {
  const totalSeconds = Math.round(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} kB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
