const mongoose = require('mongoose');

// When a user last opened a conversation (drives the unread badges)
const ChatReadSchema = new mongoose.Schema({
  user: { type: String, required: true },          // 'mentor:<id>' or 'mentee:<id>'
  conversation: { type: String, required: true },
  lastReadAt: { type: Date, default: Date.now },
});

ChatReadSchema.index({ user: 1, conversation: 1 }, { unique: true });

module.exports = mongoose.model('ChatRead', ChatReadSchema);
