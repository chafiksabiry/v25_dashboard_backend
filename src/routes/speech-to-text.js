const express = require("express");
var router = express.Router();

const speechToTextController = require('../controllers/speech-to-text');

router.get("/test", async (req, res) => {
    res.json({ message: "Test Speech To Text route !!!" });
});

// Genereate a transscription of a long audio to text
router.post('/transcribe', speechToTextController.transcribeLongAudio);

module.exports = router;