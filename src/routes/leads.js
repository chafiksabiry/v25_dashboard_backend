const express = require("express");
const { protect } = require("../middleware/auth");
const { Lead } = require("../models/Lead");
const {
  getLeads,
  getLead,
  createLead,
  updateLead,
  deleteLead,
  analyzeLead,
  generateScript,
  getLeadsByUserId,
  getLeadsByPipelineAndStage,
  getLeadsByGigId,
  searchLeadsByGigId,

  hasCompanyLeads,
  createLeadsBulk
} = require("../controllers/leads");

const router = express.Router();
const csvParser = require("csv-parser");
const multer = require("multer");

const storage = multer.memoryStorage(); // Stockage en mémoire
const upload = multer({ storage: storage });

router.post("/upload-csv", upload.single("file"), async (req, res) => {
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


router.route("/").get(getLeads).post(createLead);
router.post("/bulk", createLeadsBulk); // Add bulk creation route BEFORE /:id routes
router.route("/:id").get(getLead).put(updateLead).delete(deleteLead);
router.route("/:id/analyze").post(analyzeLead);
router.route("/:id/generate-script").post(generateScript);
router.route("/user/:userId").get(getLeadsByUserId);
router.route("/filter").get(getLeadsByPipelineAndStage);
router.route("/gig/:gigId").get(getLeadsByGigId);
router.route("/gig/:gigId/search").get(searchLeadsByGigId);
router.route("/company/:companyId/has-leads").get(hasCompanyLeads);



module.exports = router;
