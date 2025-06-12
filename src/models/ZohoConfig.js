const mongoose = require('mongoose');

const zohoConfigSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  access_token: { type: String, required: true },
  refresh_token: { type: String, required: true },
  expires_in: { type: Number, required: true },
  updated_at: { type: Date, required: true }
});

const ZohoConfig = mongoose.model('ZohoConfig', zohoConfigSchema);

module.exports = ZohoConfig; 