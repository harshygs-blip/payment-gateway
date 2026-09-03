import { query } from '../db/database.js';

let ioInstance = null;

export function setSocketIO(io) {
  ioInstance = io;
}

/**
 * Core Time-Window Matching Engine
 * Compares incoming payment amount and timestamp with pending active orders.
 */
export async function processIncomingPayment({
  amount,
  utr,
  sender = 'Unknown',
  receivedAt = new Date(),
  source = 'IMAP',
  rawSnippet = ''
}) {
  const receivedTimestamp = receivedAt instanceof Date ? receivedAt.getTime() : Number(receivedAt);

  console.log(`[MatchingEngine] Processing payment: ₹${amount}, UTR: ${utr}, Source: ${source}`);

  // 1. Duplicate Check
  const existingPayment = await query.get(
    'SELECT * FROM payments WHERE utr = ?',
    [utr]
  );

  if (existingPayment) {
    console.warn(`[MatchingEngine] Duplicate payment received with UTR: ${utr}. Ignoring.`);
    return {
      success: false,
      matched: false,
      reason: 'DUPLICATE_PAYMENT',
      payment: existingPayment
    };
  }

  // 2. Time-Window Search: Find oldest active pending order matching this amount
  // Tolerance: 60 seconds clock skew tolerance before order created_at, and 60 seconds after expires_at
  const clockSkewToleranceMs = 60 * 1000;
  const now = Date.now();

  const matchingOrder = await query.get(
    `SELECT * FROM orders 
     WHERE status = 'PENDING'
       AND ROUND(amount, 2) = ROUND(?, 2)
       AND (created_at - ?) <= ?
       AND (expires_at + ?) >= ?
     ORDER BY created_at ASC 
     LIMIT 1`,
    [amount, clockSkewToleranceMs, receivedTimestamp, clockSkewToleranceMs, receivedTimestamp]
  );

  if (matchingOrder) {
    console.log(`[MatchingEngine] Match found! Order: ${matchingOrder.order_code} for ₹${amount}`);

    // Update order to PAID
    await query.run(
      `UPDATE orders 
       SET status = 'PAID', paid_at = ?, utr = ?, sender_info = ?
       WHERE id = ?`,
      [receivedTimestamp, utr, sender, matchingOrder.id]
    );

    // Save payment as matched
    const paymentResult = await query.run(
      `INSERT INTO payments (utr, amount, sender, received_at, source, raw_snippet, matched_order_id, is_matched)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [utr, amount, sender, receivedTimestamp, source, rawSnippet, matchingOrder.id]
    );

    const updatedOrder = {
      ...matchingOrder,
      status: 'PAID',
      paid_at: receivedTimestamp,
      utr,
      sender_info: sender
    };

    // Real-time notification via WebSockets
    if (ioInstance) {
      // Notify checkout room
      ioInstance.to(`order_${matchingOrder.order_code}`).emit('order_status_update', {
        orderCode: matchingOrder.order_code,
        status: 'PAID',
        amount,
        utr,
        sender,
        paidAt: receivedTimestamp
      });

      // Notify admin dashboard
      ioInstance.to('admin_room').emit('payment_event', {
        type: 'ORDER_PAID',
        order: updatedOrder,
        paymentId: paymentResult.lastID
      });
    }

    // Trigger webhook if provided
    if (matchingOrder.webhook_url) {
      triggerWebhook(matchingOrder.webhook_url, updatedOrder);
    }

    return {
      success: true,
      matched: true,
      order: updatedOrder,
      paymentId: paymentResult.lastID
    };
  } else {
    console.log(`[MatchingEngine] No active pending order found for ₹${amount} at time ${new Date(receivedTimestamp).toISOString()}`);

    // Save unmatched payment for admin inspection or manual customer UTR claim
    const paymentResult = await query.run(
      `INSERT INTO payments (utr, amount, sender, received_at, source, raw_snippet, matched_order_id, is_matched)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`,
      [utr, amount, sender, receivedTimestamp, source, rawSnippet]
    );

    if (ioInstance) {
      ioInstance.to('admin_room').emit('payment_event', {
        type: 'UNMATCHED_PAYMENT',
        payment: {
          id: paymentResult.lastID,
          utr,
          amount,
          sender,
          received_at: receivedTimestamp,
          source
        }
      });
    }

    return {
      success: true,
      matched: false,
      reason: 'NO_ACTIVE_ORDER_FOUND',
      paymentId: paymentResult.lastID
    };
  }
}

/**
 * Fallback: Customer manually inputs UTR on Checkout page if email was slightly delayed
 */
export async function claimOrderWithUtr(orderCode, submittedUtr) {
  const cleanUtr = (submittedUtr || '').trim();
  if (!cleanUtr) {
    return { success: false, message: 'Invalid UTR' };
  }

  const order = await query.get('SELECT * FROM orders WHERE order_code = ?', [orderCode]);
  if (!order) {
    return { success: false, message: 'Order not found' };
  }

  if (order.status === 'PAID') {
    return { success: true, message: 'Order is already paid', order };
  }

  // Check if this UTR exists in unmatched payments
  const payment = await query.get(
    'SELECT * FROM payments WHERE utr = ? AND is_matched = 0',
    [cleanUtr]
  );

  if (payment) {
    // Validate amount matches
    if (Math.abs(payment.amount - order.amount) > 0.01) {
      return {
        success: false,
        message: `Payment amount (₹${payment.amount}) does not match order amount (₹${order.amount})`
      };
    }

    // Match them
    await query.run(
      `UPDATE orders SET status = 'PAID', paid_at = ?, utr = ?, sender_info = ? WHERE id = ?`,
      [payment.received_at, cleanUtr, payment.sender, order.id]
    );

    await query.run(
      `UPDATE payments SET matched_order_id = ?, is_matched = 1 WHERE id = ?`,
      [order.id, payment.id]
    );

    const updatedOrder = { ...order, status: 'PAID', paid_at: payment.received_at, utr: cleanUtr };

    if (ioInstance) {
      ioInstance.to(`order_${order.order_code}`).emit('order_status_update', {
        orderCode: order.order_code,
        status: 'PAID',
        amount: order.amount,
        utr: cleanUtr,
        paidAt: payment.received_at
      });
      ioInstance.to('admin_room').emit('payment_event', { type: 'ORDER_PAID', order: updatedOrder });
    }

    return { success: true, message: 'Payment verified successfully via UTR!', order: updatedOrder };
  } else {
    // Save UTR attempt on the order so when the email arrives, it matches immediately
    await query.run('UPDATE orders SET utr = ? WHERE id = ?', [cleanUtr, order.id]);
    return {
      success: false,
      message: 'UTR registered! Waiting for bank confirmation email... System will auto-verify within 30 seconds.'
    };
  }
}

/**
 * Asynchronous Webhook Dispatcher
 */
async function triggerWebhook(webhookUrl, orderData) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'payment.success',
        data: {
          orderCode: orderData.order_code,
          amount: orderData.amount,
          utr: orderData.utr,
          sender: orderData.sender_info,
          paidAt: orderData.paid_at
        }
      })
    });
    const status = response.ok ? 'SUCCESS' : 'FAILED';
    await query.run('UPDATE orders SET webhook_status = ? WHERE id = ?', [status, orderData.id]);
  } catch (err) {
    console.error(`[Webhook] Failed to dispatch to ${webhookUrl}:`, err.message);
    await query.run('UPDATE orders SET webhook_status = ? WHERE id = ?', ['FAILED', orderData.id]);
  }
}

export default { processIncomingPayment, claimOrderWithUtr, setSocketIO };
