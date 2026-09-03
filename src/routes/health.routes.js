import { Router } from 'express';
import { query } from '../../db/database.js';
import { getImapStatus } from '../services/imapListener.service.js';

const router = Router();

router.get('/health', async (req, res) => {
  let dbStatus = 'HEALTHY';
  try {
    await query.get('SELECT 1');
  } catch (err) {
    dbStatus = `ERROR: ${err.message}`;
  }

  const imap = getImapStatus();
  const uptimeSeconds = Math.floor(process.uptime());

  const healthData = {
    status: dbStatus === 'HEALTHY' ? 'OK' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
    database: {
      engine: 'SQLite',
      status: dbStatus
    },
    imap: {
      enabled: imap.enabled,
      connected: imap.connected,
      listening: imap.listening,
      processedCount: imap.processedCount,
      lastCheckedAt: imap.lastCheckedAt ? new Date(imap.lastCheckedAt).toISOString() : null,
      lastError: imap.lastError
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsageMb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
    }
  };

  const statusCode = healthData.status === 'OK' ? 200 : 503;
  return res.status(statusCode).json(healthData);
});

export default router;
