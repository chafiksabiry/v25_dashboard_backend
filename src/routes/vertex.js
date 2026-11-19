const express = require("express");
var router = express.Router();
const access = require('../middleware/access');
const vertexController = require('../controllers/vertex');

router.get("/test", async (req, res) => {
    res.json({ message: "Test vertex route !!!" });
});

// Get the summary of an audio 
router.post('/audio/summarize', access.strictAuth, vertexController.getAudioSummary);

// Get the transcription of an audio 
router.post('/audio/transcribe', access.strictAuth, vertexController.getAudioTranscription);

// Get the scoring of a call 
router.post('/call/score', access.strictAuth, vertexController.getCallScoring);

// Get suggestions of follow-up actions
router.post('/call/post-actions', access.strictAuth, vertexController.getCallPostActions);

// Vertex AI aux frais de HARX : jeton exigé (seul appelant connu : l'espace rep, qui envoie le jeton). /test reste public.
module.exports = router;
