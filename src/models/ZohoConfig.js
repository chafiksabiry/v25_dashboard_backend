const mongoose = require('mongoose');

const zohoConfigSchema = new mongoose.Schema({
  refreshToken: {
    type: String,
    required: true
  },
  clientId: {
    type: String,
    required: true
  },
  clientSecret: {
    type: String,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ZohoConfig', zohoConfigSchema); 