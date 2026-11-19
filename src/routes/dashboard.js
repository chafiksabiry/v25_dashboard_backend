const express = require('express');
const { authenticateUser } = require('../middleware/companyScope');
const access = require('../middleware/access');
const {
  getStats,
  getLiveCalls,
  getTopGigs,
  getTopReps
} = require('../controllers/dashboard');

const router = express.Router();

// Jeton exigé ; lectures cantonnées à l'entreprise de l'appelant (service d'inscription), jamais un paramètre client.
router.use(authenticateUser, access.membersOnly, access.scopeToCallerCompany);

router.get('/stats', getStats);
router.get('/live-calls', getLiveCalls);
router.get('/top-gigs', getTopGigs);
router.get('/top-reps', getTopReps);

module.exports = router;