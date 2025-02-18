const { Lead } = require("../models/Lead");
const { getLeads } = require("../services/integrations/zohoService");

// @desc    Get all leads
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    const leads = await Lead.find().populate("assignedTo");

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
exports.getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id).populate("assignedTo");

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: "Lead not found",
      });
    }

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private
exports.createLead = async (req, res) => {
  try {
    const lead = await Lead.create(req.body);

    res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
exports.updateLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: "Lead not found",
      });
    }

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private
exports.deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: "Lead not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

// @desc    Analyze lead using AI
// @route   POST /api/leads/:id/analyze
// @access  Private
exports.analyzeLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: "Lead not found",
      });
    }

    // Simulated AI analysis
    const analysis = {
      score: Math.floor(Math.random() * 30) + 70,
      sentiment: Math.random() > 0.5 ? "Positive" : "Neutral",
    };

    lead.metadata = {
      ...lead.metadata,
      ai_analysis: analysis,
    };

    await lead.save();

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

// @desc    Generate script for lead interaction
// @route   POST /api/leads/:id/generate-script
// @access  Private
exports.generateScript = async (req, res) => {
  try {
    const { type } = req.body;
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: "Lead not found",
      });
    }

    // Simulated script generation
    const script = {
      content: `Hello ${lead.name}, this is a ${type} script for ${lead.company}...`,
      type,
    };

    res.status(200).json({
      success: true,
      data: script,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

exports.getLeadsZoho = async (req, res) => {
  try {
    const leads = await getLeads();
    res.json(leads);
  } catch (error) {
    console.error("Erreur dans l'endpoint /leads : ", error.message);
    res.status(500).send("Erreur interne du serveur");
  }
};

// @desc    Store Zoho leads in database
// @route   POST /api/leads-zoho
// @access  Private
exports.storeLeadsZoho = async (req, res) => {
  try {
    let leadsFromZoho = [];
    let page = 1;
    let hasMore = true;

    // Récupérer les données de manière paginée
    while (hasMore) {
      const response = await getLeads({ page });  // Assurez-vous que la fonction getLeads accepte un paramètre `page`
      const data = response.data;  // Supposons que la réponse contient une propriété `data` avec les leads
      leadsFromZoho = [...leadsFromZoho, ...data];
      hasMore = response.info.more_records;  // Vérifier s'il y a plus de pages
      page += 1;  // Passer à la page suivante
    }

    if (!Array.isArray(leadsFromZoho) || leadsFromZoho.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Aucun lead trouvé dans Zoho",
      });
    }

    console.log("Leads récupérés depuis Zoho :", leadsFromZoho.length);

    const validLeads = leadsFromZoho
      .filter(lead => lead.Email && lead.Company && lead.Full_Name)
      .map(lead => ({
        name: lead.Full_Name,
        email: lead.Email,
        phone: lead.Phone || null,
        company: lead.Company,
        source: lead.Lead_Source || "Zoho",
        createdAt: new Date(lead.Created_Time),
      }));

    if (validLeads.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Aucun lead valide trouvé (manque email, company ou name)",
      });
    }

    // Insérer tous les leads, y compris les doublons
    const savedLeads = await Lead.insertMany(validLeads);

    res.status(201).json({
      success: true,
      count: savedLeads.length,
      message: "Leads Zoho stockés avec succès",
    });
  } catch (error) {
    console.error("Erreur lors de l'insertion des leads Zoho :", error.message);
    res.status(500).json({
      success: false,
      error: "Erreur serveur",
    });
  }
};


exports.getAllLeadsFromZoho = async () => {
  let allLeads = [];
  let page = 1;
  let moreRecords = true;

  while (moreRecords) {
    const response = await getLeads(page);
    if (response && response.leads && Array.isArray(response.leads)) {
      allLeads = allLeads.concat(response.leads);
      moreRecords = response.info.more_records;
      page++;
    } else {
      break;
    }
  }

  return allLeads;
};
