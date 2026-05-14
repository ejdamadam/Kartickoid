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
        <figure key={item.id} className="media-item" onClick={(e) => e.stopPropagation()}>
          {item.type === 'audio' ? (
            <audio src={URL.createObjectURL(item.blob)} controls />
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
