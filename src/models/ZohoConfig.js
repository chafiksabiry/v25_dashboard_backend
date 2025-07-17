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
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Index pour optimiser les requêtes
zohoConfigSchema.index({ userId: 1, companyId: 1 });
zohoConfigSchema.index({ updated_at: -1 });

const ZohoConfig = mongoose.model('ZohoConfig', zohoConfigSchema);

module.exports = ZohoConfig; 