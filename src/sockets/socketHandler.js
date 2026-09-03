import logger from '../utils/logger.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    // Join specific order room
    socket.on('join_order', (orderCode) => {
      socket.join(`order_${orderCode}`);
      logger.debug(`Socket ${socket.id} joined room order_${orderCode}`);
    });

    // Join admin dashboard room
    socket.on('join_admin', () => {
      socket.join('admin_room');
      logger.debug(`Socket ${socket.id} joined room admin_room`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });
}

export default setupSocketHandlers;
