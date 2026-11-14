
const mongoose = require('mongoose');

const CommunityMessageSchema = new mongoose.Schema({
  cohort: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['mentor', 'mentee'],
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
  },
}, { timestamps: true });

CommunityMessageSchema.index({ cohort: 1, createdAt: 1 });

module.exports = mongoose.model('CommunityMessage', CommunityMessageSchema);
