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

// Get the scoring of a call 
router.post('/call/score', vertexController.getCallScoring);

module.exports = router;
