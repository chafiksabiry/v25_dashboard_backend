const mongoose = require("mongoose");
require('./Transaction');

// ────────────────────────────────────────────────────────────────────────────
// Call schema — SYNCED with v25_dash_calls_backend/src/models/Call.js
//
// Both services read/write the same Mongo collection ("calls"). If you add
// or change a field here, mirror it in the calls backend (and vice versa).
// A shared package would be cleaner long-term; for now we keep two copies
// that we manually keep in sync.
// ────────────────────────────────────────────────────────────────────────────

const callSchema = new mongoose.Schema({
  call_id: {
    type: String,
    sparse: true,
    index: true,
    description: "Identifiant unique de l'appel fourni par Qalqul",
    required: function () {
      return this.provider === 'qalqul';
    }
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agent",
    required: true,
  },
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Lead",
  },
  sid: {
    type: String,
    required: function () {
      return this.provider === 'twilio';
    },
    unique: true,
  },
  parentCallSid: { type: String, default: null },
  direction: {
    type: String,
    enum: ["inbound", "outbound", "outbound-dial", "outbound-api", "Inbound", "Outbound"],
    default: "outbound",
    required: true,
  },
  from: { type: String, default: null },
  to:   { type: String, default: null },
  provider: { type: String, enum: ["twilio", "qalqul"] },
  startTime: { type: Date, required: true },
  endTime:   { type: Date, default: null },
  status:    { type: String, default: null },
  duration:  { type: Number, default: 0 },
  recording_url: String,
  recording_url_cloudinary: String,
  quality_score: { type: Number, min: 0, max: 100 },
  ai_call_score: {
    "Agent fluency":        { score: { type: Number, min: 0, max: 100 }, feedback: { type: String } },
    "Sentiment analysis":   { score: { type: Number, min: 0, max: 100 }, feedback: { type: String } },
    "Fraud detection":      { score: { type: Number, min: 0, max: 100 }, feedback: { type: String } },
    "Script coherence":     { score: { type: Number, min: 0, max: 100 }, feedback: { type: String } },
    "Argumentation":        { score: { type: Number, min: 0, max: 100 }, feedback: { type: String } },
    "Transaction analysis": { score: { type: Number, min: 0, max: 100 }, feedback: { type: String } },
    "overall":              { score: { type: Number, min: 0, max: 100 }, feedback: { type: String } },
    "transaction_detected": { type: Boolean, default: false },
    "refusal_detected":     { type: Boolean, default: false }
  },
  transcript: [{
    speaker: String,
    text: String,
    timestamp: String
  }],
  childCalls: [String],
  gigId:     { type: mongoose.Schema.Types.ObjectId, ref: "Gig" },
  companyId: { type: mongoose.Schema.Types.ObjectId },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  transactionOccurred: { type: Boolean, default: null },
  validByAI: { type: Boolean, default: null },
  valid:     { type: Boolean, default: null },
  /** Why the AI (or the auto-refusal rule) rejected the call. */
  ai_refusal_reason: { type: String, default: null },
  argumentation_score: { type: Number, default: 0 },

  price:                  { type: Number, default: 0 },
  repCallCommission:      { type: Number, default: 0 },
  platformCallCommission: { type: Number, default: 0 },

  // ──────────────────────────────────────────────────────────────────────────
  //  Unified call-analysis layer (see calls backend for details).
  // ──────────────────────────────────────────────────────────────────────────
  callOutcome: {
    type: String,
    enum: [
      'transaction',
      'appointment',
      'callback_requested',
      'argued_interested',
      'refusal',
      'not_interested',
      'already_insured',
      'voicemail',
      'no_answer',
      'busy',
      'wrong_number',
      'fraud',
      'too_short',
      'connected_no_sale',
    ],
    default: null,
    index: true,
  },
  callOutcomeSource: {
    type: String,
    enum: ['ai', 'rep', 'system'],
    default: null,
  },
  callbackAt:    { type: Date, default: null, index: true },
  appointmentAt: { type: Date, default: null, index: true },

  ai_call_status: {
    type: String,
    enum: ['pending', 'processing', 'scored', 'auto_refused', 'error'],
    default: 'pending',
    index: true,
  },
  ai_summary: { type: String, default: null },

  flags: {
    fraud:               { type: Boolean, default: false, index: true },
    serious:             { type: Boolean, default: false, index: true },
    transactionDetected: { type: Boolean, default: false },
    refusalDetected:     { type: Boolean, default: false },
  },

  companyValidation: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  agentValidation: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

callSchema.virtual('transaction', {
  ref: 'Transaction',
  localField: '_id',
  foreignField: 'call',
  justOne: true
});

callSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Call = mongoose.model("Call", callSchema);

module.exports = { Call };
