/**
 * One-time backfill for existing calls / validated transactions.
 *
 * 1. Sets lead.signedByAgent from transactions where validByCompany === true
 * 2. Backfills call.gigId from lead when missing
 * 3. Backfills transaction.gigId from call when missing
 *
 * Usage (from v25_dashboard_backend):
 *   node scripts/backfill-lead-call-status.js
 *   node scripts/backfill-lead-call-status.js --dry-run
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { config } = require('../src/config/env');
const { Lead } = require('../src/models/Lead');
const { Call } = require('../src/models/Call');
const Transaction = require('../src/models/Transaction');

const dryRun = process.argv.includes('--dry-run');

async function backfillSignedLeads() {
  const txs = await Transaction.find({
    validByCompany: true,
    lead: { $exists: true, $ne: null },
    agent: { $exists: true, $ne: null },
  })
    .select('lead agent')
    .lean();

  let updated = 0;
  for (const tx of txs) {
    const leadId = tx.lead;
    const agentId = tx.agent;
    const existing = await Lead.findById(leadId).select('signedByAgent').lean();
    if (!existing) continue;
    if (existing.signedByAgent && String(existing.signedByAgent) === String(agentId)) {
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] lead ${leadId} → signedByAgent ${agentId}`);
    } else {
      await Lead.updateOne(
        { _id: leadId },
        {
          $set: {
            signedByAgent: agentId,
            signedAt: new Date(),
            assignedTo: agentId,
            updatedAt: new Date(),
          },
        }
      );
    }
    updated += 1;
  }
  return { txs: txs.length, updated };
}

async function backfillCallGigIds() {
  const calls = await Call.find({
    lead: { $exists: true, $ne: null },
    $or: [{ gigId: null }, { gigId: { $exists: false } }],
  })
    .select('_id lead')
    .lean();

  let updated = 0;
  for (const call of calls) {
    const lead = await Lead.findById(call.lead).select('gigId').lean();
    if (!lead?.gigId) continue;
    if (dryRun) {
      console.log(`[dry-run] call ${call._id} → gigId ${lead.gigId}`);
    } else {
      await Call.updateOne({ _id: call._id }, { $set: { gigId: lead.gigId } });
    }
    updated += 1;
  }
  return { calls: calls.length, updated };
}

async function backfillTransactionGigIds() {
  const txs = await Transaction.find({
    call: { $exists: true, $ne: null },
    $or: [{ gigId: null }, { gigId: { $exists: false } }],
  })
    .select('_id call lead')
    .lean();

  let updated = 0;
  for (const tx of txs) {
    let gigId = null;
    const call = await Call.findById(tx.call).select('gigId lead').lean();
    if (call?.gigId) {
      gigId = call.gigId;
    } else if (tx.lead || call?.lead) {
      const lead = await Lead.findById(tx.lead || call.lead).select('gigId').lean();
      gigId = lead?.gigId || null;
    }
    if (!gigId) continue;
    if (dryRun) {
      console.log(`[dry-run] transaction ${tx._id} → gigId ${gigId}`);
    } else {
      await Transaction.updateOne({ _id: tx._id }, { $set: { gigId } });
    }
    updated += 1;
  }
  return { txs: txs.length, updated };
}

async function main() {
  console.log(dryRun ? '=== DRY RUN ===' : '=== BACKFILL ===');
  await mongoose.connect(config.MONGODB_URI);
  console.log('Connected to MongoDB');

  const signed = await backfillSignedLeads();
  console.log(`Signed leads: ${signed.updated}/${signed.txs} transactions processed`);

  const callGigs = await backfillCallGigIds();
  console.log(`Call gigId: ${callGigs.updated}/${callGigs.calls} calls patched`);

  const txGigs = await backfillTransactionGigIds();
  console.log(`Transaction gigId: ${txGigs.updated}/${txGigs.txs} transactions patched`);

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
