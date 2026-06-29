import { useState } from 'react';
import { Phone } from 'lucide-react';
import { useDmStore } from '../store/dmStore';
import { useAuthStore } from '../store/authStore';
import { useVoiceStore } from '../store/voiceStore';
import { getSocket } from '../api/socket';
import Avatar from './Avatar';

export default function DMView() {
  const { dms, activeDmId, messages } = useDmStore();
  const me = useAuthStore((s) => s.me);
  const joinVoice = useVoiceStore((s) => s.join);
  const [text, setText] = useState('');

  if (!activeDmId) {
    return (
      <div className="flex-1 bg-bg grid place-items-center text-muted">
        Select a conversation or start a new one
      </div>
    );
  }
  const dm = dms.find((d) => d.id === activeDmId);
  const list = messages[activeDmId] ?? [];
  const title =
    dm?.name ?? dm?.participants.filter((p) => p.id !== me?.id).map((p) => p.display_name).join(', ');

  function send() {
    if (!text.trim()) return;
    getSocket()?.emit('dm:send', { dmChannelId: activeDmId, content: text.trim() });
    setText('');
  }

  function startCall() {
    getSocket()?.emit('dm:call-invite', { dmChannelId: activeDmId });
    joinVoice({ type: 'dm', dmChannelId: activeDmId! });
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-w-0">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shadow-sm">
        <span className="font-semibold">@ {title}</span>
        <button onClick={startCall} title="Start call" className="text-muted hover:text-green-400">
          <Phone size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {list.map((m) => (
          <div key={m.id} className="flex gap-3">
            <Avatar user={m.author ?? { display_name: '?', avatar_url: null }} size={40} />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{m.author?.display_name}</span>
                <span className="text-xs text-muted">
                  {new Date(m.createdAt * 1000).toLocaleString()}
                </span>
              </div>
              <div
                className="message-content break-words"
                dangerouslySetInnerHTML={{ __html: m.contentHtml }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-5">
        <div className="bg-panel rounded-lg flex items-center px-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), send())}
            placeholder="Message"
            className="flex-1 bg-transparent py-3 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
