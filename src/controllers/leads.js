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
exports.getLeadsByGigId = async (req, res) => {
  try {
    const { gigId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!gigId) {
      return res.status(400).json({
        success: false,
        message: "Gig ID is required"
      });
    }

    // Validate if gigId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(gigId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid gig ID format"
      });
    }

    // Get total count for pagination
    const total = await Lead.countDocuments({ gigId });

    // Get paginated leads
    const leads = await Lead.find({ gigId })
      .populate({
        path: 'assignedTo',
        select: 'name email',
        options: { lean: true }
      })
      .select('_id id Activity_Tag Deal_Name Email_1 Last_Activity_Time Phone Pipeline Stage refreshToken updatedAt gigId userId')
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
    console.error('Error in getLeadsByGigId:', err);
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
        { Email_1: { $regex: search, $options: 'i' } },
        { Phone: { $regex: search, $options: 'i' } },
        { Pipeline: { $regex: search, $options: 'i' } },
        { Stage: { $regex: search, $options: 'i' } }
      ]
    };

    // Get all matching leads without pagination
    const leads = await Lead.find(searchQuery)
      .populate({
        path: 'assignedTo',
        select: 'name email',
        options: { lean: true }
      })
      .select('_id id Activity_Tag Deal_Name Email_1 Last_Activity_Time Phone Pipeline Stage refreshToken updatedAt gigId userId')
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

// @desc    Create multiple leads
// @route   POST /api/leads/bulk
// @access  Private
exports.createLeadsBulk = async (req, res) => {
  try {
    const { leads } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Leads array is required"
      });
    }

    // Process leads to ensure they have correct IDs
    const leadsToInsert = leads.map(lead => {
      const { userId, gigId, ...leadData } = lead;
      return {
        ...leadData,
        // Ensure ObjectId format if strings are passed
        userId: userId?.$oid || userId || req.user?._id,
        gigId: gigId?.$oid || gigId || req.gig?._id,
        companyId: lead.companyId?.$oid || lead.companyId,
        updatedAt: new Date(),
        createdAt: new Date()
      };
    });

    // Use insertMany with ordered: false to continue if some fail (though we validate before)
    // But if we want atomicity, we shouldn't use ordered: false. 
    // Usually for bulk upload, we want all or nothing OR partial success.
    // Given the requirement "continue saving", partial success is better than fail all.
    const result = await Lead.insertMany(leadsToInsert, { ordered: false });

    res.status(201).json({
      success: true,
      count: result.length,
      data: result,
      message: `Successfully created ${result.length} leads`
    });

  } catch (err) {
    console.error('Error in createLeadsBulk:', err);
    // If it's a validation error or partial insertion error
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: err.message,
        details: err.errors
      });
    }
    // If some succeeded and some failed (bulkWriteError)
    if (err.insertedDocs && err.insertedDocs.length > 0) {
      return res.status(207).json({ // 207 Multi-Status
        success: true,
        partial: true,
        count: err.insertedDocs.length,
        data: err.insertedDocs,
        errors: err.writeErrors,
        message: `Created ${err.insertedDocs.length} leads with some errors`
      });
    }

    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};
