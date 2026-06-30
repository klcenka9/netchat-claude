import { useEffect, useState } from 'react';
import { X, MessagesSquare, ArrowLeft } from 'lucide-react';
import { api } from '../api/http';
import { getSocket } from '../api/socket';
import { useUiStore } from '../store/uiStore';
import { useChatStore } from '../store/chatStore';
import { useServerStore, type Channel } from '../store/serverStore';
import Avatar from './Avatar';

export default function ThreadPanel({ parentChannelId }: { parentChannelId: string }) {
  const { activeThreadId, openThread, closeThread, setChannelPanel } = useUiStore();
  const [threads, setThreads] = useState<Channel[]>([]);
  const upsertChannel = useServerStore((s) => s.upsertChannel);

  async function loadThreads() {
    try {
      setThreads(await api<Channel[]>(`/channels/${parentChannelId}/threads`));
    } catch {
      setThreads([]);
    }
  }

  useEffect(() => {
    loadThreads();
    closeThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentChannelId]);

  function create() {
    const name = prompt('Thread name:');
    if (!name?.trim()) return;
    getSocket()?.emit(
      'thread:create',
      { channelId: parentChannelId, sourceMessageId: parentChannelId, name: name.trim() },
      (res: { ok?: boolean; thread?: Channel; error?: string }) => {
        if (res?.thread) {
          upsertChannel(res.thread);
          setThreads((t) => [...t, res.thread!]);
          openThread(res.thread.id);
        }
      },
    );
  }

  return (
    <div className="w-80 bg-bg-alt border-l border-border flex flex-col shrink-0">
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          {activeThreadId && (
            <button onClick={closeThread} className="text-muted hover:text-text">
              <ArrowLeft size={18} />
            </button>
          )}
          <MessagesSquare size={18} /> Threads
        </div>
        <button onClick={() => setChannelPanel('none')} className="text-muted hover:text-text">
          <X size={20} />
        </button>
      </div>

      {activeThreadId ? (
        <ThreadConversation threadId={activeThreadId} />
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={create}
            className="w-full bg-accent text-white rounded py-1.5 text-sm mb-2"
          >
            + New Thread
          </button>
          {threads.length === 0 ? (
            <div className="text-muted text-sm p-2">No active threads.</div>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className="w-full text-left flex items-center gap-2 p-2 rounded hover:bg-bg-soft text-sm"
              >
                <MessagesSquare size={16} className="text-muted" />
                <span className="truncate">{t.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ThreadConversation({ threadId }: { threadId: string }) {
  const { messages, loadMessages } = useChatStore();
  const [text, setText] = useState('');
  const list = messages[threadId] ?? [];

  useEffect(() => {
    loadMessages(threadId);
    const socket = getSocket();
    socket?.emit('channel:join', { channelId: threadId });
    return () => {
      socket?.emit('channel:leave', { channelId: threadId });
    };
  }, [threadId, loadMessages]);

  function send() {
    const content = text.trim();
    if (!content) return;
    getSocket()?.emit('thread:message:send', { channelId: threadId, content });
    setText('');
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {list.length === 0 && <div className="text-muted text-sm">No messages yet.</div>}
        {list.map((m) => (
          <div key={m.id} className="flex gap-2">
            <Avatar user={m.author ?? { display_name: '?', avatar_url: null }} size={28} />
            <div className="min-w-0">
              <div className="text-xs text-muted">{m.author?.display_name ?? 'Unknown'}</div>
              <div
                className="text-sm break-words"
                dangerouslySetInnerHTML={{ __html: m.contentHtml }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-border">
        <div className="bg-panel rounded flex items-center px-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Message thread"
            className="flex-1 bg-transparent py-2 outline-none text-sm"
          />
        </div>
      </div>
    </>
  );
}
