/**
 * Telegram Alert Formatter — Phase 2 Prep
 *
 * Formats touchpoint alerts for Telegram delivery.
 * Phase 2 will call these when signals are detected (birthday, anniversary, etc.).
 */

const CRM_BASE_URL = process.env.CRM_BASE_URL || 'https://clientlist.onrender.com';

/**
 * Format a touchpoint alert for Telegram.
 *
 * @param {Object} prospect - { id, firstName, lastName }
 * @param {string} signal - What was detected (e.g., "Birthday in 3 days")
 * @param {string} suggestedMessage - Pre-drafted outreach message
 * @returns {string} Formatted Telegram message (Markdown)
 */
function formatTouchpointAlert(prospect, signal, suggestedMessage) {
  const name = `${prospect.firstName || ''} ${prospect.lastName || ''}`.trim();
  const today = new Date().toISOString().split('T')[0];
  const crmLink = `${CRM_BASE_URL}/client/${prospect.id}`;

  return [
    `*TOUCHPOINT ALERT — ${name}*`,
    '',
    `Signal: ${signal}`,
    `Detected: ${today}`,
    `Suggested message:`,
    `"${suggestedMessage}"`,
    '',
    `CRM: ${crmLink}`,
  ].join('\n');
}

/**
 * Format a batch digest of multiple touchpoint alerts.
 *
 * @param {Array} alerts - Array of { prospect, signal, suggestedMessage }
 * @returns {string} Formatted digest for Telegram
 */
function formatTouchpointDigest(alerts) {
  if (alerts.length === 0) return 'No touchpoint alerts today.';

  const today = new Date().toISOString().split('T')[0];
  const header = `*DAILY TOUCHPOINT DIGEST — ${today}*\n${alerts.length} signal${alerts.length === 1 ? '' : 's'} detected\n`;

  const items = alerts.map((alert, i) => {
    const name = `${alert.prospect.firstName || ''} ${alert.prospect.lastName || ''}`.trim();
    return [
      `*${i + 1}. ${name}*`,
      `Signal: ${alert.signal}`,
      `"${alert.suggestedMessage}"`,
      `CRM: ${CRM_BASE_URL}/client/${alert.prospect.id}`,
    ].join('\n');
  });

  return header + '\n' + items.join('\n\n');
}

module.exports = { formatTouchpointAlert, formatTouchpointDigest };
