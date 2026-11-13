
const mongoose = require('mongoose');

const ReplySchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mentee',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  }
}, { timestamps: true });

const DiscussionSchema = new mongoose.Schema({
  resource: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resource',
    required: true
  },

  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program',
    required: true
  },

  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mentee',
    required: true
  },

  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },

  replies: [ReplySchema],

  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mentee'
  }]

}, { timestamps: true });

DiscussionSchema.index({ resource: 1, createdAt: -1 });

module.exports = mongoose.model('Discussion', DiscussionSchema);