import { query } from '../../db/database.js';

export const OrderModel = {
  async create({ orderCode, amount, customerName = 'Guest', customerPhone = '', createdAt, expiresAt, webhookUrl = '' }) {
    const result = await query.run(
      `INSERT INTO orders (order_code, amount, customer_name, customer_phone, status, created_at, expires_at, webhook_url)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [orderCode, amount, customerName, customerPhone, createdAt, expiresAt, webhookUrl]
    );
    return { id: result.lastID, orderCode, amount, customerName, customerPhone, status: 'PENDING', createdAt, expiresAt };
  },

  async findByCode(orderCode) {
    return query.get('SELECT * FROM orders WHERE order_code = ?', [orderCode]);
  },

  async findById(id) {
    return query.get('SELECT * FROM orders WHERE id = ?', [id]);
  },

  async markAsPaid(id, { paidAt, utr, senderInfo }) {
    return query.run(
      `UPDATE orders SET status = 'PAID', paid_at = ?, utr = ?, sender_info = ? WHERE id = ?`,
      [paidAt, utr, senderInfo, id]
    );
  },

  async markAsExpired(id) {
    return query.run(`UPDATE orders SET status = 'EXPIRED' WHERE id = ?`, [id]);
  },

  async setSubmittedUtr(id, utr) {
    return query.run(`UPDATE orders SET utr = ? WHERE id = ?`, [utr, id]);
  },

  async list({ status = 'ALL', limit = 50 } = {}) {
    let sql = 'SELECT * FROM orders';
    const params = [];
    if (status !== 'ALL') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    return query.all(sql, params);
  },

  async getStats() {
    const total = await query.get('SELECT COUNT(*) as count FROM orders');
    const paid = await query.get('SELECT COUNT(*) as count, SUM(amount) as revenue FROM orders WHERE status = "PAID"');
    const pending = await query.get('SELECT COUNT(*) as count FROM orders WHERE status = "PENDING"');
    return {
      total: total?.count || 0,
      paid: paid?.count || 0,
      revenue: paid?.revenue || 0,
      pending: pending?.count || 0
    };
  },

  async findExpiredPending(now = Date.now()) {
    return query.all('SELECT id, order_code FROM orders WHERE status = "PENDING" AND expires_at < ?', [now]);
  },

  async updateWebhookStatus(id, status) {
    return query.run('UPDATE orders SET webhook_status = ? WHERE id = ?', [status, id]);
  }
};

export default OrderModel;
