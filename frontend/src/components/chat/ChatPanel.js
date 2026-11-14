'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleGuard, handleAuthError } from '../../lib/useAuth';
import { getChatContacts, getChatConversations, getChatMessages, sendChatMessage } from '../../lib/api';
import Avatar from '../ui/Avatar';
import { Spinner, Alert } from '../ui/Common';
import '../ui/tn.css';
import './chat.css';

const POLL_MS = 4000;       // open conversation
const LIST_POLL_MS = 15000; // sidebar / unread badges
const MAX_LEN = 1000;

const COMMUNITY = { id: 'community', room: 'community', title: 'All mentees & mentors', subtitle: 'Community room. Everyone can read and reply.' };
const peerKey = (p) => `${p.role}:${p.id}`;

function timeLabel(d) {
  const dt = new Date(d);
  const sameDay = dt.toDateString() === new Date().toDateString();
  return sameDay
    ? dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : dt.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel() {
  const router = useRouter();
  const { ready, token, user } = useRoleGuard('mentee', 'mentor'); // admins are redirected away
  const [active, setActive] = useState(COMMUNITY);
  const [threads, setThreads] = useState([]);
  const [communityUnread, setCommunityUnread] = useState(0);
  const [contacts, setContacts] = useState(null);
  const [query, setQuery] = useState('');
  const [showPeople, setShowPeople] = useState(false); // mobile: sidebar vs. conversation
  const [error, setError] = useState('');

  const fail = useCallback((err) => { if (!handleAuthError(err, router)) setError(err.message); }, [router]);

  const loadThreads = useCallback(() => {
    getChatConversations(token)
      .then((d) => { setThreads(d.threads); setCommunityUnread(d.community.unread); })
      .catch(fail);
  }, [token, fail]);

  useEffect(() => {
    if (!ready) return;
    loadThreads();
    const t = setInterval(() => { if (!document.hidden) loadThreads(); }, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [ready, loadThreads]);

  // people list (debounced search)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      getChatContacts(token, query).then(setContacts).catch(fail);
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [ready, token, query, fail]);

  const open = (conv) => { setActive(conv); setShowPeople(false); setError(''); };
  const openPerson = (p) => open({ id: peerKey(p), peer: peerKey(p), title: p.name, subtitle: p.role === 'mentor' ? `Mentor${p.subtitle && p.subtitle !== 'Mentor' ? ` · ${p.subtitle}` : ''}` : `Mentee · ${p.subtitle || ''}`, person: p });

  if (!ready) return <div className="tn-page"><Spinner /></div>;

  const isMentor = user?.role === 'mentor';
  const threadPeers = new Set(threads.map((t) => peerKey(t.peer)));
  const unreadFor = (p) => threads.find((t) => peerKey(t.peer) === peerKey(p))?.unread || 0;

  return (
    <div className="tn-page">
      <div className="tn-container">
        <div className="tn-hero">
          <div>
            <h1>Chat</h1>
            <p>{isMentor ? 'Talk with mentees and fellow mentors, or answer questions in the community room.' : 'Ask questions in the community room, or message any mentor directly.'}</p>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className={`ch-shell${showPeople ? ' show-people' : ''}`}>
          <aside className="ch-side" aria-label="Conversations">
            <button className={`ch-item${active.id === 'community' ? ' active' : ''}`} onClick={() => open(COMMUNITY)}>
              <span className="ch-group-icon"><i className="fas fa-users" /></span>
              <span className="ch-item-text"><strong>Community room</strong><small>All mentees &amp; mentors</small></span>
              {communityUnread > 0 && active.id !== 'community' && <span className="ch-badge">{communityUnread > 99 ? '99+' : communityUnread}</span>}
            </button>

            {threads.length > 0 && <div className="ch-label">Recent chats</div>}
            {threads.map((t) => (
              <button key={t.conversation} className={`ch-item${active.id === peerKey(t.peer) ? ' active' : ''}`}
                onClick={() => openPerson({ ...t.peer, subtitle: t.peer.subtitle })}>
                <Avatar avatarKey={t.peer.avatar} name={t.peer.name} size={38} />
                <span className="ch-item-text"><strong>{t.peer.name}</strong><small>{t.lastMessage.text}</small></span>
                {t.unread > 0 && active.id !== peerKey(t.peer) && <span className="ch-badge">{t.unread > 99 ? '99+' : t.unread}</span>}
              </button>
            ))}

            <div className="ch-label">{isMentor ? 'Mentors & mentees' : 'Mentors'}</div>
            <input className="tn-input ch-search" placeholder={isMentor ? 'Search by name or enrollment no.' : 'Search mentors'} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
            {!contacts ? <Spinner /> : (
              <>
                <PeopleGroup title="Mentors" people={contacts.mentors} active={active} onPick={openPerson} unreadFor={unreadFor} skip={threadPeers} showAll={!!query} />
                {isMentor && <PeopleGroup title="Mentees" people={contacts.mentees} active={active} onPick={openPerson} unreadFor={unreadFor} skip={threadPeers} showAll={!!query} />}
                {contacts.mentors.length === 0 && contacts.mentees.length === 0 && <div className="tn-muted ch-none">No one found.</div>}
              </>
            )}
          </aside>

          <section className="ch-main">
            <Conversation key={active.id} conv={active} token={token} me={user} fail={fail} onSent={loadThreads} onBack={() => setShowPeople(true)} />
          </section>
        </div>
      </div>
    </div>
  );
}

function PeopleGroup({ title, people, active, onPick, unreadFor, skip, showAll }) {
  // without a search, hide people who already appear under "Recent chats"
  const list = showAll ? people : people.filter((p) => !skip.has(peerKey(p)));
  if (!list.length) return null;
  return (
    <>
      <div className="ch-sublabel">{title}</div>
      {list.map((p) => (
        <button key={peerKey(p)} className={`ch-item${active.id === peerKey(p) ? ' active' : ''}`} onClick={() => onPick(p)}>
          <Avatar avatarKey={p.avatar} name={p.name} size={34} />
          <span className="ch-item-text"><strong>{p.name}</strong><small>{p.subtitle}</small></span>
          {unreadFor(p) > 0 && active.id !== peerKey(p) && <span className="ch-badge">{unreadFor(p)}</span>}
        </button>
      ))}
    </>
  );
}

function Conversation({ conv, token, me, fail, onSent, onBack }) {
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const listRef = useRef(null);
  const stickRef = useRef(true);      // auto-scroll only if the reader is at the bottom
  const lastIdRef = useRef(null);
  const target = conv.peer ? { peer: conv.peer } : { room: 'community' };

  const scrollDown = () => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; };

  // first load
  useEffect(() => {
    let alive = true;
    getChatMessages(token, target)
      .then((d) => {
        if (!alive) return;
        setMessages(d.messages); setHasMore(d.hasMore);
        lastIdRef.current = d.messages.length ? d.messages[d.messages.length - 1]._id : null;
        requestAnimationFrame(scrollDown);
        onSent();
      })
      .catch((e) => { if (alive) { setMessages([]); fail(e); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id, token]);

  // poll for new messages
  useEffect(() => {
    if (messages === null) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const d = await getChatMessages(token, target, lastIdRef.current ? { after: lastIdRef.current } : {});
        if (!d.messages.length) return;
        lastIdRef.current = d.messages[d.messages.length - 1]._id;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m._id));
          return [...prev, ...d.messages.filter((m) => !seen.has(m._id))];
        });
      } catch (e) { fail(e); }
    }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages === null, conv.id, token]);

  useEffect(() => { if (stickRef.current) scrollDown(); }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadEarlier = async () => {
    if (!messages?.length) return;
    const el = listRef.current; const prevH = el.scrollHeight;
    try {
      const d = await getChatMessages(token, target, { before: messages[0]._id });
      stickRef.current = false;
      setMessages((prev) => [...d.messages, ...prev]); setHasMore(d.hasMore);
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevH; });
    } catch (e) { fail(e); }
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setErr('');
    try {
      const m = await sendChatMessage(token, target, body);
      setText('');
      lastIdRef.current = m._id;
      stickRef.current = true;
      setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
      onSent();
    } catch (ex) {
      if (!fail(ex)) setErr(ex.message);
    } finally { setSending(false); }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); };

  return (
    <>
      <header className="ch-head">
        <button className="ch-back" onClick={onBack} aria-label="Back to people"><i className="fas fa-arrow-left" /></button>
        {conv.person ? <Avatar avatarKey={conv.person.avatar} name={conv.person.name} size={40} /> : <span className="ch-group-icon"><i className="fas fa-users" /></span>}
        <div><strong>{conv.title}</strong><div className="tn-muted">{conv.subtitle}</div></div>
      </header>

      <div className="ch-list" ref={listRef} onScroll={onScroll} aria-live="polite">
        {messages === null ? <Spinner /> : (
          <>
            {hasMore && <button className="ch-earlier" onClick={loadEarlier}>Load earlier messages</button>}
            {messages.length === 0 && (
              <div className="ch-empty"><i className="fas fa-comments" /><p>{conv.peer ? `Say hello to ${conv.title}.` : 'No messages yet. Ask the first question.'}</p></div>
            )}
            {messages.map((m, i) => {
              const mine = String(m.senderId) === String(me.id);
              const grouped = i > 0 && messages[i - 1].senderId === m.senderId && new Date(m.createdAt) - new Date(messages[i - 1].createdAt) < 5 * 60000;
              return (
                <div key={m._id} className={`ch-row${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
                  {!mine && (grouped ? <span style={{ width: 32 }} /> : <Avatar avatarKey={m.senderAvatar} name={m.senderName} size={32} />)}
                  <div className="ch-bubble">
                    {!grouped && !mine && <div className="ch-meta"><strong>{m.senderName}</strong>{m.senderRole === 'mentor' && <span className="ch-tag">Mentor</span>}</div>}
                    <div className="ch-text">{m.text}</div>
                    <div className="ch-time">{timeLabel(m.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <form className="ch-compose" onSubmit={send}>
        {err && <div className="tn-alert error" role="alert" style={{ margin: '0 0 0.5rem' }}>{err}</div>}
        <div className="ch-compose-row">
          <textarea className="tn-input" rows={1} maxLength={MAX_LEN} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
            placeholder={conv.peer ? `Message ${conv.title}` : 'Ask a question to everyone'} aria-label="Write a message" />
          <button className="tn-btn" type="submit" disabled={sending || !text.trim()}><i className="fas fa-paper-plane" /> Send</button>
        </div>
        <div className="tn-muted ch-hint">Enter to send, Shift+Enter for a new line. Be kind and keep it on topic.</div>
      </form>
    </>
  );
}
