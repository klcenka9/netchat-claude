import { useEffect, useState } from 'react';
import { api } from '../api/http';

export interface CustomEmoji {
  id: string;
  server_id: string;
  name: string;
  image_url: string;
}

const DEFAULT_EMOJIS = [
  '😀', '😂', '😍', '😎', '😭', '😡', '👍', '👎', '🙏', '🔥',
  '🎉', '❤️', '💯', '👀', '😅', '🤔', '😴', '🥳', '😱', '🙌',
  '✅', '❌', '⭐', '👋', '🤝', '💀', '🤡', '🥺', '😏', '🫡',
];

// Emits the chosen emoji. Custom emoji are passed as `custom:<id>` so they round-trip
// through the reaction socket the same way the server stores them.
export default function EmojiPicker({
  serverId,
  onPick,
  onClose,
}: {
  serverId: string | null;
  onPick: (emoji: string, display: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState<CustomEmoji[]>([]);

  useEffect(() => {
    if (!serverId) return;
    api<CustomEmoji[]>(`/servers/${serverId}/emojis`)
      .then(setCustom)
      .catch(() => setCustom([]));
  }, [serverId]);

  return (
    <div
      className="absolute bottom-12 right-0 w-72 max-h-80 overflow-y-auto bg-bg-soft border border-border rounded-lg shadow-lg p-2 z-30"
      onMouseLeave={onClose}
    >
      {custom.length > 0 && (
        <>
          <div className="text-xs font-bold text-muted uppercase px-1 mb-1">Server Emoji</div>
          <div className="grid grid-cols-8 gap-1 mb-2">
            {custom.map((e) => (
              <button
                key={e.id}
                title={`:${e.name}:`}
                onClick={() => onPick(`custom:${e.id}`, `:${e.name}:`)}
                className="w-8 h-8 grid place-items-center rounded hover:bg-bg-alt"
              >
                <img src={e.image_url} alt={e.name} className="w-6 h-6 object-contain" />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="text-xs font-bold text-muted uppercase px-1 mb-1">Emoji</div>
      <div className="grid grid-cols-8 gap-1">
        {DEFAULT_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => onPick(e, e)}
            className="w-8 h-8 grid place-items-center rounded hover:bg-bg-alt text-xl"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
