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

// @desc    Get leads by pipeline and stage
// @route   GET /api/leads/filter
// @access  Private
exports.getLeadsByPipelineAndStage = async (req, res) => {
  try {
    const { pipeline, stage } = req.query;

    if (!pipeline || !stage) {
      return res.status(400).json({
        success: false,
        message: "Pipeline and stage parameters are required"
      });
    }

    const leads = await Lead.find({
      Pipeline: pipeline,
      Stage: stage
    }).populate("assignedTo");

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};
