const HARX_SLOTS = [
  'Deal_Name',
  'First_Name',
  'Last_Name',
  'Email_1',
  'Phone',
  'Address',
  'Postal_Code',
  'City',
  'Date_of_Birth',
  'Stage',
  'Pipeline',
];

const HARX_ONLY_KEYS = new Set([
  'repDisposition',
  'repDispositionAt',
  'repDispositionBy',
  'pendingDisposition',
  'pendingDispositionAt',
  'pendingDispositionBy',
  'cockpitLockedBy',
  'cockpitLockedAt',
  'cockpitLockExpiresAt',
  'assignedRepId',
  'assignedRepAt',
  'followUpCalls',
  'nextFollowUpAt',
  'nextFollowUpType',
  'nextFollowUpSource',
  'nextFollowUpNotifiedAt',
  'customFields',
  'archived',
  'archivedAt',
  'userId',
  'companyId',
  'gigId',
  'refreshToken',
  '_id',
  '__v',
  'createdAt',
  'updatedAt',
  'Created_Time',
  'Modified_Time',
]);

const CRM_MODULES = ['Deals', 'Leads', 'Contacts'];
const MAX_ZOHO_FIELDS = 50;

const DEFAULT_MAPPING = {
  Deal_Name: 'Deal_Name',
  First_Name: 'First_Name',
  Last_Name: 'Last_Name',
  Email_1: 'Email_1',
  Phone: 'Phone',
  Address: 'Address',
  Postal_Code: 'Postal_Code',
  City: 'City',
  Date_of_Birth: 'Date_of_Birth',
  Stage: 'Stage',
  Pipeline: 'Pipeline',
};

function zohoApiRoot() {
  const configured = process.env.ZOHO_API_URL || 'https://www.zohoapis.com/crm/v2.1';
  return String(configured).replace(/\/crm\/v\d+(\.\d+)?\/?$/i, '');
}

function asPlain(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === 'function') return value.toObject();
  return value;
}

function normalizeMapping(raw) {
  const source = asPlain(raw);
  const mapping = {};
  for (const slot of HARX_SLOTS) {
    const zohoName = source[slot];
    if (typeof zohoName === 'string' && zohoName.trim()) {
      mapping[slot] = zohoName.trim();
    }
  }
  return mapping;
}

function mappingIsUsable(mapping) {
  const hasEmail = Boolean(mapping.Email_1);
  const hasPhone = Boolean(mapping.Phone);
  const hasName = Boolean(mapping.Deal_Name) || (Boolean(mapping.First_Name) && Boolean(mapping.Last_Name));
  return hasEmail && hasPhone && hasName;
}

function normalizeModule(moduleName) {
  return CRM_MODULES.includes(moduleName) ? moduleName : 'Deals';
}

function scalarValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    if (typeof value.name === 'string' && value.name) return value.name;
    if (typeof value.display_value === 'string' && value.display_value) return value.display_value;
  }
  return '';
}

function fieldsQuery(mapping, catalogNames) {
  const names = [];
  const push = (name) => {
    if (!name || name === 'id' || names.includes(name) || names.length >= MAX_ZOHO_FIELDS) return;
    names.push(name);
  };
  Object.values(mapping || {}).forEach(push);
  (catalogNames || []).forEach(push);
  return names.join(',');
}

function applyZohoRecord(record, mapping) {
  const used = new Set(['id']);
  const lead = {};

  for (const [slot, zohoName] of Object.entries(mapping)) {
    if (!zohoName) continue;
    used.add(zohoName);
    const value = scalarValue(record[zohoName]);
    if (!value) continue;
    lead[slot] = value;
  }

  if (!lead.Deal_Name) {
    const full = [lead.First_Name, lead.Last_Name].filter(Boolean).join(' ').trim();
    if (full) lead.Deal_Name = full;
  }

  if (lead.Email_1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.Email_1)) {
    delete lead.Email_1;
  }

  const customFields = {};
  for (const [key, raw] of Object.entries(record || {})) {
    if (used.has(key) || key.startsWith('$') || HARX_ONLY_KEYS.has(key)) continue;
    const value = scalarValue(raw);
    if (!value) continue;
    if (Object.keys(customFields).length >= 40) break;
    customFields[key] = value;
  }

  return { lead, customFields };
}

function toZohoPayload(leadData, mapping) {
  const source = asPlain(leadData);
  const usable = mapping && mappingIsUsable(mapping) ? mapping : null;
  const payload = {};

  if (usable) {
    for (const [slot, zohoName] of Object.entries(usable)) {
      if (HARX_ONLY_KEYS.has(slot)) continue;
      const value = source[slot];
      if (value == null || value === '' || typeof value === 'object') continue;
      payload[zohoName] = value;
    }
    return payload;
  }

  for (const [key, value] of Object.entries(source)) {
    if (HARX_ONLY_KEYS.has(key) || key.startsWith('$')) continue;
    if (value == null || value === '' || typeof value === 'object') continue;
    payload[key] = value;
  }
  return payload;
}

module.exports = {
  HARX_SLOTS,
  CRM_MODULES,
  DEFAULT_MAPPING,
  zohoApiRoot,
  normalizeMapping,
  mappingIsUsable,
  normalizeModule,
  fieldsQuery,
  applyZohoRecord,
  toZohoPayload,
};
