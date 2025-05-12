const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  refreshToken: {
    type: String,
    required: true
  },
  Project_Tags: { //
    type: [String],
    required: true
  },
  Last_Activity_Time: { //
    type: Date,
    required: true
  },
  Activity_Tag: String, //
  Deal_Name: { //
    type: String,
    required: true
  },
  Stage: { //
    type: String,
    required: true
  },
  Email_1: { //
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  Phone: { //
    type: String,
    required: true
  },
  Telephony: { //
    type: String,
    required: true
  },
  Contact_Name: { //
    name: {
      type: String,
      required: true
    },
    id: String
  },
  Pipeline: {
    type: String,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

leadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Lead = mongoose.model('Lead', leadSchema);

module.exports = { Lead };