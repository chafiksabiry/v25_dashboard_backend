const { Call } = require('../models/Call');
const { Agent } = require('../models/Agent');
const { Lead } = require('../models/Lead');

/**
 * Lectures cantonnées à UNE entreprise : celle de l'appelant (access.scopeToCallerCompany, jamais un paramètre client).
 * Les agents n'ont pas de champ entreprise : ce sont ceux qui ont pris des appels de l'entreprise.
 */
async function companyAgentIds(companyId) {
  return Call.distinct('agent', { companyId, agent: { $ne: null } });
}

class AnalyticsRepository {
  async getOverviewData(companyId) {
    const [calls, agents, leads] = await Promise.all([
      Call.find({ companyId }),
      companyAgentIds(companyId).then((ids) => Agent.find({ _id: { $in: ids } })),
      Lead.find({ companyId })
    ]);

    return { calls, agents, leads };
  }

  async getCallMetrics(companyId) {
    return Call.find({ companyId })
      .populate('agent', 'name')
      .populate('lead', 'name company');
  }

  async getAgentMetrics(companyId) {
    const ids = await companyAgentIds(companyId);
    return Agent.find({ _id: { $in: ids } }).populate('user', 'name email');
  }

  async getQualityMetrics(companyId) {
    return Call.find({ companyId }).select('quality_score');
  }
}

module.exports = { AnalyticsRepository, companyAgentIds };
