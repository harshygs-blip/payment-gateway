import crypto from 'crypto';
import { getSetting, setSetting, getAllSettings } from '../../db/database.js';

export const SettingModel = {
  get: getSetting,
  set: setSetting,
  getAll: getAllSettings,

  generateApiKey() {
    return 'pg_live_' + crypto.randomBytes(18).toString('hex');
  },

  async getApiKey() {
    let key = await getSetting('api_key');
    if (!key) {
      key = this.generateApiKey();
      await setSetting('api_key', key);
      await setSetting('api_key_created_at', Date.now().toString());
      await setSetting('require_api_key', 'true');
    }
    return key;
  },

  async regenerateApiKey() {
    const newKey = this.generateApiKey();
    await setSetting('api_key', newKey);
    await setSetting('api_key_created_at', Date.now().toString());
    return newKey;
  },

  async isApiKeyRequired() {
    const val = await getSetting('require_api_key', 'true');
    return val !== 'false';
  },

  async setApiKeyRequired(required) {
    await setSetting('require_api_key', required ? 'true' : 'false');
  },

  async hydrateConfig(config) {
    const vpa = await getSetting('merchant_upi_vpa');
    if (vpa) config.merchant.upiVpa = vpa;

    const name = await getSetting('merchant_name');
    if (name) config.merchant.name = name;

    const expiry = await getSetting('order_expiry_minutes');
    if (expiry) config.orderExpiryMinutes = parseInt(expiry, 10);

    const imapEnabled = await getSetting('imap_enabled');
    if (imapEnabled !== '') config.imap.enabled = imapEnabled === 'true';

    const imapUser = await getSetting('imap_user');
    if (imapUser) config.imap.user = imapUser;

    const imapPass = await getSetting('imap_pass');
    if (imapPass) config.imap.pass = imapPass;

    const imapFilter = await getSetting('imap_filter');
    if (imapFilter) config.imap.senderFilter = imapFilter.split(',').map(s => s.trim().toLowerCase());

    // Hydrate API Key into runtime configuration
    config.auth = config.auth || {};
    config.auth.apiKey = await this.getApiKey();
    config.auth.requireApiKey = await this.isApiKeyRequired();
  }
};

export default SettingModel;
