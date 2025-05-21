const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  gigId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gig',
    required: false
  },
  refreshToken: {
    type: String,
    required: false
  },
  id: {
    type: String,
    required: false
  },
  Last_Activity_Time: { //
    type: Date,
    required: false
  },
  Activity_Tag: String, //
  Deal_Name: { //
    type: String,
    required: false
  },
  Stage: { //
    type: String,
    required: false
  },
  Email_1: { //
    type: String,
    required: false,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  Phone: { //
    type: String,
    required: false
  },
  Telephony: { //
    type: String,
    required: false
  },
  Pipeline: {
    type: String,
    required: false
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