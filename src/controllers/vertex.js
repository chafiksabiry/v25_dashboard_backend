const vertexService = require('../services/vertex');

// Get the summary of an audio 
exports.getAudioSummary = async (req, res) => {
    try {
        const { file_uri } = req.body;

        if (!file_uri) {
            return res.status(400).json({ error: 'file_uri is required' });
        }
        const response = await vertexService.getAudioSummary(file_uri);
        res.json(response);
    } catch (error) {
        console.error('Error during analyzing the udio:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Get the transcription of an audio 
exports.getAudioTranscription = async (req, res) => {
    try {
        const { file_uri } = req.body;

        if (!file_uri) {
            return res.status(400).json({ error: 'file_uri is required' });
        }
        const response = await vertexService.getAudioTranscription(file_uri);
        res.json(response);
    } catch (error) {
        console.error('Error during generating the audio transcription :', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Get the scoring of a call 
exports.getCallScoring = async (req, res) => {
    try {
        const { file_uri } = req.body;

        if (!file_uri) {
            return res.status(400).json({ error: 'file_uri is required' });
        }
        const response = await vertexService.getCallScoring(file_uri);
        res.json(response);
    } catch (error) {
        console.error('Error during scoring the call:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Get the scoring of a call 
exports.getCallPostActions = async (req, res) => {
    try {
        const { file_uri } = req.body;

        if (!file_uri) {
            return res.status(400).json({ error: 'file_uri is required' });
        }
        const response = await vertexService.getCallPostActions(file_uri);
        res.json(response);
    } catch (error) {
        console.error('Error during generating follow-up actions :', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};