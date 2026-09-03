import { PaymentModel } from '../models/payment.model.js';
import { parsePaymentEmail } from '../services/emailParser.service.js';

export const LedgerController = {
  async getSummary(req, res, next) {
    try {
      const summary = await PaymentModel.getLedgerSummary();
      return res.json({ success: true, ledger: summary });
    } catch (err) {
      next(err);
    }
  },

  async parsePaste(req, res, next) {
    try {
      const { text, subject = 'Pasted Payment Email' } = req.body;

      if (!text || text.trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Please paste valid email content.' });
      }

      const payment = parsePaymentEmail(subject, text, new Date());
      if (!payment.success || !payment.amount) {
        return res.status(400).json({
          success: false,
          error: 'Could not find a valid UPI/FamPay payment amount in the pasted text.'
        });
      }

      const existing = await PaymentModel.findByUtr(payment.utr);
      if (existing) {
        return res.json({
          success: true,
          isDuplicate: true,
          message: `Payment already exists in ledger! (UTR: ${payment.utr}, ₹${existing.amount})`,
          payment: existing
        });
      }

      const receivedTimestamp = payment.receivedAt.getTime();
      const saved = await PaymentModel.create({
        utr: payment.utr,
        amount: payment.amount,
        sender: payment.sender,
        receivedAt: receivedTimestamp,
        source: 'PASTED_EMAIL',
        rawSnippet: payment.rawSnippet
      });

      if (req.io) {
        req.io.to('admin_room').emit('payment_event', { type: 'PAYMENT_ADDED_TO_LEDGER', payment: saved });
      }

      return res.json({
        success: true,
        isDuplicate: false,
        message: `Parsed & Saved ₹${payment.amount} from ${payment.sender} (UTR: ${payment.utr})`,
        payment: saved
      });
    } catch (err) {
      next(err);
    }
  }
};

export default LedgerController;
