import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { ImapController } from '../controllers/imap.controller.js';
import { LedgerController } from '../controllers/ledger.controller.js';
import { ApiKeyController } from '../controllers/apiKey.controller.js';
import { adminAuth } from '../middlewares/adminAuth.js';
import { config } from '../../config.js';
import { SettingModel } from '../models/setting.model.js';

const router = Router();

// Public: Verify Master Key to Unlock Dashboard
router.post('/auth/verify-master-key', (req, res) => {
  const { masterKey } = req.body;
  const currentKey = config.adminSecret || 'shivambhatt@admin';
  if (masterKey && masterKey.trim() === currentKey) {
    return res.json({ success: true, message: 'Master Key Verified. Access Granted.' });
  }
  return res.status(401).json({ success: false, error: 'Invalid Master Key. Access Denied.' });
});

// Protect ALL routes below with Master Key authentication
router.use(adminAuth);

// Update Master Key
router.post('/auth/change-master-key', async (req, res) => {
  const { newMasterKey } = req.body;
  if (!newMasterKey || newMasterKey.trim().length < 4) {
    return res.status(400).json({ success: false, error: 'Master Key must be at least 4 characters long' });
  }
  await SettingModel.setMasterKey(newMasterKey.trim());
  return res.json({ success: true, message: 'Master Key updated successfully' });
});

// Stats & Dashboard
router.get('/stats', AdminController.getStats);
router.get('/orders', AdminController.getOrders);
router.get('/payments', AdminController.getPayments);
router.post('/simulate-payment', AdminController.simulatePayment);
router.post('/settings', AdminController.updateSettings);

// API Key Management endpoints
router.get('/api-key', ApiKeyController.getApiKey);
router.post('/api-key/regenerate', ApiKeyController.regenerateApiKey);
router.post('/api-key/toggle', ApiKeyController.toggleRequireApiKey);

// IMAP Controller endpoints
router.post('/imap/test', ImapController.testConnection);
router.post('/imap/restart', ImapController.restartListener);
router.get('/imap/recent', ImapController.getRecentEmails);
router.post('/imap/sync-history', ImapController.syncHistory);

// Financial Ledger endpoints
router.get('/ledger', LedgerController.getSummary);
router.post('/ledger/parse-paste', LedgerController.parsePaste);

export default router;
