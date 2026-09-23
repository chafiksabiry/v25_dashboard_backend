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
  First_Name: {
    type: String,
    required: false
  },
  Last_Name: {
    type: String,
    required: false
  },
  Address: {
    type: String,
    required: false
  },
  Postal_Code: {
    type: String,
    required: false
  },
  City: {
    type: String,
    required: false
  },
  Date_of_Birth: {
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
      validator: function (v) {
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
  /** Agent currently in cockpit on this lead (exclusive lock). */
  cockpitLockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
  },
  cockpitLockedAt: {
    type: Date,
    default: null,
  },
  cockpitLockExpiresAt: {
    type: Date,
    default: null,
  },
  /** Agent who closed a validated contract on this lead (exclusive per gig). */
  signedByAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
  },
  signedAt: {
    type: Date,
    default: null,
  },
  Pipeline: {
    type: String,
    required: false
  },
  Created_Time: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },

  /**
   * REP-side disposition — updated by the REP after each contact attempt.
   * Values map to the official HARX call disposition ladder.
   */
  repDisposition: {
    type: String,
    enum: [
      null,
      'to_call',            // À appeler
      'called_unreachable', // Appelé - Injoignable
      'called_voicemail',   // Appelé - Répondeur
      'called_wrong_number',// Appelé - Numéro non attribué
      'called_callback',    // Appelé - Souhaite être rappelé
      'called_rdv',         // Appelé - RDV pris pour rappel
      'argued_rdv',         // Appel argumenté - RDV pris / délai réflexion
      'argued_declined',    // Appel argumenté - Transaction déclinée
      'argued_done',        // Appel argumenté - Transaction aboutie
    ],
    default: null,
  },
  repDispositionAt: { type: Date, default: null },
  repDispositionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  /**
   * Exclusive REP assignment after first meaningful contact
   * (called_rdv and above). Other REPs will no longer see this lead.
   */
  assignedRepId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  assignedRepAt: { type: Date, default: null },

  /**
   * Post-transaction follow-up calls (J+2 / J+7 / J+15).
   * Array of scheduled callbacks configured by the company.
   */
  followUpCalls: [{
    dayOffset: { type: Number },              // 2, 7 or 15
    scheduledAt: { type: Date },
    completedAt: { type: Date, default: null },
    repId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rewardAmount: { type: Number, default: 0 },
  }],
});

leadSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  // Backfill Created_Time for legacy documents on next save
  if (!this.Created_Time) {
    this.Created_Time = this.updatedAt;
  }
  next();
});

/**
 * Virtual: resolve creation date for legacy leads without Created_Time.
 * Priority: Created_Time → updatedAt → ObjectId timestamp.
 */
leadSchema.virtual('createdAtResolved').get(function () {
  if (this.Created_Time) return this.Created_Time;
  if (this.updatedAt)    return this.updatedAt;
  return this._id && this._id.getTimestamp ? this._id.getTimestamp() : null;
});

const Lead = mongoose.model('Lead', leadSchema);

module.exports = { Lead };