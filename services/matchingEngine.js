import { query, logActivity } from '../db/database.js';

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

  // 2. Matching Strategy:
  // Step A: Check if any active/recent order was already claimed with this exact UTR or order code
  let matchingOrder = await query.get(
    `SELECT * FROM orders 
     WHERE (utr = ? OR (LENGTH(?) > 4 AND instr(?, order_code) > 0))
       AND status != 'PAID'
       AND ROUND(amount, 2) = ROUND(?, 2)
     ORDER BY created_at DESC 
     LIMIT 1`,
    [utr, rawSnippet, rawSnippet, amount]
  );

  // Step B: Time-Window Search for active pending orders matching this amount
  const clockSkewToleranceMs = 90 * 1000; // 90 seconds clock skew tolerance
  if (!matchingOrder) {
    matchingOrder = await query.get(
      `SELECT * FROM orders 
       WHERE status = 'PENDING'
         AND ROUND(amount, 2) = ROUND(?, 2)
         AND (created_at - ?) <= ?
         AND (expires_at + ?) >= ?
       ORDER BY created_at ASC 
       LIMIT 1`,
      [amount, clockSkewToleranceMs, receivedTimestamp, clockSkewToleranceMs, receivedTimestamp]
    );
  }

  // Step C: Grace Period for recently expired orders (within 30 minutes of creation)
  if (!matchingOrder) {
    const gracePeriodMs = 30 * 60 * 1000;
    matchingOrder = await query.get(
      `SELECT * FROM orders 
       WHERE status = 'EXPIRED'
         AND ROUND(amount, 2) = ROUND(?, 2)
         AND (? - created_at) <= ?
       ORDER BY created_at DESC 
       LIMIT 1`,
      [amount, receivedTimestamp, gracePeriodMs]
    );
    if (matchingOrder) {
      console.log(`[MatchingEngine] Auto-revived expired order ${matchingOrder.order_code} for payment!`);
    }
  }

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

    // Log Activity
    const orderOrigin = matchingOrder.webhook_url ? (matchingOrder.webhook_url.startsWith('http') ? new URL(matchingOrder.webhook_url).origin : '') : '';
    await logActivity({
      eventType: 'ORDER_PAID',
      status: 'SUCCESS',
      title: `Order Paid: ${matchingOrder.order_code}`,
      details: `₹${amount} auto-matched via ${source}. UTR: ${utr}, Sender: ${sender}.`,
      origin: orderOrigin
    });

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

      ioInstance.to('admin_room').emit('api_log', {
        event_type: 'ORDER_PAID',
        status: 'SUCCESS',
        title: `Order Paid: ${matchingOrder.order_code}`,
        details: `₹${amount} auto-matched via ${source}. UTR: ${utr}`,
        origin: orderOrigin,
        created_at: Date.now()
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

    await logActivity({
      eventType: 'UNMATCHED_PAYMENT',
      status: 'WARNING',
      title: `Unmatched Payment: ₹${amount}`,
      details: `Received ₹${amount} (UTR: ${utr}) from ${sender}. No matching order open.`
    });

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
      ioInstance.to('admin_room').emit('api_log', {
        event_type: 'UNMATCHED_PAYMENT',
        status: 'WARNING',
        title: `Unmatched Payment: ₹${amount}`,
        details: `UTR: ${utr} (${sender})`,
        created_at: Date.now()
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
export async function triggerWebhook(webhookUrl, orderData, eventType = 'payment.success') {
  if (!webhookUrl) return;
  const origin = webhookUrl.startsWith('http') ? new URL(webhookUrl).origin : webhookUrl;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const payload = {
      event: eventType,
      timestamp: Date.now(),
      data: {
        orderCode: orderData.order_code,
        amount: orderData.amount,
        status: orderData.status || (eventType === 'payment.success' ? 'PAID' : (eventType === 'order.expired' ? 'EXPIRED' : 'FAILED')),
        utr: orderData.utr || null,
        sender: orderData.sender_info || null,
        paidAt: orderData.paid_at || null,
        failureReason: orderData.failure_reason || null
      }
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Personal-UPI-Gateway-Webhook/1.0'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const status = response.ok ? 'SUCCESS' : 'FAILED';
    if (orderData.id) {
      await query.run('UPDATE orders SET webhook_status = ? WHERE id = ?', [status, orderData.id]);
    }

    await logActivity({
      eventType: 'WEBHOOK_DISPATCH',
      status: response.ok ? 'SUCCESS' : 'FAILED',
      title: `Webhook Dispatched: ${eventType} (${status})`,
      details: `Event "${eventType}" for ${orderData.order_code} (₹${orderData.amount}) dispatched to ${webhookUrl}. HTTP Status: ${response.status}`,
      origin
    });

    if (ioInstance) {
      ioInstance.to('admin_room').emit('api_log', {
        event_type: 'WEBHOOK_DISPATCH',
        status: response.ok ? 'SUCCESS' : 'FAILED',
        title: `Webhook ${eventType} -> ${status}`,
        details: `${orderData.order_code} -> ${webhookUrl}`,
        origin,
        created_at: Date.now()
      });
    }

    return { success: response.ok, status: response.status };
  } catch (err) {
    console.error(`[Webhook] Failed to dispatch ${eventType} to ${webhookUrl}:`, err.message);
    if (orderData.id) {
      await query.run('UPDATE orders SET webhook_status = ? WHERE id = ?', ['FAILED', orderData.id]);
    }

    await logActivity({
      eventType: 'WEBHOOK_DISPATCH',
      status: 'FAILED',
      title: `Webhook Dispatch Failed: ${eventType}`,
      details: `Failed to deliver ${eventType} for ${orderData.order_code} to ${webhookUrl}: ${err.message}`,
      origin
    });

    if (ioInstance) {
      ioInstance.to('admin_room').emit('api_log', {
        event_type: 'WEBHOOK_DISPATCH',
        status: 'FAILED',
        title: `Webhook ${eventType} Failed`,
        details: `${orderData.order_code} -> ${webhookUrl}: ${err.message}`,
        origin,
        created_at: Date.now()
      });
    }

    return { success: false, error: err.message };
  }
}

export default { processIncomingPayment, claimOrderWithUtr, setSocketIO, triggerWebhook };
