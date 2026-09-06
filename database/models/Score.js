const mongoose = require('mongoose');

const ScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  score: {
    type: Number,
    required: true,
    min: 0
  },
  distance: {
    type: Number,
    required: true,
    min: 0
  },
  coinsCollected: {
    type: Number,
    required: true,
    default: 0
  },
  achievedAt: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index for fast leaderboard querying
ScoreSchema.index({ score: -1, achievedAt: 1 });

module.exports = mongoose.model('Score', ScoreSchema);
