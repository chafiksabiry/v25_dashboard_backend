const express = require("express");
var router = express.Router();
const access = require('../middleware/access');

const speechToTextController = require('../controllers/speech-to-text');

router.get("/test", async (req, res) => {
    res.json({ message: "Test Speech To Text route !!!" });
});

// Genereate a transscription of a long audio to text
router.post('/transcribe', access.strictAuth, speechToTextController.transcribeLongAudio);

// Speech-to-Text aux frais de HARX : jeton exigé (seul appelant connu : l'espace rep, qui envoie le jeton). /test reste public.
module.exports = router;