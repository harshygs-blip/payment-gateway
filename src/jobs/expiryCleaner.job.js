import { OrderModel } from '../models/order.model.js';
import { triggerWebhook } from '../../services/matchingEngine.js';
import { logActivity } from '../../db/database.js';
import logger from '../utils/logger.js';

let intervalId = null;

export function startExpiryCleaner(io, intervalMs = 30000) {
  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(async () => {
    try {
      const now = Date.now();
      const expiredOrders = await OrderModel.findExpiredPending(now);

      for (const ord of expiredOrders) {
        await OrderModel.markAsExpired(ord.id);
        logger.info(`[Cleaner] Order expired: ${ord.order_code}`);

        // Log the expiry event in database
        await logActivity({
          eventType: 'ORDER_EXPIRED',
          status: 'WARNING',
          title: `Order Expired: ${ord.order_code}`,
          details: `₹${Number(ord.amount).toFixed(2)} order expired. No matching payment received within timeout.`
        });

        if (io) {
          io.to(`order_${ord.order_code}`).emit('order_status_update', {
            orderCode: ord.order_code,
            status: 'EXPIRED'
          });
          io.to('admin_room').emit('order_expired', { orderCode: ord.order_code });

          // Emit api_log event so dashboard shows this in real-time
          io.to('admin_room').emit('api_log', {
            event_type: 'ORDER_EXPIRED',
            status: 'WARNING',
            title: `Order Expired: ${ord.order_code}`,
            details: `₹${Number(ord.amount).toFixed(2)} expired`,
            created_at: now
          });
        }

        // Dispatch webhook for expired order so the external website knows
        if (ord.webhook_url) {
          triggerWebhook(ord.webhook_url, {
            id: ord.id,
            order_code: ord.order_code,
            amount: ord.amount,
            status: 'EXPIRED',
            failure_reason: 'PAYMENT_EXPIRED'
          }, 'order.expired');
        }
      }
    } catch (err) {
      logger.error(`[Cleaner Error]: ${err.message}`);
    }
  }, intervalMs);

  logger.info(`[Cleaner] Order expiry job scheduled (every ${intervalMs / 1000}s)`);
}

export function stopExpiryCleaner() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export default { startExpiryCleaner, stopExpiryCleaner };

