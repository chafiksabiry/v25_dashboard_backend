const speechToTextService = require('../services/speech-to-text');

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
        res.status(500).json({ error: error.message });
    }
};