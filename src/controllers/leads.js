const { Lead } = require("../models/Lead");
const { Call } = require("../models/Call");
const mongoose = require("mongoose");

/** Build the Mongo filter for leads belonging to a company (optional gig). */
function buildCompanyLeadFilter(companyId, gigId) {
  const filter = { companyId: new mongoose.Types.ObjectId(companyId) };
  if (gigId && gigId !== "all" && mongoose.Types.ObjectId.isValid(gigId)) {
    filter.gigId = new mongoose.Types.ObjectId(gigId);
  }
  return filter;
}

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

// @desc    Create multiple leads at once
// @route   POST /api/leads/bulk
// @access  Private
exports.createLeadsBulk = async (req, res) => {
  try {
    const { leads, gigId } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No leads provided or invalid format"
      });
    }

    console.log(`📝 Processing bulk creation of ${leads.length} leads`);

    // Add gigId and userId to each lead if not present
    const leadsToCreate = leads.map(lead => ({
      ...lead,
      gigId: lead.gigId || gigId || (req.gig ? req.gig._id : undefined),
      userId: lead.userId || (req.user ? req.user._id : undefined)
    }));

    // Use insertMany for better performance
    const createdLeads = await Lead.insertMany(leadsToCreate, { ordered: false });

    console.log(`✅ Successfully created ${createdLeads.length} leads`);

    res.status(201).json({
      success: true,
      count: createdLeads.length,
      data: createdLeads
    });
  } catch (err) {
    console.error('❌ Error in createLeadsBulk:', err);

    // Handle partial success with ordered: false
    if (err.code === 11000) { // Duplicate key error
      return res.status(207).json({ // 207 Multi-Status
        success: true,
        message: "Some leads were created, but duplicates were skipped",
        count: err.insertedDocs ? err.insertedDocs.length : 0,
        data: err.insertedDocs || []
      });
    }

    res.status(400).json({
      success: false,
      error: err.message
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

    const filter = buildCompanyLeadFilter(companyId, req.query.gigId);
    const count = await Lead.countDocuments(filter);

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

// @desc    Lead stats for company dashboard (total + called ≥1x, any call status)
// @route   GET /api/leads/company/:companyId/stats
// @access  Private
// @query   gigId — optional; omit or "all" for whole company
exports.getCompanyLeadStats = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { gigId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "Company ID is required"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid company ID format"
      });
    }

    if (gigId && gigId !== "all" && !mongoose.Types.ObjectId.isValid(gigId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid gig ID format"
      });
    }

    const leadFilter = buildCompanyLeadFilter(companyId, gigId);
    const total = await Lead.countDocuments(leadFilter);

    // We compute both "called" and "contacted" in a single aggregation:
    //   - called    = distinct leads with at least one call (any status)
    //   - contacted = distinct leads with at least one *completed* call
    //                 (i.e. the lead actually picked up / there was a response)
    const leadDocMatch = { "leadDoc.companyId": leadFilter.companyId };
    if (leadFilter.gigId) {
      leadDocMatch["leadDoc.gigId"] = leadFilter.gigId;
    }

    const agg = await Call.aggregate([
      {
        $match: {
          companyId: leadFilter.companyId,
          lead: { $exists: true, $ne: null }
        }
      },
      {
        $lookup: {
          from: "leads",
          localField: "lead",
          foreignField: "_id",
          as: "leadDoc"
        }
      },
      { $unwind: "$leadDoc" },
      { $match: leadDocMatch },
      {
        $group: {
          _id: "$lead",
          // 1 if at least one call for this lead was completed.
          contacted: {
            $max: {
              $cond: [
                { $in: ["$status", ["completed", "Completed"]] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          called: { $sum: 1 },
          contacted: { $sum: "$contacted" }
        }
      }
    ]);

    const called = agg[0]?.called ?? 0;
    const contacted = agg[0]?.contacted ?? 0;
    const coveragePct = total > 0 ? Math.round((called / total) * 10000) / 100 : 0;
    const reachablePct = called > 0 ? Math.round((contacted / called) * 10000) / 100 : 0;

    res.status(200).json({
      success: true,
      total,
      called,
      contacted,
      coveragePct,
      reachablePct,
      gigId: gigId && gigId !== "all" ? gigId : null
    });
  } catch (err) {
    console.error("Error in getCompanyLeadStats:", err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};
