import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { ImapController } from '../controllers/imap.controller.js';
import { LedgerController } from '../controllers/ledger.controller.js';

const router = Router();

// Stats & Dashboard
router.get('/stats', AdminController.getStats);
router.get('/orders', AdminController.getOrders);
router.get('/payments', AdminController.getPayments);
router.post('/simulate-payment', AdminController.simulatePayment);
router.post('/settings', AdminController.updateSettings);

// IMAP Controller endpoints
router.post('/imap/test', ImapController.testConnection);
router.post('/imap/restart', ImapController.restartListener);
router.get('/imap/recent', ImapController.getRecentEmails);
router.post('/imap/sync-history', ImapController.syncHistory);

// Financial Ledger endpoints
router.get('/ledger', LedgerController.getSummary);
router.post('/ledger/parse-paste', LedgerController.parsePaste);

export default router;
