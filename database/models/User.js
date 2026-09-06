const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  pilotName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  passwordHash: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', UserSchema);
