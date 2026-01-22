const phoneNumberService = require('../services/PhoneNumberService');

// Check if a gig has a phone number
exports.checkGigNumber = async (req, res) => {
    try {
        const { gigId } = req.params;

        if (!gigId) {
            return res.status(400).json({
                success: false,
                error: 'Gig ID is required'
            });
        }

        const result = await phoneNumberService.checkGigNumber(gigId);

        res.status(200).json(result);
    } catch (error) {
        console.error('Error checking gig number:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check gig number'
        });
    }
};

// Search for available phone numbers (Telnyx)
exports.searchNumbers = async (req, res) => {
    try {
        const { countryCode } = req.query;

        if (!countryCode) {
            return res.status(400).json({
                success: false,
                error: 'Country code is required'
            });
        }

        const numbers = await phoneNumberService.searchTelnyxNumbers(countryCode);

        res.status(200).json(numbers);
    } catch (error) {
        console.error('Error searching Telnyx numbers:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to search phone numbers'
        });
    }
};

// Search for available phone numbers (Twilio)
exports.searchTwilioNumbers = async (req, res) => {
    try {
        const { countryCode } = req.query;

        if (!countryCode) {
            return res.status(400).json({
                success: false,
                error: 'Country code is required'
            });
        }

        const numbers = await phoneNumberService.searchTwilioNumbers(countryCode);

        res.status(200).json(numbers);
    } catch (error) {
        console.error('Error searching Twilio numbers:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to search phone numbers'
        });
    }
};

// Purchase a phone number (Telnyx)
exports.purchaseNumber = async (req, res) => {
    try {
        const { phoneNumber, gigId, companyId, requirementGroupId } = req.body;

        if (!phoneNumber || !gigId || !companyId) {
            return res.status(400).json({
                success: false,
                error: 'Phone number, gig ID, and company ID are required'
            });
        }

        const result = await phoneNumberService.purchaseTelnyxNumber({
            phoneNumber,
            gigId,
            companyId,
            requirementGroupId
        });

        res.status(200).json(result);
    } catch (error) {
        console.error('Error purchasing Telnyx number:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to purchase phone number'
        });
    }
};

// Purchase a phone number (Twilio)
exports.purchaseTwilioNumber = async (req, res) => {
    try {
        const { phoneNumber, gigId, companyId } = req.body;

        if (!phoneNumber || !gigId || !companyId) {
            return res.status(400).json({
                success: false,
                error: 'Phone number, gig ID, and company ID are required'
            });
        }

        const result = await phoneNumberService.purchaseTwilioNumber({
            phoneNumber,
            gigId,
            companyId
        });

        res.status(200).json(result);
    } catch (error) {
        console.error('Error purchasing Twilio number:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to purchase phone number'
        });
    }
};
