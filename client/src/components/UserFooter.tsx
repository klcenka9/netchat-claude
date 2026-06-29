import { Mic, MicOff, Headphones, Settings, PhoneOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useVoiceStore } from '../store/voiceStore';
import Avatar from './Avatar';

export default function UserFooter({ onOpenSettings }: { onOpenSettings: () => void }) {
  const me = useAuthStore((s) => s.me);
  const { context, muted, deafened, toggleMute, toggleDeafen, leave } = useVoiceStore();
  if (!me) return null;

  return (
    <div className="bg-bg-soft px-2 py-1.5">
      {context && (
        <div className="flex items-center justify-between text-xs text-green-400 px-2 py-1 mb-1">
          <span>Voice Connected</span>
          <button onClick={leave} title="Disconnect">
            <PhoneOff size={16} className="text-muted hover:text-red-400" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Avatar user={me} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{me.display_name}</div>
          <div className="text-xs text-muted truncate">{me.custom_status ?? me.username}</div>
        </div>
        <button onClick={toggleMute} title="Mute" className="p-1.5 hover:bg-bg-alt rounded">
          {muted ? <MicOff size={18} className="text-red-400" /> : <Mic size={18} />}
        </button>
        <button onClick={toggleDeafen} title="Deafen" className="p-1.5 hover:bg-bg-alt rounded">
          <Headphones size={18} className={deafened ? 'text-red-400' : ''} />
        </button>
        <button onClick={onOpenSettings} title="Settings" className="p-1.5 hover:bg-bg-alt rounded">
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
