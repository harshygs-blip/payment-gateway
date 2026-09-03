import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

import { config } from './config.js';
import { initDatabase, query, getSetting, setSetting, getAllSettings } from './db/database.js';
import { processIncomingPayment, claimOrderWithUtr, setSocketIO } from './services/matchingEngine.js';
import { 
  startImapListener, 
  stopImapListener, 
  restartImapListener, 
  testImapConnection, 
  fetchRecentPaymentEmails, 
  getImapStatus 
} from './services/imapListener.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global safety net for unhandled network/socket errors
process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process Unhandled Rejection]:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Pass socket.io to matching engine and imap listener
setSocketIO(io);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Generate clean unique order code
function generateOrderCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'ORD-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ---------------------- API ROUTES ---------------------- //

/**
 * 1. Create a New Order
 */
app.post('/api/orders/create', async (req, res) => {
  try {
    const { amount, customerName = 'Guest', customerPhone = '', webhookUrl = '' } = req.body;
    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    const orderCode = generateOrderCode();
    const createdAt = Date.now();
    const expiresAt = createdAt + config.orderExpiryMinutes * 60 * 1000;

    // Construct UPI Intent URI
    const upiUri = `upi://pay?pa=${encodeURIComponent(config.merchant.upiVpa)}&pn=${encodeURIComponent(config.merchant.name)}&am=${parsedAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order ${orderCode}`)}`;

    // Save to Database
    const result = await query.run(
      `INSERT INTO orders (order_code, amount, customer_name, customer_phone, status, created_at, expires_at, webhook_url)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [orderCode, parsedAmount, customerName, customerPhone, createdAt, expiresAt, webhookUrl]
    );

    const orderData = {
      id: result.lastID,
      orderCode,
      amount: parsedAmount,
      customerName,
      status: 'PENDING',
      createdAt,
      expiresAt,
      expiryMinutes: config.orderExpiryMinutes,
      upiUri,
      checkoutUrl: `/checkout/${orderCode}`
    };

    // Broadcast new order creation to admin dashboard
    io.to('admin_room').emit('new_order', orderData);

    return res.status(201).json({ success: true, order: orderData });
  } catch (err) {
    console.error('[API Create Order Error]:', err);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

/**
 * 2. Get Order by Code (Status Check)
 */
app.get('/api/orders/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const order = await query.get('SELECT * FROM orders WHERE order_code = ?', [code]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if expired dynamically
    if (order.status === 'PENDING' && Date.now() > order.expires_at) {
      await query.run('UPDATE orders SET status = "EXPIRED" WHERE id = ?', [order.id]);
      order.status = 'EXPIRED';
    }

    const upiUri = `upi://pay?pa=${encodeURIComponent(config.merchant.upiVpa)}&pn=${encodeURIComponent(config.merchant.name)}&am=${Number(order.amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order ${order.order_code}`)}`;

    return res.json({
      success: true,
      order: {
        ...order,
        upiUri,
        timeRemainingSeconds: Math.max(0, Math.floor((order.expires_at - Date.now()) / 1000))
      }
    });
  } catch (err) {
    console.error('[API Get Order Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * 3. Fallback: Manual UTR Verification
 */
app.post('/api/orders/:code/verify-utr', async (req, res) => {
  try {
    const { code } = req.params;
    const { utr } = req.body;

    if (!utr || utr.length < 6) {
      return res.status(400).json({ error: 'Please enter a valid 12-digit UPI UTR or Reference Number' });
    }

    const result = await claimOrderWithUtr(code, utr);
    return res.json(result);
  } catch (err) {
    console.error('[API UTR Verify Error]:', err);
    return res.status(500).json({ error: 'Failed to verify UTR' });
  }
});

/**
 * 4. Dynamic QR Code Generator Endpoint
 */
app.get('/api/qr', async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).send('Missing "data" parameter');

    res.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(res, data, {
      margin: 1,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('[QR Generation Error]:', err);
    res.status(500).send('Error generating QR code');
  }
});

// ---------------------- ADMIN ROUTES ---------------------- //

/**
 * 5. Admin Stats & Summary
 */
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalOrdersRow = await query.get('SELECT COUNT(*) as count FROM orders');
    const paidOrdersRow = await query.get('SELECT COUNT(*) as count, SUM(amount) as revenue FROM orders WHERE status = "PAID"');
    const pendingOrdersRow = await query.get('SELECT COUNT(*) as count FROM orders WHERE status = "PENDING"');
    const totalPaymentsRow = await query.get('SELECT COUNT(*) as count FROM payments');

    return res.json({
      success: true,
      stats: {
        totalOrders: totalOrdersRow?.count || 0,
        paidOrders: paidOrdersRow?.count || 0,
        pendingOrders: pendingOrdersRow?.count || 0,
        totalRevenue: paidOrdersRow?.revenue || 0,
        totalPaymentsRecorded: totalPaymentsRow?.count || 0,
        imapStatus: getImapStatus(),
        merchantVpa: config.merchant.upiVpa,
        merchantName: config.merchant.name,
        expiryMinutes: config.orderExpiryMinutes,
        imapUser: config.imap.user || '',
        hasImapPass: Boolean(config.imap.pass),
        imapFilter: config.imap.senderFilter.join(', ')
      }
    });
  } catch (err) {
    console.error('[API Admin Stats Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

/**
 * 6. Admin Orders List
 */
app.get('/api/admin/orders', async (req, res) => {
  try {
    const { status = 'ALL', limit = 50 } = req.query;
    let sql = 'SELECT * FROM orders';
    const params = [];

    if (status !== 'ALL') {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const orders = await query.all(sql, params);
    return res.json({ success: true, orders });
  } catch (err) {
    console.error('[API Admin Orders Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * 7. Admin Payments Log
 */
app.get('/api/admin/payments', async (req, res) => {
  try {
    const payments = await query.all(
      `SELECT p.*, o.order_code as matched_order_code 
       FROM payments p
       LEFT JOIN orders o ON p.matched_order_id = o.id
       ORDER BY p.received_at DESC LIMIT 50`
    );
    return res.json({ success: true, payments });
  } catch (err) {
    console.error('[API Admin Payments Error]:', err);
    return res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

/**
 * 8. Simulator Tool: Simulate incoming payment for zero-risk testing!
 */
app.post('/api/admin/simulate-payment', async (req, res) => {
  try {
    const { amount, utr, sender = 'Test Customer (Simulated)', offsetSeconds = 0 } = req.body;
    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
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
    console.error('[Simulator Error]:', err);
    return res.status(500).json({ error: 'Simulation failed' });
  }
});

/**
 * 9. Update Settings
 */
app.post('/api/admin/settings', async (req, res) => {
  try {
    const { upiVpa, merchantName, expiryMinutes } = req.body;
    if (upiVpa) {
      config.merchant.upiVpa = upiVpa.trim();
      await setSetting('merchant_upi_vpa', config.merchant.upiVpa);
    }
    if (merchantName) {
      config.merchant.name = merchantName.trim();
      await setSetting('merchant_name', config.merchant.name);
    }
    if (expiryMinutes) {
      config.orderExpiryMinutes = parseInt(expiryMinutes, 10);
      await setSetting('order_expiry_minutes', config.orderExpiryMinutes);
    }

    io.to('admin_room').emit('settings_updated', {
      merchantVpa: config.merchant.upiVpa,
      merchantName: config.merchant.name,
      expiryMinutes: config.orderExpiryMinutes
    });

    return res.json({ success: true, message: 'Settings saved to database successfully!' });
  } catch (err) {
    console.error('[Settings Update Error]:', err);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * 10. Test IMAP Connection
 */
app.post('/api/admin/imap/test', async (req, res) => {
  try {
    const { user, pass, host, port } = req.body;
    const result = await testImapConnection({ user, pass, host, port });
    return res.json(result);
  } catch (err) {
    console.error('[IMAP Test Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 11. Dynamic Start/Stop/Restart IMAP Listener (Persisted to Database)
 */
app.post('/api/admin/imap/restart', async (req, res) => {
  try {
    const { user, pass, enabled, host, port, senderFilter } = req.body;

    if (enabled !== undefined) await setSetting('imap_enabled', enabled ? 'true' : 'false');
    if (user !== undefined) await setSetting('imap_user', user.trim());
    if (pass) await setSetting('imap_pass', pass.trim().replace(/\s+/g, ''));
    if (senderFilter !== undefined) await setSetting('imap_filter', senderFilter.trim());

    await restartImapListener({ user, pass, enabled, host, port, senderFilter }, io);
    return res.json({ 
      success: true, 
      status: getImapStatus(),
      message: 'IMAP settings saved to database & applied!' 
    });
  } catch (err) {
    console.error('[IMAP Restart Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 12. Fetch Recent Emails from Mailbox for Diagnostics
 */
app.get('/api/admin/imap/recent', async (req, res) => {
  try {
    const result = await fetchRecentPaymentEmails(5);
    return res.json(result);
  } catch (err) {
    console.error('[IMAP Fetch Recent Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------- PAGE ROUTES ---------------------- //

app.get('/checkout/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => {
  res.redirect('/admin');
});

// ---------------------- WEBSOCKETS ---------------------- //

io.on('connection', (socket) => {
  // Join specific order room for instant updates on checkout
  socket.on('join_order', (orderCode) => {
    socket.join(`order_${orderCode}`);
  });

  // Join admin dashboard room
  socket.on('join_admin', () => {
    socket.join('admin_room');
  });
});

// ---------------------- BACKGROUND CLEANER ---------------------- //

// Check for expired orders every 30 seconds
setInterval(async () => {
  try {
    const now = Date.now();
    const expiredOrders = await query.all(
      'SELECT id, order_code FROM orders WHERE status = "PENDING" AND expires_at < ?',
      [now]
    );

    for (const ord of expiredOrders) {
      await query.run('UPDATE orders SET status = "EXPIRED" WHERE id = ?', [ord.id]);
      io.to(`order_${ord.order_code}`).emit('order_status_update', {
        orderCode: ord.order_code,
        status: 'EXPIRED'
      });
      io.to('admin_room').emit('order_expired', { orderCode: ord.order_code });
    }
  } catch (err) {
    console.error('[Expiry Cleaner Error]:', err.message);
  }
}, 30000);

// ---------------------- START SERVER ---------------------- //

async function start() {
  await initDatabase();

  // Hydrate runtime config from SQLite database
  const dbVpa = await getSetting('merchant_upi_vpa');
  if (dbVpa) config.merchant.upiVpa = dbVpa;

  const dbName = await getSetting('merchant_name');
  if (dbName) config.merchant.name = dbName;

  const dbExpiry = await getSetting('order_expiry_minutes');
  if (dbExpiry) config.orderExpiryMinutes = parseInt(dbExpiry, 10);

  const dbImapEnabled = await getSetting('imap_enabled');
  if (dbImapEnabled !== '') config.imap.enabled = dbImapEnabled === 'true';

  const dbImapUser = await getSetting('imap_user');
  if (dbImapUser) config.imap.user = dbImapUser;

  const dbImapPass = await getSetting('imap_pass');
  if (dbImapPass) config.imap.pass = dbImapPass;

  const dbImapFilter = await getSetting('imap_filter');
  if (dbImapFilter) config.imap.senderFilter = dbImapFilter.split(',').map(s => s.trim().toLowerCase());

  server.listen(config.port, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Personal UPI Gateway is live at: http://localhost:${config.port}`);
    console.log(`📱 Admin Dashboard: http://localhost:${config.port}/admin`);
    console.log(`💳 UPI VPA: ${config.merchant.upiVpa} (${config.merchant.name})`);
    console.log(`======================================================\n`);

    // Start IMAP listener in background if enabled
    startImapListener(io);
  });
}

start().catch((err) => {
  console.error('[Startup Fatal Error]:', err);
  process.exit(1);
});
