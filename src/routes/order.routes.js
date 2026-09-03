import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';
import { apiKeyAuth } from '../middlewares/apiKeyAuth.js';

const router = Router();

// Order creation is protected by API Key
router.post('/create', apiKeyAuth, OrderController.create);

// Public status check and manual UTR submission for checkout page
router.get('/:code', OrderController.getByCode);
router.post('/:code/verify-utr', OrderController.verifyUtr);

export default router;
