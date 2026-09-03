import { query } from '../../db/database.js';

export const PaymentModel = {
  async findByUtr(utr) {
    return query.get('SELECT * FROM payments WHERE utr = ?', [utr]);
  },

  async findUnmatchedByUtr(utr) {
    return query.get('SELECT * FROM payments WHERE utr = ? AND is_matched = 0', [utr]);
  },

  async create({ utr, amount, sender, receivedAt, source = 'IMAP', rawSnippet = '', matchedOrderId = null, isMatched = 0 }) {
    const result = await query.run(
      `INSERT INTO payments (utr, amount, sender, received_at, source, raw_snippet, matched_order_id, is_matched)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [utr, amount, sender, receivedAt, source, rawSnippet, matchedOrderId, isMatched]
    );
    return { id: result.lastID, utr, amount, sender, receivedAt, source, matchedOrderId, isMatched };
  },

  async linkToOrder(paymentId, orderId) {
    return query.run('UPDATE payments SET matched_order_id = ?, is_matched = 1 WHERE id = ?', [orderId, paymentId]);
  },

  async listRecent(limit = 50) {
    return query.all(
      `SELECT p.*, o.order_code as matched_order_code 
       FROM payments p
       LEFT JOIN orders o ON p.matched_order_id = o.id
       ORDER BY p.received_at DESC LIMIT ?`,
      [limit]
    );
  },

  async getLedgerSummary() {
    const totalRow = await query.get('SELECT COUNT(*) as count, SUM(amount) as total FROM payments');
    const topSenders = await query.all(
      `SELECT sender, COUNT(*) as count, SUM(amount) as total 
       FROM payments 
       WHERE sender IS NOT NULL AND sender != 'Unknown' AND sender != ''
       GROUP BY sender 
       ORDER BY total DESC 
       LIMIT 8`
    );
    const payments = await query.all(
      `SELECT p.*, o.order_code as matched_order_code 
       FROM payments p
       LEFT JOIN orders o ON p.matched_order_id = o.id
       ORDER BY p.received_at DESC LIMIT 100`
    );

    return {
      totalCollected: totalRow?.total || 0,
      totalTransactions: totalRow?.count || 0,
      topSenders: topSenders || [],
      payments: payments || []
    };
  }
};

export default PaymentModel;
