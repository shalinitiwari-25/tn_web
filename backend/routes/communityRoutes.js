
const express = require('express');
const mongoose = require('mongoose');
const CommunityMessage = require('../models/CommunityMessage');
const Program = require('../models/Program');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

const communityAuth = requireRole('mentor', 'mentee');

const checkCohortAccess = async (user, cohortId) => {
  if (user.role === 'mentor') {
    return await Program.findOne({
      _id: cohortId,
      mentors: user._id
    });
  }

  return user.programs.some(
    (programId) => String(programId) === String(cohortId)
  );
};

// Get messages
router.get('/cohorts/:id/messages', communityAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid cohort ID' });
    }

    const hasAccess = await checkCohortAccess(req.user, id);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await CommunityMessage.find({ cohort: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a message
router.post('/cohorts/:id/messages', communityAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const message = req.body.message?.trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid cohort ID' });
    }

    if (!message || message.length > 2000) {
      return res.status(400).json({
        error: 'Message must be between 1 and 2000 characters'
      });
    }

    const hasAccess = await checkCohortAccess(req.user, id);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const newMessage = await CommunityMessage.create({
      cohort: id,
      sender: req.user._id,
      senderRole: req.user.role,
      senderName: req.user.name,
      message
    });

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;