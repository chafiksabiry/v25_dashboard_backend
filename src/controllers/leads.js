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
          attempts: { $sum: 1 },
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
          contacted: { $sum: "$contacted" },
          // "Exhausted" = >5 attempts and never contacted. These are the
          // leads we keep dialling without ever getting through, so they
          // should be retired from the active queue.
          exhausted: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ["$attempts", 5] }, { $eq: ["$contacted", 0] }] },
                1,
                0
              ]
            }
          },
          totalAttempts: { $sum: "$attempts" },
          // Attempt-count histogram: how many distinct leads have exactly
          // 1, 2, 3, 4 or ≥5 calls. Drives the "Distribution tentatives"
          // panel in the Leads view.
          one: { $sum: { $cond: [{ $eq: ["$attempts", 1] }, 1, 0] } },
          two: { $sum: { $cond: [{ $eq: ["$attempts", 2] }, 1, 0] } },
          three: { $sum: { $cond: [{ $eq: ["$attempts", 3] }, 1, 0] } },
          four: { $sum: { $cond: [{ $eq: ["$attempts", 4] }, 1, 0] } },
          fivePlus: { $sum: { $cond: [{ $gte: ["$attempts", 5] }, 1, 0] } }
        }
      }
    ]);

    const called = agg[0]?.called ?? 0;
    const contacted = agg[0]?.contacted ?? 0;
    const exhausted = agg[0]?.exhausted ?? 0;
    const totalAttempts = agg[0]?.totalAttempts ?? 0;
    const coveragePct = total > 0 ? Math.round((called / total) * 10000) / 100 : 0;
    const reachablePct = called > 0 ? Math.round((contacted / called) * 10000) / 100 : 0;
    const avgAttempts = called > 0 ? Math.round((totalAttempts / called) * 10) / 10 : 0;

    // Attempt distribution — percentages computed against the *called* pool
    // so they sum to 100%. The "Distribution tentatives" panel uses this.
    const pctOfCalled = (n) => (called > 0 ? Math.round((n / called) * 10000) / 100 : 0);
    const attemptDistribution = {
      one:      { count: agg[0]?.one      ?? 0, pct: pctOfCalled(agg[0]?.one      ?? 0) },
      two:      { count: agg[0]?.two      ?? 0, pct: pctOfCalled(agg[0]?.two      ?? 0) },
      three:    { count: agg[0]?.three    ?? 0, pct: pctOfCalled(agg[0]?.three    ?? 0) },
      four:     { count: agg[0]?.four     ?? 0, pct: pctOfCalled(agg[0]?.four     ?? 0) },
      fivePlus: { count: agg[0]?.fivePlus ?? 0, pct: pctOfCalled(agg[0]?.fivePlus ?? 0) }
    };

    // -------------------- Base quality breakdown --------------------
    // We only classify leads that have **at least one call attempt** — a
    // brand-new lead in the base carries no positive nor negative signal
    // yet, so claiming it is "valid joignable" would over-report the KPI
    // (e.g. 9 052/9 053 = 99.99% before a single dial). That bucket must
    // reflect *evidence of reachability*, not optimism.
    //
    //   wrong          → every call attempt hit an invalid/failed number
    //   alreadyEquipped→ AI refusal reason mentions an existing policy
    //   notAware       → AI refusal reason mentions ignorance of product
    //   notInterested  → AI flagged a refusal (catch-all for refusals)
    //   unreachable    → called but no call ever completed
    //   valid          → at least one call **completed** (lead picked up)
    //                    AND no negative classification above
    //
    // Leads with `hasCalls = false` are intentionally excluded from the
    // breakdown: they belong to a "pas encore appelés" set whose size is
    // `total - called` (already exposed via `coveragePct`).
    const qualityAgg = await Lead.aggregate([
      { $match: leadFilter },
      {
        $lookup: {
          from: "calls",
          localField: "_id",
          foreignField: "lead",
          as: "calls"
        }
      },
      { $match: { "calls.0": { $exists: true } } },
      {
        $project: {
          anyCompleted: {
            $anyElementTrue: {
              $map: {
                input: "$calls",
                as: "c",
                in: { $in: ["$$c.status", ["completed", "Completed"]] }
              }
            }
          },
          allInvalidPhone: {
            $cond: [
              { $eq: [{ $size: "$calls" }, 0] },
              false,
              {
                $allElementsTrue: {
                  $map: {
                    input: "$calls",
                    as: "c",
                    in: {
                      $in: [
                        { $toLower: { $ifNull: ["$$c.status", ""] } },
                        ["failed", "invalid", "no-route"]
                      ]
                    }
                  }
                }
              }
            ]
          },
          // Concatenate every refusal reason so a single regex pass covers
          // all the calls a given lead has accumulated.
          refusalReasons: {
            $reduce: {
              input: "$calls",
              initialValue: "",
              in: {
                $concat: [
                  "$$value",
                  " ",
                  { $ifNull: ["$$this.ai_refusal_reason", ""] }
                ]
              }
            }
          },
          anyRefusalFlag: {
            $anyElementTrue: {
              $map: {
                input: "$calls",
                as: "c",
                in: { $eq: ["$$c.ai_call_score.refusal_detected", true] }
              }
            }
          }
        }
      },
      {
        $project: {
          category: {
            $switch: {
              branches: [
                {
                  case: {
                    $regexMatch: {
                      input: "$refusalReasons",
                      regex: "déjà.*équip|already.*equip|déjà.*engag|already.*contract|déjà.*fourn|already.*supplier|déjà.*assur|already.*insur|assur.*déjà",
                      options: "i"
                    }
                  },
                  then: "alreadyEquipped"
                },
                {
                  case: {
                    $regexMatch: {
                      input: "$refusalReasons",
                      regex: "pas au courant|unaware|didn'?t know|connaiss|jamais entendu|never heard",
                      options: "i"
                    }
                  },
                  then: "notAware"
                },
                {
                  case: { $eq: ["$allInvalidPhone", true] },
                  then: "wrong"
                },
                {
                  case: { $eq: ["$anyRefusalFlag", true] },
                  then: "notInterested"
                },
                {
                  case: {
                    $regexMatch: {
                      input: "$refusalReasons",
                      regex: "pas intéress|not interested|refus",
                      options: "i"
                    }
                  },
                  then: "notInterested"
                },
                {
                  case: { $eq: ["$anyCompleted", true] },
                  then: "valid"
                }
              ],
              default: "unreachable"
            }
          }
        }
      },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]);

    const qualityBuckets = {
      valid: 0,
      unreachable: 0,
      wrong: 0,
      notInterested: 0,
      notAware: 0,
      alreadyEquipped: 0
    };
    for (const row of qualityAgg) {
      if (row._id && qualityBuckets.hasOwnProperty(row._id)) {
        qualityBuckets[row._id] = row.count;
      }
    }

    const pct = (n) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);
    const quality = {
      valid: { count: qualityBuckets.valid, pct: pct(qualityBuckets.valid) },
      unreachable: { count: qualityBuckets.unreachable, pct: pct(qualityBuckets.unreachable) },
      wrong: { count: qualityBuckets.wrong, pct: pct(qualityBuckets.wrong) },
      notInterested: { count: qualityBuckets.notInterested, pct: pct(qualityBuckets.notInterested) },
      notAware: { count: qualityBuckets.notAware, pct: pct(qualityBuckets.notAware) },
      alreadyEquipped: { count: qualityBuckets.alreadyEquipped, pct: pct(qualityBuckets.alreadyEquipped) }
    };
    // Base quality score = share of the *whole base* that was actually
    // reached on the phone (a real human picked up). This is what the
    // company cares about: how much of the uploaded list is usable.
    const qualityScorePct = total > 0
      ? Math.round((contacted / total) * 10000) / 100
      : 0;

    // -------------------- Lead status breakdown (CRM Stage / Activity_Tag) --------------------
    // The Leads dashboard tab shows pipeline statuses — not call coverage KPIs
    // (those live on the Appels tab). We bucket each lead from Stage, falling
    // back to Activity_Tag when Stage is empty.
    const statusAgg = await Lead.aggregate([
      { $match: leadFilter },
      {
        $project: {
          statusText: {
            $trim: {
              input: {
                $cond: [
                  {
                    $gt: [
                      { $strLenCP: { $ifNull: ["$Stage", ""] } },
                      0
                    ]
                  },
                  "$Stage",
                  { $ifNull: ["$Activity_Tag", ""] }
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          bucket: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$statusText", ""] },
                  then: "new"
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $toLower: "$statusText" },
                      regex:
                        "nouveau|^new$|new lead|fresh|non trait|non traité|à appeler|a appeler|to call|uncontacted|pas contact"
                    }
                  },
                  then: "new"
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $toLower: "$statusText" },
                      regex:
                        "qualif|qualified|chaud|hot lead|intéress|interested"
                    }
                  },
                  then: "qualified"
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $toLower: "$statusText" },
                      regex: "rdv|rendez|appointment|meeting"
                    }
                  },
                  then: "appointment"
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $toLower: "$statusText" },
                      regex:
                        "gagn|won|convert|closed won|signé|signed|transaction|client"
                    }
                  },
                  then: "won"
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $toLower: "$statusText" },
                      regex:
                        "perd|lost|closed lost|refus|archiv|rejet|reject|not interested|pas intéress"
                    }
                  },
                  then: "lost"
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $toLower: "$statusText" },
                      regex:
                        "cours|progress|working|en traitement|contacté|contacted|joign|assigned|ouvert|open"
                    }
                  },
                  then: "inProgress"
                }
              ],
              default: "other"
            }
          }
        }
      },
      { $group: { _id: "$bucket", count: { $sum: 1 } } }
    ]);

    const statusBuckets = {
      new: 0,
      inProgress: 0,
      qualified: 0,
      appointment: 0,
      won: 0,
      lost: 0,
      other: 0
    };
    for (const row of statusAgg) {
      if (row._id && statusBuckets.hasOwnProperty(row._id)) {
        statusBuckets[row._id] = row.count;
      } else if (row._id) {
        statusBuckets.other += row.count;
      }
    }

    const statusSummary = {
      new: { count: statusBuckets.new, pct: pct(statusBuckets.new) },
      inProgress: { count: statusBuckets.inProgress, pct: pct(statusBuckets.inProgress) },
      qualified: { count: statusBuckets.qualified, pct: pct(statusBuckets.qualified) },
      appointment: { count: statusBuckets.appointment, pct: pct(statusBuckets.appointment) },
      won: { count: statusBuckets.won, pct: pct(statusBuckets.won) },
      lost: { count: statusBuckets.lost, pct: pct(statusBuckets.lost) },
      other: { count: statusBuckets.other, pct: pct(statusBuckets.other) }
    };

    res.status(200).json({
      success: true,
      total,
      called,
      contacted,
      exhausted,
      avgAttempts,
      coveragePct,
      reachablePct,
      quality,
      qualityScorePct,
      attemptDistribution,
      statusSummary,
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

// @desc    Per-rep coverage progression for a company (Leads view → "Progression de couverture")
// @route   GET /api/leads/company/:companyId/rep-coverage
// @access  Private
// @query   gigId — optional; "all" or omit for whole company
// @query   limit — optional cap on the number of reps returned (default 10)
//
// Logic:
//   • Each rep = a User who placed at least one outbound call on this company.
//   • `current` = number of *distinct* leads that rep has called at least once.
//     (Re-dialling the same lead doesn't inflate the bar.)
//   • `target` = ceil(totalCompanyLeads / numReps) — i.e. the equal-share of
//     the company's lead pool. If we ever introduce a configurable quota per
//     rep, swap this in here.
exports.getCompanyRepCoverage = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { gigId } = req.query;
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 10));

    if (!companyId) {
      return res
        .status(400)
        .json({ success: false, message: "Company ID is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid company ID format" });
    }

    const companyObjId = new mongoose.Types.ObjectId(companyId);
    const gigObjId =
      gigId && gigId !== "all" && mongoose.Types.ObjectId.isValid(gigId)
        ? new mongoose.Types.ObjectId(gigId)
        : null;

    // Total leads in the pool (denominator for the fair-share target)
    const leadFilter = buildCompanyLeadFilter(companyId, gigId);
    const totalLeads = await Lead.countDocuments(leadFilter);

    // Calls scoped to this company (and optional gig), with a real lead + rep
    const callMatch = {
      companyId: companyObjId,
      lead: { $ne: null },
      userId: { $ne: null }
    };
    if (gigObjId) callMatch.gigId = gigObjId;

    const repAgg = await Call.aggregate([
      { $match: callMatch },
      // Collapse multiple calls of the same (rep, lead) pair down to one
      { $group: { _id: { userId: "$userId", lead: "$lead" } } },
      { $group: { _id: "$_id.userId", current: { $sum: 1 } } },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          current: 1,
          name: { $ifNull: ["$user.name", "Rep"] }
        }
      },
      { $sort: { current: -1 } },
      { $limit: limit }
    ]);

    const numReps = repAgg.length;
    // Fair-share target = pool / nb of reps. Floor of 1 so we never divide by 0.
    const target = numReps > 0 ? Math.ceil(totalLeads / numReps) : 0;

    const reps = repAgg.map((r) => ({
      userId: String(r.userId),
      name: r.name || "Rep",
      current: r.current,
      target,
      pct:
        target > 0
          ? Math.round((r.current / target) * 10000) / 100
          : 0
    }));

    res.status(200).json({
      success: true,
      gigId: gigObjId ? String(gigObjId) : null,
      totalLeads,
      target,
      reps
    });
  } catch (err) {
    console.error("Error in getCompanyRepCoverage:", err);
    res.status(400).json({ success: false, error: err.message });
  }
};
