import { Router } from 'express';
import orderRoutes from './order.routes.js';
import adminRoutes from './admin.routes.js';
import healthRoutes from './health.routes.js';
import { OrderController } from '../controllers/order.controller.js';

const router = Router();

// Health Check
router.use('/', healthRoutes);

// QR Code generation endpoint
router.get('/qr', OrderController.getQrCode);

// Specific feature routers
router.use('/orders', orderRoutes);
router.use('/admin', adminRoutes);

export default router;
