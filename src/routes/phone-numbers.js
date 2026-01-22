const express = require('express');
const router = express.Router();
const phoneNumberController = require('../controllers/phoneNumbers');

// Check if gig has a phone number
router.get('/gig/:gigId/check', phoneNumberController.checkGigNumber);

// Search for available phone numbers (Telnyx)
router.get('/search', phoneNumberController.searchNumbers);

// Search for available phone numbers (Twilio)
router.get('/search/twilio', phoneNumberController.searchTwilioNumbers);

// Purchase a phone number (Telnyx)
router.post('/purchase', phoneNumberController.purchaseNumber);

// Purchase a phone number (Twilio)
router.post('/purchase/twilio', phoneNumberController.purchaseTwilioNumber);

module.exports = router;
