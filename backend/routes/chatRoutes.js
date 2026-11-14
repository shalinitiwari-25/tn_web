const express = require('express');
const Mentor = require('../models/Mentor');
const Mentee = require('../models/Mentee');
const ChatMessage = require('../models/ChatMessage');
const ChatRead = require('../models/ChatRead');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

// Chat is for mentors and mentees only. Admins get 403 from this guard on every route.
router.use(requireRole('mentor', 'mentee'));

const COMMUNITY = 'community';
const MAX_LEN = 1000;
const PAGE = 50;
const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const keyOf = (role, id) => `${role}:${id}`;
const dmKey = (a, b) => `dm:${[a, b].sort().join('~')}`;
const meKey = (req) => keyOf(req.user.role, req.user._id);

// Simple per-user flood limit: 15 messages per 30 seconds
const sent = new Map();
function tooFast(userKey) {
  const now = Date.now();
  const recent = (sent.get(userKey) || []).filter((t) => now - t < 30000);
  if (recent.length >= 15) { sent.set(userKey, recent); return true; }
  recent.push(now);
  sent.set(userKey, recent);
  return false;
}

// Turns "mentor:<id>" into a verified person. Only approved mentors and real mentees qualify.
async function resolvePeer(raw) {
  const [role, id] = String(raw || '').split(':');
  if (!['mentor', 'mentee'].includes(role) || !isId(id)) return null;
  if (role === 'mentor') {
    const m = await Mentor.findOne({ _id: id, status: 'approved' }).select('name avatar').lean();
    return m && { role, id: String(m._id), name: m.name, avatar: m.avatar || '' };
  }
  const m = await Mentee.findById(id).select('name avatar enrollmentNumber').lean();
  return m && { role, id: String(m._id), name: m.name, avatar: m.avatar || '', enrollmentNumber: m.enrollmentNumber };
}

// Mentees may message mentors (and the community room). Mentors may message mentors and mentees.
function canDirectMessage(req, peer) {
  if (keyOf(peer.role, peer.id) === meKey(req)) return false;
  if (req.user.role === 'mentee') return peer.role === 'mentor';
  return true;
}

// Works out which conversation a request is about, or sends the error itself and returns null
async function resolveConversation(req, res, { room, peer: rawPeer }) {
  if (rawPeer) {
    const peer = await resolvePeer(rawPeer);
    if (!peer) { res.status(404).json({ error: 'Person not found' }); return null; }
    if (!canDirectMessage(req, peer)) { res.status(403).json({ error: 'You cannot message this person' }); return null; }
    const a = meKey(req);
    const b = keyOf(peer.role, peer.id);
    return { key: dmKey(a, b), participants: [a, b], peer };
  }
  if (room === COMMUNITY) return { key: COMMUNITY, participants: undefined };
  res.status(400).json({ error: 'Choose a room or a person to chat with' });
  return null;
}

const shape = (m) => ({
  _id: m._id,
  text: m.text,
  senderId: m.senderId,
  senderRole: m.senderRole,
  senderName: m.senderName,
  senderAvatar: m.senderAvatar || '',
  createdAt: m.createdAt,
});

async function lastReadAt(userKey, conversation, fallback) {
  const r = await ChatRead.findOne({ user: userKey, conversation }).select('lastReadAt').lean();
  return r ? r.lastReadAt : fallback;
}

// like resolvePeer, but also finds mentors who are no longer approved (so old threads still show a name)
async function resolvePeerLoose(raw) {
  const [role, id] = String(raw || '').split(':');
  if (!isId(id)) return null;
  const Model = role === 'mentor' ? Mentor : role === 'mentee' ? Mentee : null;
  if (!Model) return null;
  const m = await Model.findById(id).select('name avatar enrollmentNumber').lean();
  return m && { role, id: String(m._id), name: m.name, avatar: m.avatar || '', subtitle: m.enrollmentNumber || '' };
}

// Direct-message threads for this user, newest first, with unread counts
async function loadThreads(req) {
  const me = meKey(req);
  const last = await ChatMessage.aggregate([
    { $match: { participants: me } },
    { $sort: { _id: -1 } },
    { $group: { _id: '$conversation', last: { $first: '$$ROOT' } } },
    { $sort: { 'last._id': -1 } },
    { $limit: 50 },
  ]);
  const reads = await ChatRead.find({ user: me, conversation: { $in: last.map((l) => l._id) } }).lean();
  const readMap = new Map(reads.map((r) => [r.conversation, r.lastReadAt]));

  return Promise.all(last.map(async (l) => {
    const m = l.last;
    const peerKey = m.participants.find((p) => p !== me);
    const unread = await ChatMessage.countDocuments({
      conversation: l._id,
      senderId: { $ne: req.user._id },
      createdAt: { $gt: readMap.get(l._id) || new Date(0) },
    });
    return { conversation: l._id, peer: peerKey, lastMessage: shape(m), unread };
  }));
}

async function communityUnread(req) {
  const since = await lastReadAt(meKey(req), COMMUNITY, req.user.createdAt || new Date(0));
  return ChatMessage.countDocuments({ conversation: COMMUNITY, senderId: { $ne: req.user._id }, createdAt: { $gt: since } });
}

// GET /api/chat/contacts?q=   people you can start a direct chat with
router.get('/contacts', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const re = q ? new RegExp(escapeRe(q), 'i') : null;

  const mentorFilter = { status: 'approved' };
  if (req.user.role === 'mentor') mentorFilter._id = { $ne: req.user._id };
  if (re) mentorFilter.name = re;
  const mentors = await Mentor.find(mentorFilter).select('name avatar programs').populate('programs', 'name').sort('name').limit(100).lean();

  let mentees = [];
  if (req.user.role === 'mentor') {
    const menteeFilter = re ? { $or: [{ name: re }, { enrollmentNumber: re }] } : {};
    mentees = await Mentee.find(menteeFilter).select('name avatar enrollmentNumber').sort('name').limit(100).lean();
  }

  res.json({
    mentors: mentors.map((m) => ({
      role: 'mentor', id: m._id, name: m.name, avatar: m.avatar || '',
      subtitle: (m.programs || []).map((p) => p.name).join(', ') || 'Mentor',
    })),
    mentees: mentees.map((m) => ({
      role: 'mentee', id: m._id, name: m.name, avatar: m.avatar || '', subtitle: m.enrollmentNumber,
    })),
  });
});

// GET /api/chat/conversations   recent direct chats + community unread count
router.get('/conversations', async (req, res) => {
  const threads = await loadThreads(req);

  // Attach the other person's current name / avatar
  const people = await Promise.all(threads.map((t) => resolvePeerLoose(t.peer)));
  const out = threads.map((t, i) => ({ ...t, peer: people[i] || { role: t.peer.split(':')[0], id: t.peer.split(':')[1], name: 'Unknown user', avatar: '' } }));

  res.json({ community: { unread: await communityUnread(req) }, threads: out });
});

// GET /api/chat/unread   total unread, for the navbar badge. Does not mark anything as read.
router.get('/unread', async (req, res) => {
  const [threads, community] = await Promise.all([loadThreads(req), communityUnread(req)]);
  res.json({ total: community + threads.reduce((n, t) => n + t.unread, 0) });
});

// GET /api/chat/messages?room=community  or  ?peer=mentor:<id>
//   (none)      latest 50 messages
//   after=<id>  only newer messages (used for polling)
//   before=<id> 50 older messages (Load earlier)
// Opening a conversation marks it as read.
router.get('/messages', async (req, res) => {
  const conv = await resolveConversation(req, res, { room: req.query.room, peer: req.query.peer });
  if (!conv) return;
  const { after, before } = req.query;
  if ((after && !isId(after)) || (before && !isId(before))) return res.status(400).json({ error: 'Invalid cursor' });

  let messages; let hasMore = false;
  if (after) {
    messages = await ChatMessage.find({ conversation: conv.key, _id: { $gt: after } }).sort({ _id: 1 }).limit(100).lean();
  } else {
    const filter = { conversation: conv.key };
    if (before) filter._id = { $lt: before };
    const rows = await ChatMessage.find(filter).sort({ _id: -1 }).limit(PAGE + 1).lean();
    hasMore = rows.length > PAGE;
    messages = rows.slice(0, PAGE).reverse();
  }

  await ChatRead.updateOne(
    { user: meKey(req), conversation: conv.key },
    { $set: { lastReadAt: new Date() } },
    { upsert: true }
  );
  res.json({ messages: messages.map(shape), hasMore });
});

// POST /api/chat/messages   Body: { room: 'community' } or { peer: 'mentor:<id>' }, plus { text }
router.post('/messages', async (req, res) => {
  const { room, peer, text } = req.body || {};
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) return res.status(400).json({ error: 'Message cannot be empty' });
  if (clean.length > MAX_LEN) return res.status(400).json({ error: `Message is too long (max ${MAX_LEN} characters)` });

  const conv = await resolveConversation(req, res, { room, peer });
  if (!conv) return;
  if (tooFast(meKey(req))) return res.status(429).json({ error: 'You are sending messages too fast. Wait a moment.' });

  const doc = await ChatMessage.create({
    conversation: conv.key,
    participants: conv.participants,
    senderId: req.user._id,
    senderRole: req.user.role,
    senderName: req.user.name,
    senderAvatar: req.user.avatar || '',
    text: clean,
  });
  // Your own message means you have read everything up to now
  await ChatRead.updateOne({ user: meKey(req), conversation: conv.key }, { $set: { lastReadAt: new Date() } }, { upsert: true });
  res.status(201).json(shape(doc));
});

module.exports = router;
