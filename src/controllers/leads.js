const { Lead } = require("../models/Lead");
const mongoose = require("mongoose");

// @desc    Get all leads
// @route   GET /api/leads
// @access  Private
exports.getLeads = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const leads = await Lead.find()
      .populate("assignedTo")
      .skip(skip)
      .limit(limit);

    const total = await Lead.countDocuments();

    res.status(200).json({
      success: true,
      count: leads.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: leads,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};

// @desc    Get leads by user ID
// @route   GET /api/leads/user/:userId
// @access  Private
exports.getLeadsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required"
      });
    }

    // Validate if userId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user ID format"
      });
    }

    const leads = await Lead.find({
      $or: [
        { userId: userId },
        { assignedTo: userId }
      ]
    }).populate("assignedTo");

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (err) {
    console.error('Error in getLeadsByUserId:', err);
    res.status(400).json({
      success: false,
      error: err.message || "An error occurred while fetching leads"
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
    // Extraire userId et gigId de la requête
    const { userId, gigId, ...leadData } = req.body;

    // Créer le lead avec tous les champs
    const lead = await Lead.create({
      ...leadData,
      userId: userId || req.user?._id, // Utiliser userId de la requête ou l'ID de l'utilisateur connecté
      gigId: gigId || req.gig?._id // Utiliser gigId de la requête ou l'ID du gig actuel
    });

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
    // Extraire userId et gigId de la requête
    const { userId, gigId, ...updateData } = req.body;

    // Trouver d'abord le lead existant
    const existingLead = await Lead.findById(req.params.id);

    if (!existingLead) {
      return res.status(404).json({
        success: false,
        error: "Lead not found",
      });
    }

    // Mettre à jour le lead en préservant userId et gigId
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      {
        ...updateData,
        userId: userId || existingLead.userId, // Préserver l'userId existant si non fourni
        gigId: gigId || existingLead.gigId // Préserver le gigId existant si non fourni
      },
      {
        new: true,
        runValidators: true,
      }
    );

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

// @desc    Get leads by pipeline and stage
// @route   GET /api/leads/filter
// @access  Private
exports.getLeadsByPipelineAndStage = async (req, res) => {
  try {
    const { pipeline, stage } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!pipeline || !stage) {
      return res.status(400).json({
        success: false,
        message: "Pipeline and stage parameters are required"
      });
    }

    // Build the query
    const query = {
      Pipeline: pipeline,
      Stage: stage
    };

    // Get total count for pagination
    const total = await Lead.countDocuments(query);

    // Get paginated leads
    const leads = await Lead.find(query)
      .populate({
        path: 'assignedTo',
        select: 'name email', // Only select necessary fields
        options: { lean: true } // Use lean queries for better performance
      })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: leads.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: leads
    });
  } catch (err) {
    console.error('Error in getLeadsByPipelineAndStage:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Get leads by gig ID
// @route   GET /api/leads/gig/:gigId
// @access  Private
// @desc    Get leads by gig ID
// @route   GET /api/leads/gig/:gigId
// @access  Private
exports.getLeadsByGigId = async (req, res) => {
  try {
    let { gigId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    console.log("----------------------------------------------------");
    console.log("🚀 getLeadsByGigId REQUEST RECEIVED");
    console.log(`📥 Raw gigId from params: '${gigId}'`);

    if (!gigId) {
      return res.status(400).json({
        success: false,
        message: "Gig ID is required"
      });
    }

    // Clean whitespace
    gigId = gigId.trim();

    // Validate if gigId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(gigId)) {
      console.log(`❌ Invalid gigId format: '${gigId}'`);
      return res.status(400).json({
        success: false,
        error: "Invalid gig ID format"
      });
    }

    // Explicitly cast to ObjectId for the query
    const queryGigId = new mongoose.Types.ObjectId(gigId);
    console.log(`🔍 Querying MongoDB with gigId (ObjectId): ${queryGigId}`);

    // LOG THE QUERY before executing
    const query = { gigId: queryGigId };
    console.log("🛠️  Full Query Object:", JSON.stringify(query));

    // Get total count for pagination
    const total = await Lead.countDocuments(query);
    console.log(`📊 Found ${total} matching documents in 'leads' collection`);

    // Get paginated leads
    const leads = await Lead.find(query)
      .populate({
        path: 'assignedTo',
        select: 'name email',
        options: { lean: true }
      })
      .select('_id id Activity_Tag Deal_Name First_Name Last_Name Email_1 Address Postal_Code City Date_of_Birth Last_Activity_Time Phone Pipeline Stage refreshToken updatedAt gigId userId')
      .skip(skip)
      .limit(limit);

    console.log(`📤 Returning ${leads.length} leads in response`);
    console.log("----------------------------------------------------");

    res.status(200).json({
      success: true,
      count: leads.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: leads
    });
  } catch (err) {
    console.error('❌ Error in getLeadsByGigId:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Search leads by gig ID with search query
// @route   GET /api/leads/gig/:gigId/search
// @access  Private
exports.searchLeadsByGigId = async (req, res) => {
  try {
    const { gigId } = req.params;
    const { search } = req.query;

    if (!gigId) {
      return res.status(400).json({
        success: false,
        message: "Gig ID is required"
      });
    }

    if (!search || search.trim() === '') {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }

    // Validate if gigId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(gigId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid gig ID format"
      });
    }

    // Create search query for multiple fields
    const searchQuery = {
      gigId,
      $or: [
        { Deal_Name: { $regex: search, $options: 'i' } },
        { First_Name: { $regex: search, $options: 'i' } },
        { Last_Name: { $regex: search, $options: 'i' } },
        { Email_1: { $regex: search, $options: 'i' } },
        { Phone: { $regex: search, $options: 'i' } },
        { Pipeline: { $regex: search, $options: 'i' } },
        { Stage: { $regex: search, $options: 'i' } },
        { Activity_Tag: { $regex: search, $options: 'i' } },
        { Address: { $regex: search, $options: 'i' } },
        { Postal_Code: { $regex: search, $options: 'i' } },
        { City: { $regex: search, $options: 'i' } }
      ]
    };

    // Get all matching leads without pagination
    const leads = await Lead.find(searchQuery)
      .populate({
        path: 'assignedTo',
        select: 'name email',
        options: { lean: true }
      })
      .select('_id id Activity_Tag Deal_Name First_Name Last_Name Email_1 Address Postal_Code City Date_of_Birth Last_Activity_Time Phone Pipeline Stage refreshToken updatedAt gigId userId')
      .sort({ updatedAt: -1 }); // Sort by most recent first

    res.status(200).json({
      success: true,
      count: leads.length,
      total: leads.length,
      searchQuery: search,
      data: leads
    });
  } catch (err) {
    console.error('Error in searchLeadsByGigId:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Check if company has leads
// @route   GET /api/leads/company/:companyId/has-leads
// @access  Private
exports.hasCompanyLeads = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company ID is required"
      });
    }

    // Validate if companyId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid company ID format"
      });
    }

    // Check if there are any leads for this company
    const count = await Lead.countDocuments({ companyId });

    res.status(200).json({
      success: true,
      hasLeads: count > 0,
      count: count
    });
  } catch (err) {
    console.error('Error in hasCompanyLeads:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};
