const { Lead } = require("../models/Lead");
const { Call } = require("../models/Call");
const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");

/** Build the Mongo filter for leads belonging to a company (optional gig). */
function buildCompanyLeadFilter(companyId, gigId) {
  const filter = { companyId: new mongoose.Types.ObjectId(companyId) };
  if (gigId && gigId !== "all" && mongoose.Types.ObjectId.isValid(gigId)) {
    filter.gigId = new mongoose.Types.ObjectId(gigId);
  }
  return filter;
}

const COCKPIT_LOCK_MS = 5 * 60 * 1000;

const LEAD_LIST_SELECT =
  '_id id Activity_Tag Deal_Name First_Name Last_Name Email_1 Address Postal_Code City Date_of_Birth Last_Activity_Time Phone Telephony Pipeline Stage refreshToken updatedAt gigId userId cockpitLockedBy cockpitLockedAt cockpitLockExpiresAt signedByAgent signedAt assignedTo';

async function loadSignedLeadOwners(gigObjectId) {
  const map = new Map();
  const gigStr = String(gigObjectId);

  const signedLeads = await Lead.find({
    gigId: gigObjectId,
    signedByAgent: { $exists: true, $ne: null },
  })
    .select('_id signedByAgent')
    .lean();
  for (const row of signedLeads) {
    map.set(String(row._id), String(row.signedByAgent));
  }

  const txs = await Transaction.find({
    validByCompany: true,
    lead: { $exists: true, $ne: null },
  })
    .select('lead agent gigId')
    .lean();

  const leadIdsMissingGig = [
    ...new Set(
      txs.filter((tx) => !tx.gigId && tx.lead).map((tx) => String(tx.lead))
    ),
  ].filter((id) => mongoose.Types.ObjectId.isValid(id));

  let leadOnThisGig = new Set();
  if (leadIdsMissingGig.length > 0) {
    const leads = await Lead.find({
      _id: { $in: leadIdsMissingGig.map((id) => new mongoose.Types.ObjectId(id)) },
      gigId: gigObjectId,
    })
      .select('_id')
      .lean();
    leadOnThisGig = new Set(leads.map((l) => String(l._id)));
  }

  for (const tx of txs) {
    if (!tx.lead || !tx.agent) continue;
    const onGig =
      (tx.gigId && String(tx.gigId) === gigStr) ||
      leadOnThisGig.has(String(tx.lead));
    if (onGig) map.set(String(tx.lead), String(tx.agent));
  }
  return map;
}

async function loadCalledLeadIdsByAgent(gigObjectId, agentId) {
  const called = new Set();
  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) return called;

  const agentOid = new mongoose.Types.ObjectId(agentId);
  const gigStr = String(gigObjectId);

  const leadsOnGig = await Lead.find({ gigId: gigObjectId }).select('_id').lean();
  const leadIdsOnGig = leadsOnGig.map((l) => l._id);
  if (leadIdsOnGig.length === 0) return called;

  const calls = await Call.find({
    agent: agentOid,
    lead: { $in: leadIdsOnGig },
    $or: [
      { gigId: gigObjectId },
      { gigId: null },
      { gigId: { $exists: false } },
    ],
  })
    .select('lead gigId')
    .lean();

  for (const row of calls) {
    if (!row.lead) continue;
    const onGig =
      (row.gigId && String(row.gigId) === gigStr) ||
      leadIdsOnGig.some((id) => String(id) === String(row.lead));
    if (onGig) called.add(String(row.lead));
  }
  return called;
}

/** Lead IDs that have at least one call on the given gig (any rep). */
async function loadCalledLeadIdsForGig(gigObjectId) {
  const called = new Set();
  const gigStr = String(gigObjectId);

  const leadsOnGig = await Lead.find({ gigId: gigObjectId }).select('_id').lean();
  const leadIdsOnGig = leadsOnGig.map((l) => l._id);
  if (leadIdsOnGig.length === 0) return called;

  const calls = await Call.find({
    lead: { $in: leadIdsOnGig },
    $or: [
      { gigId: gigObjectId },
      { gigId: null },
      { gigId: { $exists: false } },
    ],
  })
    .select('lead gigId')
    .lean();

  for (const row of calls) {
    if (!row.lead) continue;
    const onGig =
      (row.gigId && String(row.gigId) === gigStr) ||
      leadIdsOnGig.some((id) => String(id) === String(row.lead));
    if (onGig) called.add(String(row.lead));
  }
  return called;
}

function annotateLeadsWithCallStatus(leads, calledLeadIds) {
  return leads.map((lead) => {
    const doc = typeof lead.toObject === 'function' ? lead.toObject() : { ...lead };
    const id = String(doc._id || doc.id);
    return { ...doc, hasBeenCalled: calledLeadIds.has(id) };
  });
}

function filterAndAnnotateLeadsForAgent(leads, agentId, signedOwners, calledLeadIds) {
  if (!agentId) {
    return leads.filter((lead) => {
      const id = String(lead._id || lead.id);
      return !signedOwners.has(id);
    });
  }
  const agentStr = String(agentId);
  return leads
    .filter((lead) => {
      const id = String(lead._id || lead.id);
      const owner = signedOwners.get(id);
      return !owner || owner === agentStr;
    })
    .map((lead) => {
      const doc = typeof lead.toObject === 'function' ? lead.toObject() : { ...lead };
      const id = String(doc._id || doc.id);
      const owner = signedOwners.get(id);
      const isSignedByMe = owner === agentStr;
      const isCalledByMe = !isSignedByMe && calledLeadIds.has(id);
      return {
        ...doc,
        isSignedByMe,
        isCalledByMe,
        signedByAgent: doc.signedByAgent || owner || null,
      };
    });
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function mulberry() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seed) {
  const arr = [...items];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}

function isCockpitLockActive(lead, now = new Date()) {
  if (!lead?.cockpitLockedBy) return false;
  if (!lead.cockpitLockExpiresAt) return true;
  return new Date(lead.cockpitLockExpiresAt) > now;
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

    const fallbackGigId = gigId || (req.gig ? req.gig._id : undefined);
    const fallbackUserId = req.user ? req.user._id : undefined;

    const normalizedLeads = leads.map((lead) => ({
      ...lead,
      gigId: lead.gigId || fallbackGigId,
      userId: lead.userId || fallbackUserId,
    }));

    const normalize = (value) =>
      typeof value === 'string' ? value.trim().toLowerCase() : '';

    const isPlaceholderEmail = (email) =>
      !email || email === 'no-email@placeholder.com';
    const isPlaceholderPhone = (phone) =>
      !phone || phone === 'no-phone@placeholder.com';

    const seenEmails = new Set();
    const seenPhones = new Set();
    const dedupedInPayload = [];
    let payloadDuplicates = 0;

    for (const lead of normalizedLeads) {
      const email = normalize(lead.Email_1);
      const phone = normalize(lead.Phone);

      const emailKey = !isPlaceholderEmail(email) ? `email:${email}` : null;
      const phoneKey = !isPlaceholderPhone(phone) ? `phone:${phone}` : null;

      if (
        (emailKey && seenEmails.has(emailKey)) ||
        (phoneKey && seenPhones.has(phoneKey))
      ) {
        payloadDuplicates += 1;
        continue;
      }

      if (emailKey) seenEmails.add(emailKey);
      if (phoneKey) seenPhones.add(phoneKey);
      dedupedInPayload.push(lead);
    }

    // Duplicate scope is PER GIG only — the same contact can exist in multiple gigs.
    const scopeGigIds = [...new Set(dedupedInPayload.map((l) => l.gigId).filter(Boolean).map(String))];

    let existingEmails = new Set();
    let existingPhones = new Set();

    if (scopeGigIds.length) {
      const candidateEmails = dedupedInPayload
        .map((l) => l.Email_1)
        .filter((v) => v && !isPlaceholderEmail(v));
      const candidatePhones = dedupedInPayload
        .map((l) => l.Phone)
        .filter((v) => v && !isPlaceholderPhone(v));

      const valueFilters = [];
      if (candidateEmails.length) valueFilters.push({ Email_1: { $in: candidateEmails } });
      if (candidatePhones.length) valueFilters.push({ Phone: { $in: candidatePhones } });

      if (valueFilters.length) {
        const existing = await Lead.find({
          $and: [
            { gigId: { $in: scopeGigIds } },
            { $or: valueFilters },
          ],
        })
          .select('Email_1 Phone')
          .lean();

        existingEmails = new Set(
          existing.map((l) => normalize(l.Email_1)).filter((v) => v && !isPlaceholderEmail(v))
        );
        existingPhones = new Set(
          existing.map((l) => normalize(l.Phone)).filter((v) => v && !isPlaceholderPhone(v))
        );
      }
    }

    let dbDuplicates = 0;
    const leadsToCreate = dedupedInPayload.filter((lead) => {
      const email = normalize(lead.Email_1);
      const phone = normalize(lead.Phone);
      const duplicate =
        (email && !isPlaceholderEmail(email) && existingEmails.has(email)) ||
        (phone && !isPlaceholderPhone(phone) && existingPhones.has(phone));
      if (duplicate) {
        dbDuplicates += 1;
        return false;
      }
      return true;
    });

    const skipped = payloadDuplicates + dbDuplicates;
    console.log(
      `🪞 Dedup: payload=${payloadDuplicates}, db=${dbDuplicates}, total skipped=${skipped}, inserting=${leadsToCreate.length}`
    );

    if (leadsToCreate.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All provided leads were duplicates and were skipped',
        count: 0,
        skipped,
        data: [],
      });
    }

    const createdLeads = await Lead.insertMany(leadsToCreate, { ordered: false });

    console.log(`✅ Successfully created ${createdLeads.length} leads (skipped ${skipped} duplicates)`);

    res.status(skipped > 0 ? 207 : 201).json({
      success: true,
      message:
        skipped > 0
          ? `${createdLeads.length} leads créés, ${skipped} doublons ignorés`
          : `${createdLeads.length} leads créés`,
      count: createdLeads.length,
      skipped,
      data: createdLeads,
    });
  } catch (err) {
    console.error('❌ Error in createLeadsBulk:', err);

    if (err.code === 11000) {
      return res.status(207).json({
        success: true,
        message: 'Some leads were created, but duplicates were skipped',
        count: err.insertedDocs ? err.insertedDocs.length : 0,
        data: err.insertedDocs || [],
      });
    }

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

    const agentId = String(req.query.agentId || '').trim();
    const signedOwners = await loadSignedLeadOwners(queryGigId);
    const calledLeadIds = await loadCalledLeadIdsByAgent(queryGigId, agentId);

    const shuffle =
      req.query.shuffle === '1' ||
      req.query.shuffle === 'true' ||
      req.query.random === '1' ||
      req.query.random === 'true';

    const allGigLeads = await Lead.find({ gigId: queryGigId })
      .populate({
        path: 'assignedTo',
        select: 'name email',
        options: { lean: true },
      })
      .select(LEAD_LIST_SELECT)
      .lean();

    let visibleLeads = filterAndAnnotateLeadsForAgent(allGigLeads, agentId, signedOwners, calledLeadIds);

    const leadStatus = String(req.query.leadStatus || 'all').toLowerCase();
    if (leadStatus === 'called') {
      visibleLeads = visibleLeads.filter((l) => l.isCalledByMe);
    } else if (leadStatus === 'signed') {
      visibleLeads = visibleLeads.filter((l) => l.isSignedByMe);
    }

    const callFilterGigParam = String(req.query.callFilterGigId || '').trim();
    let callFilterGigId = queryGigId;
    if (callFilterGigParam && mongoose.Types.ObjectId.isValid(callFilterGigParam)) {
      callFilterGigId = new mongoose.Types.ObjectId(callFilterGigParam);
    }

    const callFilter = String(req.query.callFilter || 'all').toLowerCase();
    const companyCalledIds = await loadCalledLeadIdsForGig(callFilterGigId);
    visibleLeads = annotateLeadsWithCallStatus(visibleLeads, companyCalledIds);

    if (callFilter === 'called') {
      visibleLeads = visibleLeads.filter((l) => l.hasBeenCalled);
    } else if (callFilter === 'not_called' || callFilter === 'notcalled') {
      visibleLeads = visibleLeads.filter((l) => !l.hasBeenCalled);
    }

    if (shuffle && agentId) {
      const day = new Date().toISOString().slice(0, 10);
      const seed = hashSeed(`${agentId}:${gigId}:${day}`);
      visibleLeads = seededShuffle(visibleLeads, seed);
    }

    const total = visibleLeads.length;
    const leads = visibleLeads.slice(skip, skip + limit);

    console.log(`📊 Found ${total} visible leads for agent on gig`);

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

// @desc    Claim cockpit access for a lead (first agent wins)
// @route   POST /api/leads/:id/cockpit-claim
exports.claimCockpit = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId, gigId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid lead ID' });
    }
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + COCKPIT_LOCK_MS);
    const agentObjectId = toObjectId(agentId);
    const leadObjectId = new mongoose.Types.ObjectId(id);

    const claimFilter = {
      _id: leadObjectId,
      $or: [
        { cockpitLockedBy: null },
        { cockpitLockExpiresAt: { $lt: now } },
        { cockpitLockExpiresAt: { $exists: false } },
        { cockpitLockedBy: agentObjectId },
      ],
    };
    if (gigId && mongoose.Types.ObjectId.isValid(gigId)) {
      claimFilter.gigId = new mongoose.Types.ObjectId(gigId);
    }

    const lead = await Lead.findOneAndUpdate(
      claimFilter,
      {
        $set: {
          cockpitLockedBy: agentObjectId,
          cockpitLockedAt: now,
          cockpitLockExpiresAt: expires,
        },
      },
      { new: true }
    ).select(LEAD_LIST_SELECT);

    if (lead) {
      return res.status(200).json({ success: true, data: lead });
    }

    const existing = await Lead.findById(leadObjectId).select(
      'cockpitLockedBy cockpitLockExpiresAt gigId'
    );
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }
    if (isCockpitLockActive(existing, now)) {
      return res.status(409).json({
        success: false,
        locked: true,
        lockedBy: String(existing.cockpitLockedBy),
        message: 'Lead is already open in another agent cockpit',
      });
    }

    return res.status(409).json({
      success: false,
      error: 'Could not claim cockpit for this lead',
    });
  } catch (err) {
    console.error('Error in claimCockpit:', err);
    res.status(400).json({ success: false, error: err.message });
  }
};

// @desc    Release cockpit lock when agent leaves cockpit
// @route   POST /api/leads/:id/cockpit-release
exports.releaseCockpit = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid lead ID' });
    }
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required' });
    }

    const agentObjectId = toObjectId(agentId);
    await Lead.findOneAndUpdate(
      { _id: id, cockpitLockedBy: agentObjectId },
      {
        $set: {
          cockpitLockedBy: null,
          cockpitLockedAt: null,
          cockpitLockExpiresAt: null,
        },
      }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error in releaseCockpit:', err);
    res.status(400).json({ success: false, error: err.message });
  }
};
