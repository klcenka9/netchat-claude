import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, MonitorUp, PhoneOff } from 'lucide-react';
import { useVoiceStore } from '../store/voiceStore';
import { useAuthStore } from '../store/authStore';

export default function VoicePanel() {
  const {
    participants,
    localStream,
    muted,
    cameraOn,
    screenOn,
    toggleMute,
    toggleCamera,
    toggleScreen,
    leave,
  } = useVoiceStore();
  const me = useAuthStore((s) => s.me);
  const remotes = Object.values(participants);

  return (
    <div className="fixed bottom-20 right-4 w-80 bg-bg-soft rounded-lg shadow-2xl border border-border overflow-hidden z-40">
      <div className="p-2 text-sm font-medium border-b border-border">Voice / Video</div>
      <div className="grid grid-cols-2 gap-1 p-2 max-h-72 overflow-y-auto">
        <Tile label={me?.display_name ?? 'You'} stream={localStream} muted self />
        {remotes.map((p) => (
          <Tile key={p.userId} label={p.userId} stream={p.stream} muted={p.muted} />
        ))}
      </div>
      <div className="flex justify-center gap-2 p-3 bg-bg-alt">
        <Ctrl onClick={toggleMute} active={muted} title="Mute">
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </Ctrl>
        <Ctrl onClick={toggleCamera} active={cameraOn} title="Camera">
          <Video size={18} />
        </Ctrl>
        <Ctrl onClick={toggleScreen} active={screenOn} title="Share screen">
          <MonitorUp size={18} />
        </Ctrl>
        <Ctrl onClick={leave} danger title="Leave">
          <PhoneOff size={18} />
        </Ctrl>
      </div>
    </div>
  );
}

function Tile({
  label,
  stream,
  muted,
  self,
}: {
  label: string;
  stream: MediaStream | null;
  muted: boolean;
  self?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream?.getVideoTracks().length;
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative bg-black rounded aspect-video grid place-items-center overflow-hidden">
      {hasVideo ? (
        <video ref={ref} autoPlay playsInline muted={self} className="w-full h-full object-cover" />
      ) : (
        <>
          {/* audio still needs an element to play */}
          {!self && <video ref={ref} autoPlay playsInline className="hidden" />}
          <div className="w-10 h-10 rounded-full bg-accent grid place-items-center text-white">
            {label[0]?.toUpperCase()}
          </div>
        </>
      )}
      <span className="absolute bottom-1 left-1 text-xs bg-black/60 px-1 rounded flex items-center gap-1">
        {muted && <MicOff size={12} className="text-red-400" />}
        {label.slice(0, 10)}
      </span>
    </div>
  );
}

function Ctrl({
  children,
  onClick,
  active,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 rounded-full grid place-items-center ${
        danger ? 'bg-red-500 text-white' : active ? 'bg-accent text-white' : 'bg-bg-soft'
      }`}
    >
      {children}
    </button>
  );
}
