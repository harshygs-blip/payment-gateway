import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';

const router = Router();

router.post('/create', OrderController.create);
router.get('/:code', OrderController.getByCode);
router.post('/:code/verify-utr', OrderController.verifyUtr);

export default router;
