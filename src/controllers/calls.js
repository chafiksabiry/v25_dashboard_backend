const { Call } = require('../models/Call');
const Transaction = require('../models/Transaction');
const { Lead } = require('../models/Lead');
const { Agent } = require('../models/Agent');
const { Gig } = require('../models/Gig');
const mongoose = require('mongoose');

async function markLeadContractSigned(leadId, agentId) {
  if (!leadId || !agentId || !mongoose.Types.ObjectId.isValid(String(leadId))) return;
  try {
    await Lead.updateOne(
      { _id: new mongoose.Types.ObjectId(String(leadId)) },
      {
        $set: {
          signedByAgent: new mongoose.Types.ObjectId(String(agentId)),
          signedAt: new Date(),
          assignedTo: new mongoose.Types.ObjectId(String(agentId)),
          updatedAt: new Date(),
        },
      }
    );
  } catch (err) {
    console.error('[markLeadContractSigned] failed:', err.message);
  }
}
/*
// @desc    Get all calls
// @route   GET /api/calls
// @access  Private
exports.getCalls = async (req, res) => {
  try {
    const calls = await Call.find()
      .populate('agent')
      .populate('lead');

    res.status(200).json({
      success: true,
      count: calls.length,
      data: calls
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Get single call
// @route   GET /api/calls/:id
// @access  Private
exports.getCall = async (req, res) => {
  try {
    const call = await Call.findById(req.params.id)
      .populate('agent')
      .populate('lead');

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Create new call
// @route   POST /api/calls
// @access  Private
exports.createCall = async (req, res) => {
  try {
    const call = await Call.create(req.body);

    res.status(201).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Update call
// @route   PUT /api/calls/:id
// @access  Private
exports.updateCall = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    End call
// @route   POST /api/calls/:id/end
// @access  Private
exports.endCall = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        duration: req.body.duration || 0,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Add note to call
// @route   POST /api/calls/:id/notes
// @access  Private
exports.addNote = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      { notes: req.body.note },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Update call quality score
// @route   PUT /api/calls/:id/quality-score
// @access  Private
exports.updateQualityScore = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      { quality_score: req.body.score },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
}; */
const { CallService } = require('../services/CallService');

const callService = new CallService();

// @desc    Get all calls
// @route   GET /api/calls
// @access  Private
exports.getCalls = async (req, res) => {
  try {
    const { 
      userId, 
      agentId, 
      leadId, 
      gigId, 
      companyId, 
      startDate, 
      endDate,
      populate 
    } = req.query;

    let query = {};

    // Basic filters
    if (userId) query.userId = userId;
    if (agentId) query.agent = agentId;
    if (leadId) query.lead = leadId;
    if (gigId) query.gigId = gigId;
    if (companyId) query.companyId = companyId;

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    let mongoQuery = Call.find(query);

    // Dynamic population
    if (populate === 'lead') {
      mongoQuery = mongoQuery.populate({
        path: 'lead',
        populate: {
          path: 'gigId',
          model: 'Gig'
        }
      }).populate('transaction');
    } else {
      mongoQuery = mongoQuery.populate('agent').populate({
        path: 'lead',
        populate: {
          path: 'gigId',
          model: 'Gig'
        }
      }).populate('transaction');
    }

    const calls = await mongoQuery.sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: calls.length,
      data: calls
    });
  } catch (err) {
    console.error('Error in getCalls:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Get single call
// @route   GET /api/calls/:id
// @access  Private
exports.getCall = async (req, res) => {
  try {
    const call = await Call.findById(req.params.id)
      .populate('agent')
      .populate('lead')
      .populate('transaction');

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Create new call
// @route   POST /api/calls
// @access  Private
exports.createCall = async (req, res) => {
  try {
    let call = await Call.create(req.body);

    if (call) {
      call = await Call.findById(call._id)
        .populate('agent')
        .populate('lead')
        .populate('transaction');
    }

    res.status(201).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Update call
// @route   PUT /api/calls/:id
// @access  Private
exports.updateCall = async (req, res) => {
  try {
    const callId = req.params.id;

    if (req.body.transaction) {
      const transactionData = req.body.transaction;
      const callObj = await Call.findById(callId);
      if (callObj) {
        const existingTx = await Transaction.findOne({ call: callId });
        const validByReps = transactionData.validByReps !== undefined ? transactionData.validByReps : (existingTx ? existingTx.validByReps : null);
        const validByCompany = transactionData.validByCompany !== undefined ? transactionData.validByCompany : (existingTx ? existingTx.validByCompany : null);
        const valid = (validByReps === true && validByCompany === true);

        await Transaction.findOneAndUpdate(
          { call: callId },
          {
            call: callId,
            agent: callObj.agent,
            lead: callObj.lead,
            gigId: callObj.gigId || undefined,
            companyId: callObj.companyId || undefined,
            validByReps,
            validByCompany,
            valid,
            updatedAt: new Date()
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (validByCompany === true) {
          await markLeadContractSigned(callObj.lead, callObj.agent);
        }
      }
      delete req.body.transaction;
    }

    if (req.body['transaction.validByReps'] !== undefined || req.body['transaction.validByCompany'] !== undefined) {
      const callObj = await Call.findById(callId);
      if (callObj) {
        const existingTx = await Transaction.findOne({ call: callId });
        const validByReps = req.body['transaction.validByReps'] !== undefined ? req.body['transaction.validByReps'] : (existingTx ? existingTx.validByReps : null);
        const validByCompany = req.body['transaction.validByCompany'] !== undefined ? req.body['transaction.validByCompany'] : (existingTx ? existingTx.validByCompany : null);
        const valid = (validByReps === true && validByCompany === true);

        await Transaction.findOneAndUpdate(
          { call: callId },
          {
            call: callId,
            agent: callObj.agent,
            lead: callObj.lead,
            gigId: callObj.gigId || undefined,
            companyId: callObj.companyId || undefined,
            validByReps,
            validByCompany,
            valid,
            updatedAt: new Date()
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        if (validByCompany === true) {
          await markLeadContractSigned(callObj.lead, callObj.agent);
        }
      }
      delete req.body['transaction.validByReps'];
      delete req.body['transaction.validByCompany'];
      delete req.body['transaction.valid'];
    }

    let call = await Call.findByIdAndUpdate(callId, req.body, {
      new: true,
      runValidators: true
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    call = await Call.findById(call._id)
      .populate('agent')
      .populate('lead')
      .populate('transaction');

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    End call
// @route   POST /api/calls/:id/end
// @access  Private
exports.endCall = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        duration: req.body.duration || 0,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Add note to call
// @route   POST /api/calls/:id/notes
// @access  Private
exports.addNote = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      { notes: req.body.note },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Update call quality score
// @route   PUT /api/calls/:id/quality-score
// @access  Private
exports.updateQualityScore = async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.id,
      { quality_score: req.body.score },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    res.status(200).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Initiate new call using OVH
// @route   POST /api/calls/initiate
// @access  Private
exports.initiateCall = async (req, res) => {
  try {
    const { agentId, phoneNumber } = req.body;

    if (!agentId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Please provide agent ID and phone number'
      });
    }

    const call = await callService.initiateCall(agentId, phoneNumber);

    res.status(201).json({
      success: true,
      data: call
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};

// @desc    Get gigs for a user (rep)
// @route   GET /api/calls/gigs
// @access  Private
exports.getCallsGigs = async (req, res) => {
  try {
    const { userId, agentId } = req.query;
    const rawIds = [userId, agentId].filter(Boolean);

    if (rawIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide user ID or agent ID'
      });
    }

    const objectIds = rawIds
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
      .map((id) => new mongoose.Types.ObjectId(String(id)));

    const [leadGigIds, callGigIds] = await Promise.all([
      Lead.distinct('gigId', {
        assignedTo: { $in: objectIds },
        gigId: { $ne: null }
      }),
      Call.distinct('gigId', {
        agent: { $in: objectIds },
        gigId: { $ne: null }
      })
    ]);

    const gigIds = [...new Set([...leadGigIds, ...callGigIds].map(String))];

    const gigs = gigIds.length
      ? await Gig.find({ _id: { $in: gigIds } }).select('title commission rewardBonus')
      : [];

    res.status(200).json({
      success: true,
      count: gigs.length,
      data: gigs
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
};