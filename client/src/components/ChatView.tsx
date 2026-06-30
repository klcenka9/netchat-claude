import { useEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Hash, Reply, SmilePlus, Pin, Trash2, X, Search, MessagesSquare } from 'lucide-react';
import { useServerStore } from '../store/serverStore';
import { useChatStore, type Message } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useReadStateStore } from '../store/readStateStore';
import { getSocket } from '../api/socket';
import { uploadFile } from '../api/http';
import Avatar from './Avatar';
import EmojiPicker from './EmojiPicker';

export default function ChatView() {
  const { channels, activeServerId, activeChannelId } = useServerStore();
  const { messages, loadMessages, typing } = useChatStore();
  const me = useAuthStore((s) => s.me);
  const toggleChannelPanel = useUiStore((s) => s.toggleChannelPanel);
  const markChannelRead = useReadStateStore((s) => s.markChannelRead);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const channel = (channels[activeServerId ?? ''] ?? []).find((c) => c.id === activeChannelId);
  const list = activeChannelId ? messages[activeChannelId] ?? [] : [];

  useEffect(() => {
    if (!activeChannelId) return;
    loadMessages(activeChannelId);
    const socket = getSocket();
    socket?.emit('channel:join', { channelId: activeChannelId });
    return () => {
      socket?.emit('channel:leave', { channelId: activeChannelId });
    };
  }, [activeChannelId, loadMessages]);

  // Mark the channel read whenever the latest visible message changes.
  useEffect(() => {
    if (!activeChannelId || list.length === 0) return;
    const last = list[list.length - 1];
    markChannelRead(activeChannelId, last.id);
  }, [activeChannelId, list, markChannelRead]);

  if (!channel) {
    return (
      <div className="flex-1 bg-bg grid place-items-center text-muted">
        Select a channel to start chatting
      </div>
    );
  }

  const typers = Object.keys(typing[channel.id] ?? {}).filter((u) => u !== me?.id);

  return (
    <div className="flex-1 flex flex-col bg-bg min-w-0">
      <div className="h-12 px-4 flex items-center gap-2 border-b border-border shadow-sm shrink-0">
        <Hash size={20} className="text-muted" />
        <span className="font-semibold">{channel.name}</span>
        {channel.topic && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <span className="text-sm text-muted truncate">{channel.topic}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => toggleChannelPanel('threads')}
            title="Threads"
            className="text-muted hover:text-text p-1"
          >
            <MessagesSquare size={20} />
          </button>
          <button
            onClick={() => toggleChannelPanel('pins')}
            title="Pinned messages"
            className="text-muted hover:text-text p-1"
          >
            <Pin size={20} />
          </button>
          <button
            onClick={() => toggleChannelPanel('search')}
            title="Search"
            className="text-muted hover:text-text p-1"
          >
            <Search size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {list.length === 0 ? (
          <div className="h-full grid place-items-center text-muted">
            This is the beginning of #{channel.name}
          </div>
        ) : (
          <Virtuoso
            data={list}
            followOutput="smooth"
            initialTopMostItemIndex={list.length - 1}
            itemContent={(_i, m) => (
              <MessageRow key={m.id} m={m} mine={m.author?.id === me?.id} onReply={setReplyTo} />
            )}
          />
        )}
      </div>

      {typers.length > 0 && (
        <div className="px-4 text-xs text-muted h-5">
          {typers.length} {typers.length === 1 ? 'person is' : 'people are'} typing…
        </div>
      )}

      <Composer
        channel={channel}
        serverId={activeServerId}
        replyTo={replyTo}
        clearReply={() => setReplyTo(null)}
      />
    </div>
  );
}

function MessageRow({
  m,
  mine,
  onReply,
}: {
  m: Message;
  mine: boolean;
  onReply: (m: Message) => void;
}) {
  const [hover, setHover] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const name = m.webhook?.name ?? m.author?.display_name ?? 'Unknown';
  const avatarUser = m.webhook
    ? { display_name: m.webhook.name, avatar_url: m.webhook.avatar_url }
    : m.author ?? { display_name: 'Unknown', avatar_url: null };

  function del() {
    if (confirm('Delete this message?')) getSocket()?.emit('message:delete', { messageId: m.id });
  }
  function pin() {
    getSocket()?.emit('message:pin', { messageId: m.id, pinned: !m.pinned });
  }

  return (
    <div
      className="group px-4 py-1 hover:bg-bg-alt/40 relative flex gap-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Avatar user={avatarUser} size={40} />
      <div className="min-w-0 flex-1">
        {m.replyTo && (
          <div className="text-xs text-muted truncate mb-0.5">
            ↪ {m.replyTo.author?.display_name ?? 'someone'}: {m.replyTo.content}
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{name}</span>
          {m.webhook && (
            <span className="text-[10px] bg-accent text-white px-1 rounded">WEBHOOK</span>
          )}
          <span className="text-xs text-muted">{new Date(m.createdAt * 1000).toLocaleString()}</span>
          {m.editedAt && <span className="text-xs text-muted">(edited)</span>}
        </div>
        <div
          className="message-content text-text break-words"
          dangerouslySetInnerHTML={{ __html: m.contentHtml }}
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.classList.contains('spoiler')) t.classList.toggle('revealed');
          }}
        />
        {m.attachments.map((a) => (
          <Attachment key={a.id} a={a} />
        ))}
        {m.embed && (
          <div className="mt-1 border-l-4 border-accent bg-bg-alt rounded p-3 max-w-md">
            {m.embed.siteName && <div className="text-xs text-muted">{m.embed.siteName}</div>}
            {m.embed.title && (
              <a href={m.embed.url} target="_blank" className="text-accent font-medium block">
                {m.embed.title}
              </a>
            )}
            {m.embed.description && <div className="text-sm text-muted mt-1">{m.embed.description}</div>}
            {m.embed.image && <img src={m.embed.image} className="mt-2 rounded max-h-60" />}
          </div>
        )}
        {m.reactions.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => getSocket()?.emit('message:react', { messageId: m.id, emoji: r.emoji })}
                className="bg-bg-alt border border-border rounded px-1.5 py-0.5 text-sm"
              >
                {r.emoji.startsWith('custom:') ? '🟦' : r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
      </div>

      {(hover || pickerOpen) && (
        <div className="absolute right-4 -top-3 bg-bg-soft border border-border rounded flex">
          <div className="relative">
            <IconBtn onClick={() => setPickerOpen((v) => !v)} title="React">
              <SmilePlus size={16} />
            </IconBtn>
            {pickerOpen && (
              <EmojiPicker
                serverId={activeServerId}
                onClose={() => setPickerOpen(false)}
                onPick={(emoji) => {
                  getSocket()?.emit('message:react', { messageId: m.id, emoji });
                  setPickerOpen(false);
                }}
              />
            )}
          </div>
          <IconBtn onClick={() => onReply(m)} title="Reply"><Reply size={16} /></IconBtn>
          <IconBtn onClick={pin} title="Pin"><Pin size={16} /></IconBtn>
          {mine && (
            <IconBtn onClick={del} title="Delete">
              <Trash2 size={16} className="text-red-400" />
            </IconBtn>
          )}
        </div>
      )}
    </div>
  );
}

function Attachment({ a }: { a: { url: string; filename: string; mime_type: string } }) {
  if (a.mime_type.startsWith('image/')) {
    return <img src={a.url} alt={a.filename} className="mt-1 rounded max-h-80 max-w-md" />;
  }
  if (a.mime_type.startsWith('video/')) {
    return <video src={a.url} controls className="mt-1 rounded max-h-80 max-w-md" />;
  }
  return (
    <a href={a.url} target="_blank" className="mt-1 inline-block bg-bg-alt rounded px-3 py-2 text-accent">
      📎 {a.filename}
    </a>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 hover:bg-bg-alt text-muted hover:text-text">
      {children}
    </button>
  );
}

function Composer({
  channel,
  serverId,
  replyTo,
  clearReply,
}: {
  channel: { id: string; name: string };
  serverId: string | null;
  replyTo: Message | null;
  clearReply: () => void;
}) {
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const typingRef = useRef<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function send() {
    const content = text.trim();
    if (!content) return;
    getSocket()?.emit('message:send', {
      channelId: channel.id,
      content,
      replyToId: replyTo?.id,
    });
    setText('');
    clearReply();
  }

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (now - typingRef.current > 3000) {
      typingRef.current = now;
      getSocket()?.emit('typing:start', { channelId: channel.id });
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const att = await uploadFile<{
      url: string;
      filename: string;
      size_bytes: number;
      mime_type: string;
    }>(`/channels/${channel.id}/attachments`, file);
    getSocket()?.emit('message:send', {
      channelId: channel.id,
      content: text.trim() || undefined,
      attachmentIds: [att],
    });
    setText('');
  }

  return (
    <div className="px-4 pb-5">
      {replyTo && (
        <div className="bg-bg-alt rounded-t px-3 py-1.5 text-sm text-muted flex justify-between">
          <span>Replying to {replyTo.author?.display_name}</span>
          <button onClick={clearReply}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="bg-panel rounded-lg flex items-center px-4 relative">
        <button onClick={() => fileRef.current?.click()} className="text-muted hover:text-text text-2xl pr-3">
          +
        </button>
        <input ref={fileRef} type="file" hidden onChange={onFile} />
        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={`Message #${channel.name}`}
          className="flex-1 bg-transparent py-3 outline-none"
        />
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="text-muted hover:text-text pl-3"
          title="Emoji"
        >
          <SmilePlus size={22} />
        </button>
        {pickerOpen && (
          <EmojiPicker
            serverId={serverId}
            onClose={() => setPickerOpen(false)}
            onPick={(_emoji, display) => {
              setText((t) => t + display);
              setPickerOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
