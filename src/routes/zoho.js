const express = require('express');
const {
  redirectToZoho,
  zohoCallback,
  refreshToken,
  getLeads,
  saveLeads,
} = require("../controllers/zoho");

const router = express.Router();

router.get("/auth", redirectToZoho);
router.get("/auth/callback", zohoCallback);
router.get("/refresh-token", refreshToken);
router.get("/leads", getLeads);
router.post("/leads/save", saveLeads);


module.exports = router;
