const mongoose = require('mongoose');

// One document per chat message.
//   conversation: 'community' (everyone) or 'dm:<keyA>~<keyB>' (two people, keys sorted)
//   participants: only filled for direct messages, as ['mentor:<id>', 'mentee:<id>']
const ChatMessageSchema = new mongoose.Schema({
  conversation: { type: String, required: true, index: true },
  participants: { type: [String], default: undefined, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  senderRole: { type: String, enum: ['mentor', 'mentee'], required: true },
  senderName: { type: String, required: true },
  senderAvatar: { type: String, default: '' },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
}, { timestamps: { createdAt: true, updatedAt: false } });

ChatMessageSchema.index({ conversation: 1, _id: -1 });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
