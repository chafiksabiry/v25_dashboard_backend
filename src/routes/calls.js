
const express = require('express');
const access = require('../middleware/access');
const {
  getCalls,
  getCall,
  createCall,
  updateCall,
  endCall,
  addNote,
  updateQualityScore,
  initiateCall,
  getCallsGigs
} = require('../controllers/calls');

const router = express.Router();

// Contrôle d'accès : voir middleware/access.js. Groupe compat : l'espace rep appelle encore /calls/gigs sans jeton.
router.use(access.compatAuth);

router.route('/gigs')
  .get(access.guardCallsQuery, getCallsGigs);

router.route('/')
  .get(access.guardCallsQuery, getCalls)
  .post(createCall);

router.route('/initiate')
  .post(initiateCall);

router.route('/:id')
  .get(access.guardCallParam('id'), getCall)
  .put(access.guardCallParam('id'), updateCall);

router.route('/:id/end')
  .post(access.guardCallParam('id'), endCall);

router.route('/:id/notes')
  .post(access.guardCallParam('id'), addNote);

router.route('/:id/quality-score')
  .put(access.membersOnly, access.guardCallParam('id'), updateQualityScore);

module.exports = router;