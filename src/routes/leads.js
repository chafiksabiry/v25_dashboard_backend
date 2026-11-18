const express = require("express");
const access = require("../middleware/access");
const { Lead } = require("../models/Lead");
const {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  archiveLead,
  archiveLeads,
  analyzeLead,
  generateScript,
  getLeadsByUserId,
  getLeadsByPipelineAndStage,
  getLeadsByGigId,
  searchLeadsByGigId,

  hasCompanyLeads,
  getCompanyLeadStats,
  getCompanyRepCoverage,
  createLeadsBulk,
  claimCockpit,
  releaseCockpit,
  setDisposition,
  confirmDisposition,
} = require("../controllers/leads");

const router = express.Router();
const csvParser = require("csv-parser");
const multer = require("multer");

const storage = multer.memoryStorage(); // Stockage en mémoire
const upload = multer({ storage: storage });

// Contrôle d'accès : voir middleware/access.js (strict = jeton exigé ; compat = jeton contrôlé s'il est présent, sans jeton
// toléré tant que DASHBOARD_LEGACY_ANON n'est pas false). Gigs et prospects : membre de l'entreprise, ou rep inscrit au gig.
const gigOfBody = (req) => (req.body && req.body.gigId) || (req.query && req.query.gigId);
const gigsOfBulk = (req) => {
  const b = req.body || {};
  const fromLeads = Array.isArray(b.leads) ? b.leads.map((l) => l && l.gigId).filter(Boolean) : [];
  return [b.gigId, ...fromLeads].filter(Boolean);
};

// Import CSV sans gig ni entreprise : aucun appelant connu dans les applications actuelles -> jeton exigé.
router.post("/upload-csv", access.strictAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Aucun fichier reçu." });
    }

    const results = [];
    const buffer = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, "").trim();

    // Détection automatique du séparakteur
    const separator = buffer.includes(";") ? ";" : ",";
    console.log(`Utilisation du séparateur : '${separator}'`);

    const bufferStream = require("stream").Readable.from(buffer);

    bufferStream
      .pipe(csvParser({ separator }))
      .on("data", (row) => {
        console.log("Ligne brute lue :", row);

        // Mapping des colonnes du CSV vers les champs attendus
        const cleanedRow = {
          name: row["Deal_Name"] ? row["Deal_Name"].trim() : "",
          email: row["Email_1"] ? row["Email_1"].trim() : "",
          phone: row["Phone"] ? row["Phone"].trim() : "",
          company: row["Pipeline"] ? row["Pipeline"].trim() : "",
          stage: row["Stage"] ? row["Stage"].trim() : "",
        };

        console.log("Ligne après mapping :", cleanedRow);

        // Vérification des champs obligatoires
        if (
          !cleanedRow.name ||
          !cleanedRow.email ||
          !cleanedRow.phone ||
          !cleanedRow.company
        ) {
          console.warn(`Champs manquants pour la ligne :`, cleanedRow);
          return; // Ignore cette ligne
        }

        // Ajout du lead si toutes les validations passent
        results.push(cleanedRow);
      })
      .on("end", async () => {
        if (results.length > 0) {
          try {
            await Lead.insertMany(results);
            return res.status(200).json({
              success: true,
              message: `${results.length} leads ont été enregistrés avec succès.`,
              data: results,
            });
          } catch (dbError) {
            console.error(
              "Erreur lors de l'enregistrement dans la base de données:",
              dbError
            );
            return res.status(500).json({
              success: false,
              message: "Erreur lors de l'enregistrement des leads.",
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            message: "Aucun lead valide trouvé dans le fichier.",
          });
        }
      });
  } catch (error) {
    console.error("Erreur lors du traitement du fichier:", error);
    return res.status(500).json({ success: false, message: "Erreur serveur." });
  }
});


// Liste globale : jeton exigé, cantonnée à l'entreprise de l'appelant.
router.route("/")
  .get(access.strictAuth, access.membersOnly, access.scopeToCallerCompany, getLeads)
  .post(access.compatAuth, access.guardGig(gigOfBody, { allowReps: false }), access.pinCreatedLeadsCompany, createLead);
router.post("/bulk", access.compatAuth, access.guardGig(gigsOfBulk, { allowReps: false }), access.pinCreatedLeadsCompany, createLeadsBulk); // Add bulk creation route BEFORE /:id routes
router.post("/archive", access.compatAuth, access.guardGig(gigOfBody, { allowReps: false }), archiveLeads);
// Avant /:id (sinon « filter » est pris pour un identifiant).
router.route("/filter").get(access.strictAuth, access.membersOnly, access.scopeToCallerCompany, getLeadsByPipelineAndStage);
router.post("/:id/archive", access.compatAuth, access.guardLeadParam("id", { allowReps: false }), archiveLead);
router.post("/:id/cockpit-claim", access.compatAuth, access.guardLeadParam("id"), access.pinAgentFromToken, claimCockpit);
router.post("/:id/cockpit-release", access.compatAuth, access.guardLeadParam("id"), access.pinAgentFromToken, releaseCockpit);
router.put("/:id/disposition", access.compatAuth, access.guardLeadParam("id"), access.pinAgentFromToken, setDisposition);
router.put("/:id/disposition/confirm", access.compatAuth, access.guardLeadParam("id", { managersOnly: true }), confirmDisposition);
router.route("/:id")
  .get(access.compatAuth, access.guardLeadParam("id"), getLead)
  .put(access.compatAuth, access.guardLeadParam("id"), access.guardLeadUpdate, updateLead)
  .delete(access.compatAuth, access.guardLeadParam("id", { allowReps: false }), deleteLead);
router.route("/:id/analyze").post(access.compatAuth, access.guardLeadParam("id"), analyzeLead);
router.route("/:id/generate-script").post(access.compatAuth, access.guardLeadParam("id"), generateScript);
router.route("/user/:userId").get(access.compatAuth, access.guardSelfParam("userId"), getLeadsByUserId);
router.route("/gig/:gigId").get(access.compatAuth, access.guardGig((req) => req.params.gigId), access.pinListAgent, getLeadsByGigId);
router.route("/gig/:gigId/search").get(access.compatAuth, access.guardGig((req) => req.params.gigId), access.pinListAgent, searchLeadsByGigId);
router.route("/company/:companyId/has-leads").get(access.compatAuth, access.guardCompanyParam("companyId", { membersOnly: true }), hasCompanyLeads);
router.route("/company/:companyId/stats").get(access.compatAuth, access.guardCompanyParam("companyId", { membersOnly: true }), getCompanyLeadStats);
router.route("/company/:companyId/rep-coverage").get(access.compatAuth, access.guardCompanyParam("companyId", { membersOnly: true }), getCompanyRepCoverage);

module.exports = router;
