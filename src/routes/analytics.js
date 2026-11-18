const express = require('express');
const { authenticateUser } = require('../middleware/companyScope');
const access = require('../middleware/access');
const {
  getOverview,
  getCallMetrics,
  getAgentMetrics,
  getQualityMetrics
} = require('../controllers/analytics');

const router = express.Router();

// Jeton exigé ; lectures cantonnées à l'entreprise de l'appelant (service d'inscription), jamais un paramètre client.
router.use(authenticateUser, access.scopeToCallerCompany);

router.get('/overview', getOverview);
router.get('/calls', getCallMetrics);
router.get('/agents', getAgentMetrics);
router.get('/quality', getQualityMetrics);

module.exports = router;