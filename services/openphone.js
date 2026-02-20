/**
 * OpenPhone API Service
 * Handles call logging, contact sync, and webhooks
 */

const OPENPHONE_API_URL = 'https://api.openphone.com/v1';
const OPENPHONE_API_KEY = process.env.OPENPHONE_API_KEY;
const OPENPHONE_NUMBER = process.env.OPENPHONE_NUMBER || '+13862733460';

/**
 * Make authenticated request to OpenPhone API
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${OPENPHONE_API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': OPENPHONE_API_KEY,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenPhone API error: ${response.status} - ${error.message || 'Unknown error'}`);
  }
  
  return response.json();
}

/**
 * List recent calls
 */
async function listCalls(options = {}) {
  const params = new URLSearchParams();
  if (options.phoneNumberId) params.append('phoneNumberId', options.phoneNumberId);
  if (options.maxResults) params.append('maxResults', options.maxResults);
  if (options.pageToken) params.append('pageToken', options.pageToken);
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/calls${query}`);
}

/**
 * Get a specific call by ID
 */
async function getCall(callId) {
  return apiRequest(`/calls/${callId}`);
}

/**
 * Get call recordings
 */
async function getCallRecordings(callId) {
  return apiRequest(`/call-recordings/${callId}`);
}

/**
 * Get call transcription
 */
async function getCallTranscription(callId) {
  return apiRequest(`/call-transcriptions/${callId}`);
}

/**
 * Get call summary (AI-generated)
 */
async function getCallSummary(callId) {
  return apiRequest(`/call-summaries/${callId}`);
}

/**
 * List contacts
 */
async function listContacts(options = {}) {
  const params = new URLSearchParams();
  if (options.maxResults) params.append('maxResults', options.maxResults);
  if (options.pageToken) params.append('pageToken', options.pageToken);
  
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/contacts${query}`);
}

/**
 * Create a contact in OpenPhone
 */
async function createContact(contact) {
  return apiRequest('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      firstName: contact.firstName,
      lastName: contact.lastName,
      emails: contact.email ? [{ value: contact.email }] : [],
      phoneNumbers: contact.phone ? [{ value: contact.phone }] : [],
      company: contact.company || 'The Hoover Home Team Client'
    })
  });
}

/**
 * Update a contact
 */
async function updateContact(contactId, contact) {
  return apiRequest(`/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(contact)
  });
}

/**
 * Delete a contact
 */
async function deleteContact(contactId) {
  return apiRequest(`/contacts/${contactId}`, {
    method: 'DELETE'
  });
}

/**
 * Create webhook subscription
 */
async function createWebhook(type, url) {
  const endpoint = type === 'calls' 
    ? '/webhooks/calls' 
    : type === 'messages' 
      ? '/webhooks/messages'
      : type === 'call-summaries'
        ? '/webhooks/call-summaries'
        : '/webhooks/call-transcripts';
        
  return apiRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify({ url })
  });
}

/**
 * List webhooks
 */
async function listWebhooks() {
  return apiRequest('/webhooks');
}

/**
 * Process incoming webhook event
 */
function processWebhookEvent(event) {
  const { type, data } = event;
  
  // Normalize the event data
  const normalized = {
    type,
    timestamp: new Date().toISOString(),
    raw: data
  };
  
  if (type === 'call.completed' || type === 'call.ringing' || type === 'call.answered') {
    normalized.callId = data.id;
    normalized.direction = data.direction; // 'inbound' or 'outbound'
    normalized.from = data.from;
    normalized.to = data.to;
    normalized.duration = data.duration;
    normalized.status = data.status;
    normalized.phoneNumber = data.direction === 'inbound' ? data.from : data.to;
  } else if (type === 'message.received' || type === 'message.sent') {
    normalized.messageId = data.id;
    normalized.direction = data.direction;
    normalized.from = data.from;
    normalized.to = data.to;
    normalized.body = data.body;
    normalized.phoneNumber = data.direction === 'inbound' ? data.from : data.to;
  }
  
  return normalized;
}

/**
 * Format phone number for matching (strip formatting)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '').slice(-10);
}

/**
 * Generate click-to-call URL
 */
function getClickToCallUrl(phoneNumber) {
  const cleaned = normalizePhone(phoneNumber);
  // OpenPhone uses tel: links that their app intercepts
  return `tel:${cleaned}`;
}

/**
 * Generate OpenPhone app deep link
 */
function getOpenPhoneDeepLink(phoneNumber) {
  const cleaned = normalizePhone(phoneNumber);
  return `openphone://call/${cleaned}`;
}

module.exports = {
  listCalls,
  getCall,
  getCallRecordings,
  getCallTranscription,
  getCallSummary,
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  createWebhook,
  listWebhooks,
  processWebhookEvent,
  normalizePhone,
  getClickToCallUrl,
  getOpenPhoneDeepLink,
  OPENPHONE_NUMBER
};
