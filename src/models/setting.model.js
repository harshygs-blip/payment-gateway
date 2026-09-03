import { getSetting, setSetting, getAllSettings } from '../../db/database.js';

export const SettingModel = {
  get: getSetting,
  set: setSetting,
  getAll: getAllSettings,

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
  }
};

export default SettingModel;
