import { OrderModel } from '../models/order.model.js';
import { PaymentModel } from '../models/payment.model.js';
import { SettingModel } from '../models/setting.model.js';
import { processIncomingPayment } from '../services/matchingEngine.service.js';
import { getImapStatus } from '../services/imapListener.service.js';
import { config } from '../../config.js';
import { getRecentApiLogs } from '../../db/database.js';

export const AdminController = {
  async getStats(req, res, next) {
    try {
      const orderStats = await OrderModel.getStats();
      const paymentSummary = await PaymentModel.getLedgerSummary();

      return res.json({
        success: true,
        stats: {
          totalOrders: orderStats.total,
          paidOrders: orderStats.paid,
          pendingOrders: orderStats.pending,
          totalRevenue: orderStats.revenue,
          totalPaymentsRecorded: paymentSummary.totalTransactions,
          imapStatus: getImapStatus(),
          merchantVpa: config.merchant.upiVpa,
          merchantName: config.merchant.name,
          expiryMinutes: config.orderExpiryMinutes,
          imapUser: config.imap.user || '',
          hasImapPass: Boolean(config.imap.pass),
          imapFilter: config.imap.senderFilter.join(', '),
          allowedOrigins: config.allowedOrigins || []
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async getLogs(req, res, next) {
    try {
      const limit = parseInt(req.query.limit || 50, 10);
      const logs = await getRecentApiLogs(limit);
      return res.json({ success: true, logs });
    } catch (err) {
      next(err);
    }
  },

  async getOrders(req, res, next) {
    try {
      const { status = 'ALL', limit = 50 } = req.query;
      const orders = await OrderModel.list({ status, limit: parseInt(limit, 10) });
      return res.json({ success: true, orders });
    } catch (err) {
      next(err);
    }
  },

  async getPayments(req, res, next) {
    try {
      const { limit = 50 } = req.query;
      const payments = await PaymentModel.listRecent(parseInt(limit, 10));
      return res.json({ success: true, payments });
    } catch (err) {
      next(err);
    }
  },

  async simulatePayment(req, res, next) {
    try {
      const { amount, utr, sender = 'Test Customer (Simulated)', offsetSeconds = 0 } = req.body;
      const parsedAmount = parseFloat(amount);

      if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, error: 'Valid positive amount is required' });
      }

      const testUtr = utr || `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const paymentTimestamp = Date.now() + (parseInt(offsetSeconds, 10) * 1000);

      const result = await processIncomingPayment({
        amount: parsedAmount,
        utr: testUtr,
        sender,
        receivedAt: paymentTimestamp,
        source: 'SIMULATION',
        rawSnippet: `[SIMULATED] Received INR ${parsedAmount} from ${sender}. Ref: ${testUtr}`
      });

      return res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  },

  async updateSettings(req, res, next) {
    try {
      const { upiVpa, merchantName, expiryMinutes } = req.body;

      if (upiVpa) {
        config.merchant.upiVpa = upiVpa.trim();
        await SettingModel.set('merchant_upi_vpa', config.merchant.upiVpa);
      }
      if (merchantName) {
        config.merchant.name = merchantName.trim();
        await SettingModel.set('merchant_name', config.merchant.name);
      }
      if (expiryMinutes) {
        config.orderExpiryMinutes = parseInt(expiryMinutes, 10);
        await SettingModel.set('order_expiry_minutes', config.orderExpiryMinutes);
      }

      if (req.io) {
        req.io.to('admin_room').emit('settings_updated', {
          merchantVpa: config.merchant.upiVpa,
          merchantName: config.merchant.name,
          expiryMinutes: config.orderExpiryMinutes
        });
      }

      return res.json({ success: true, message: 'Settings saved to database successfully!' });
    } catch (err) {
      next(err);
    }
  }
};

export default AdminController;
