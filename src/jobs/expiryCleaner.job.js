import { OrderModel } from '../models/order.model.js';
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

        if (io) {
          io.to(`order_${ord.order_code}`).emit('order_status_update', {
            orderCode: ord.order_code,
            status: 'EXPIRED'
          });
          io.to('admin_room').emit('order_expired', { orderCode: ord.order_code });
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
