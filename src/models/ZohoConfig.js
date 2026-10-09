const mongoose = require('mongoose');

const zohoConfigSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  companyId: { type: String, required: true },
  access_token: { type: String, required: true },
  refresh_token: { type: String, required: true },
  client_id: { type: String, required: true },
  client_secret: { type: String, required: true },
  expires_in: { type: Number, required: true },
  updated_at: { type: Date, default: Date.now, required: true },
  lastUpdated: { type: Date, default: Date.now },
  /** CRM module this company imports from. */
  crmModule: { type: String, enum: ['Deals', 'Leads', 'Contacts'], default: 'Deals' },
  /**
   * HARX slot → Zoho api_name for this company.
   * Example: { Email_1: "Email", Phone: "Mobile", Deal_Name: "Full_Name" }
   */
  fieldMapping: { type: mongoose.Schema.Types.Mixed, default: null },
  /** Zoho api names to pull besides the mapped slots (stored on Lead.customFields). */
  zohoExtraFields: { type: [String], default: undefined }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes
zohoConfigSchema.index({ userId: 1, companyId: 1 });
zohoConfigSchema.index({ updated_at: -1 });

const ZohoConfig = mongoose.model('ZohoConfig', zohoConfigSchema);

module.exports = ZohoConfig; 