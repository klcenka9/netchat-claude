import { useEffect } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { getSocket } from '../api/socket';
import { useVoiceStore } from '../store/voiceStore';

export default function IncomingCallModal({
  dmChannelId,
  fromUserId,
  onClose,
}: {
  dmChannelId: string;
  fromUserId: string;
  onClose: () => void;
}) {
  const join = useVoiceStore((s) => s.join);

  // Auto-dismiss after 30s (spec §10).
  useEffect(() => {
    const t = setTimeout(onClose, 30_000);
    return () => clearTimeout(t);
  }, [onClose]);

  function accept() {
    join({ type: 'dm', dmChannelId });
    onClose();
  }
  function decline() {
    getSocket()?.emit('dm:call-decline', { dmChannelId });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-[60]">
      <div className="bg-bg-alt rounded-lg p-8 text-center w-80">
        <div className="w-16 h-16 rounded-full bg-accent mx-auto grid place-items-center text-white text-2xl mb-4 animate-pulse">
          {fromUserId[0]}
        </div>
        <div className="font-semibold mb-1">Incoming call</div>
        <div className="text-muted text-sm mb-6">from {fromUserId}</div>
        <div className="flex justify-center gap-6">
          <button onClick={accept} className="w-14 h-14 rounded-full bg-green-500 grid place-items-center text-white">
            <Phone size={24} />
          </button>
          <button onClick={decline} className="w-14 h-14 rounded-full bg-red-500 grid place-items-center text-white">
            <PhoneOff size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
