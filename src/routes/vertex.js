const express = require("express");
var router = express.Router();
const vertexController = require('../controllers/vertex');

router.get("/test", async (req, res) => {
    res.json({ message: "Test vertex route !!!" });
});

// Get the summary of an audio 
router.post('/audio/summarize', vertexController.getAudioSummary);

// Get the transcription of an audio 
router.post('/audio/transcribe', vertexController.getAudioTranscription);

module.exports = router;
