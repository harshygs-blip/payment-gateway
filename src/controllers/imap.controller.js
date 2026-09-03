import { 
  testImapConnection, 
  restartImapListener, 
  fetchRecentPaymentEmails, 
  syncHistoricalPayments, 
  getImapStatus 
} from '../services/imapListener.service.js';
import { SettingModel } from '../models/setting.model.js';

export const ImapController = {
  async testConnection(req, res, next) {
    try {
      const { user, pass, host, port } = req.body;
      const result = await testImapConnection({ user, pass, host, port });
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async restartListener(req, res, next) {
    try {
      const { user, pass, enabled, host, port, senderFilter } = req.body;

      if (enabled !== undefined) await SettingModel.set('imap_enabled', enabled ? 'true' : 'false');
      if (user !== undefined) await SettingModel.set('imap_user', user.trim());
      if (pass) await SettingModel.set('imap_pass', pass.trim().replace(/\s+/g, ''));
      if (senderFilter !== undefined) await SettingModel.set('imap_filter', senderFilter.trim());

      await restartImapListener({ user, pass, enabled, host, port, senderFilter }, req.io);

      return res.json({
        success: true,
        status: getImapStatus(),
        message: 'IMAP settings saved to database & applied!'
      });
    } catch (err) {
      next(err);
    }
  },

  async getRecentEmails(req, res, next) {
    try {
      const result = await fetchRecentPaymentEmails(5);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async syncHistory(req, res, next) {
    try {
      const maxEmails = parseInt(req.body.maxEmails || 100, 10);
      const result = await syncHistoricalPayments({ maxEmails });

      if (result.success && result.importedCount > 0 && req.io) {
        req.io.to('admin_room').emit('payment_event', { type: 'HISTORICAL_SYNC_COMPLETED', result });
      }

      return res.json(result);
    } catch (err) {
      next(err);
    }
  }
};

export default ImapController;
