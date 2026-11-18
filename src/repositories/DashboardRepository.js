const { Call } = require('../models/Call');
const { Agent } = require('../models/Agent');
const { Lead } = require('../models/Lead');
const { companyAgentIds } = require('./AnalyticsRepository');

/** Lectures cantonnées à l'entreprise de l'appelant (access.scopeToCallerCompany). */
class DashboardRepository {
  async getStats(companyId) {
    return Promise.all([
      Call.find({ companyId }),
      companyAgentIds(companyId).then((ids) => Agent.find({ _id: { $in: ids } })),
      Lead.find({ companyId })
    ]);
  }

  async getLiveCalls(companyId) {
    return Call.find({ companyId, status: 'active' })
      .populate('agent', 'name')
      .populate('lead', 'name company');
  }

  async getTopGigs(companyId) {
    const ids = await companyAgentIds(companyId);
    return Agent.find({ _id: { $in: ids } })
      .sort({ 'performance.success_rate': -1 })
      .limit(5);
  }

  async getTopReps(companyId) {
    const ids = await companyAgentIds(companyId);
    return Agent.find({ _id: { $in: ids } })
      .sort({ rating: -1 })
      .limit(5);
  }
}

module.exports = { DashboardRepository };
