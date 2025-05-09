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
  // Données Zoho brutes
  Owner: {
    name: String,
    id: String,
    email: String
  },
  Project_Tags: [String],
  Nb_of_projects_Publish: Number,
  $currency_symbol: String,
  $field_states: mongoose.Schema.Types.Mixed,
  Activity: String,
  $sharing_permission: String,
  Last_Activity_Time: Date,
  Activity_Tag: String,
  $state: String,
  $process_flow: Boolean,
  Deal_Name: String,
  Stage: String,
  $locked_for_me: Boolean,
  id: String,
  $approved: Boolean,
  $approval: {
    delegate: Boolean,
    takeover: Boolean,
    approve: Boolean,
    reject: Boolean,
    resubmit: Boolean
  },
  Expected_Com_Pool: Number,
  Created_Time: Date,
  $wizard_connection_path: String,
  $editable: Boolean,
  Payment: String,
  Email_1: String,
  Targer_Countries: [String],
  Created_By: {
    name: String,
    id: String,
    email: String
  },
  Planning: String,
  $zia_owner_assignment: String,
  Date_d_inscription: Date,
  Description: String,
  $review_process: {
    approve: Boolean,
    reject: Boolean,
    resubmit: Boolean
  },
  $layout_id: {
    name: String,
    id: String
  },
  Visualisation_du_planning: String,
  Modified_By: {
    name: String,
    id: String,
    email: String
  },
  $review: mongoose.Schema.Types.Mixed,
  Lead_Conversion_Time: Date,
  Phone: String,
  Overall_Sales_Duration: Number,
  Telephony: String,
  leadchain0__Social_Lead_ID: String,
  Modified_Time: Date,
  $orchestration: Boolean,
  Contact_Name: {
    name: String,
    id: String
  },
  Pipeline: String,
  Sales_Cycle_Duration: Number,
  $in_merge: Boolean,
  Locked__s: Boolean,
  Tag: [String],
  $approval_state: String,
  Location: String,
  createdAt: {
    type: Date,
    default: Date.now
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