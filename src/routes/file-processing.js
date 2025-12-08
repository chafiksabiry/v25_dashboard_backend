const express = require('express');
const router = express.Router();

// Routes pour le traitement de fichiers
router.get('/', (req, res) => {
  res.json({ message: 'File processing route' });
});

module.exports = router;

