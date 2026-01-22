const axios = require('axios');

// Telnyx API configuration
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_API_URL = 'https://api.telnyx.com/v2';

// Twilio API configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_API_URL = 'https://api.twilio.com/2010-04-01';

class PhoneNumberService {
    // Check if a gig has a phone number
    async checkGigNumber(gigId) {
        try {
            // TODO: Implement database check for gig phone number
            // For now, return a mock response
            return {
                hasNumber: false,
                message: 'No phone number assigned to this gig'
            };
        } catch (error) {
            console.error('Error checking gig number:', error);
            throw new Error('Failed to check gig number');
        }
    }

    // Search for available Telnyx phone numbers
    async searchTelnyxNumbers(countryCode) {
        try {
            if (!TELNYX_API_KEY) {
                console.warn('Telnyx API key not configured');
                return [];
            }

            const response = await axios.get(`${TELNYX_API_URL}/available_phone_numbers`, {
                headers: {
                    'Authorization': `Bearer ${TELNYX_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    'filter[country_code]': countryCode,
                    'filter[features]': 'sms,voice',
                    'filter[limit]': 10
                }
            });

            return response.data.data || [];
        } catch (error) {
            console.error('Error searching Telnyx numbers:', error.response?.data || error.message);
            throw new Error('Failed to search Telnyx phone numbers');
        }
    }

    // Search for available Twilio phone numbers
    async searchTwilioNumbers(countryCode) {
        try {
            if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
                console.warn('Twilio credentials not configured');
                return [];
            }

            const response = await axios.get(
                `${TWILIO_API_URL}/Accounts/${TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/${countryCode}/Local.json`,
                {
                    auth: {
                        username: TWILIO_ACCOUNT_SID,
                        password: TWILIO_AUTH_TOKEN
                    },
                    params: {
                        VoiceEnabled: true,
                        SmsEnabled: true,
                        Limit: 10
                    }
                }
            );

            return response.data.available_phone_numbers || [];
        } catch (error) {
            console.error('Error searching Twilio numbers:', error.response?.data || error.message);
            throw new Error('Failed to search Twilio phone numbers');
        }
    }

    // Purchase a Telnyx phone number
    async purchaseTelnyxNumber({ phoneNumber, gigId, companyId, requirementGroupId }) {
        try {
            if (!TELNYX_API_KEY) {
                throw new Error('Telnyx API key not configured');
            }

            const response = await axios.post(
                `${TELNYX_API_URL}/number_orders`,
                {
                    phone_numbers: [
                        {
                            phone_number: phoneNumber
                        }
                    ],
                    ...(requirementGroupId && {
                        regulatory_requirements: {
                            requirement_group_id: requirementGroupId
                        }
                    })
                },
                {
                    headers: {
                        'Authorization': `Bearer ${TELNYX_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // TODO: Save phone number to database with gigId and companyId

            return {
                phoneNumber,
                status: 'purchased',
                provider: 'telnyx',
                features: {
                    voice: true,
                    sms: true,
                    mms: true
                }
            };
        } catch (error) {
            console.error('Error purchasing Telnyx number:', error.response?.data || error.message);
            throw new Error('Failed to purchase Telnyx phone number');
        }
    }

    // Purchase a Twilio phone number
    async purchaseTwilioNumber({ phoneNumber, gigId, companyId }) {
        try {
            if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
                throw new Error('Twilio credentials not configured');
            }

            const response = await axios.post(
                `${TWILIO_API_URL}/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`,
                new URLSearchParams({
                    PhoneNumber: phoneNumber,
                    VoiceEnabled: 'true',
                    SmsEnabled: 'true'
                }),
                {
                    auth: {
                        username: TWILIO_ACCOUNT_SID,
                        password: TWILIO_AUTH_TOKEN
                    },
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            // TODO: Save phone number to database with gigId and companyId

            return {
                phoneNumber,
                status: 'purchased',
                provider: 'twilio',
                features: {
                    voice: true,
                    sms: true,
                    mms: true
                }
            };
        } catch (error) {
            console.error('Error purchasing Twilio number:', error.response?.data || error.message);
            throw new Error('Failed to purchase Twilio phone number');
        }
    }
}

module.exports = new PhoneNumberService();
