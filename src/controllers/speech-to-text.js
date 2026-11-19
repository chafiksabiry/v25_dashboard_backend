const speechToTextService = require('../services/speech-to-text');
const { isCredentialsError } = require('../services/gcpCredentials');

exports.transcribeLongAudio = async (req, res) => {
    try {
        const { languageCode, fileUri } = req.body;
        console.log('languageCode', languageCode);
        console.log('fileUri', fileUri);

        if (!languageCode || !fileUri) {
            return res.status(400).json({ error: "Missing languageCode or fileUri in request body" });
        }

        const transcription = await speechToTextService.transcribeLongAudio(languageCode, fileUri);
        res.status(200).json({ transcription: transcription });
    } catch (error) {
        if (isCredentialsError(error)) return res.status(503).json({ error: error.message });
        res.status(500).json({ error: error.message });
    }
};