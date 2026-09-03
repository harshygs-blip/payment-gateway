import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../config.js';
import { parsePaymentEmail } from './emailParser.js';
import { processIncomingPayment } from './matchingEngine.js';

let client = null;
let isRunning = false;
let globalIo = null;

let statusInfo = {
  enabled: config.imap.enabled,
  connected: false,
  listening: false,
  lastCheckedAt: null,
  lastError: null,
  processedCount: 0,
  user: config.imap.user || '',
  host: config.imap.host || 'imap.gmail.com'
};

export function getImapStatus() {
  return {
    ...statusInfo,
    enabled: config.imap.enabled,
    user: config.imap.user || ''
  };
}

/**
 * Test IMAP connection with given or configured credentials without keeping a persistent lock
 */
export async function testImapConnection(creds = {}) {
  const host = creds.host || config.imap.host;
  const port = parseInt(creds.port || config.imap.port, 10);
  const secure = creds.secure !== undefined ? creds.secure : config.imap.secure;
  const user = (creds.user || config.imap.user || '').trim();
  const pass = (creds.pass || config.imap.pass || '').trim().replace(/\s+/g, ''); // remove any accidental spaces in app password

  if (!user || !pass) {
    return {
      success: false,
      error: 'Gmail Address and 16-character App Password are required.'
    };
  }

  const testClient = new ImapFlow({
    host,
    port,
    secure,
    auth: { user, pass },
    logger: false
  });

  // Prevent unhandled error event crash on socket timeout or auth failure
  let connectionError = null;
  testClient.on('error', (err) => {
    connectionError = err;
  });

  try {
    await testClient.connect();
    const mailbox = await testClient.status(creds.mailbox || config.imap.mailbox || 'INBOX', { messages: true, unseen: true });
    await testClient.logout();

    return {
      success: true,
      user,
      host,
      totalMessages: mailbox.messages || 0,
      unseenMessages: mailbox.unseen || 0
    };
  } catch (err) {
    const errorToReport = connectionError || err;
    let friendlyError = errorToReport.message || 'Connection failed';
    const msg = friendlyError.toLowerCase();
    if (msg.includes('invalid credentials') || msg.includes('authenticationfailed') || msg.includes('command failed') || msg.includes('auth') || msg.includes('timeout')) {
      friendlyError = 'Invalid Gmail credentials or connection timeout. Make sure 2-Step Verification is ON in your Google Account and you are using a 16-character Google App Password (without spaces).';
    }
    return {
      success: false,
      error: friendlyError
    };
  }
}

/**
 * Fetch the latest 5 emails matching the filter for diagnostic inspection
 */
export async function fetchRecentPaymentEmails(limit = 5) {
  if (!config.imap.user || !config.imap.pass) {
    return { success: false, error: 'IMAP credentials not configured' };
  }

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: {
      user: config.imap.user,
      pass: config.imap.pass.replace(/\s+/g, '')
    },
    logger: false
  });

  client.on('error', (err) => {
    console.error('[IMAP Diagnostic Client Error]:', err.message);
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.imap.mailbox);
    const emails = [];

    try {
      // Fetch the last `limit` messages from mailbox
      const status = await client.status(config.imap.mailbox, { messages: true });
      const total = status.messages;
      if (total > 0) {
        const startSeq = Math.max(1, total - limit + 1);
        for await (const message of client.fetch(`${startSeq}:${total}`, { source: true, envelope: true })) {
          const parsed = await simpleParser(message.source);
          const subject = parsed.subject || '';
          const from = parsed.from?.text || '';
          const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
          const paymentData = parsePaymentEmail(subject, body, parsed.date || new Date());

          emails.unshift({
            uid: message.uid,
            subject,
            from,
            date: parsed.date,
            parsedPayment: paymentData.success ? {
              amount: paymentData.amount,
              utr: paymentData.utr,
              sender: paymentData.sender
            } : null
          });
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }

    return { success: true, emails };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Start the persistent IMAP IDLE listener
 */
export async function startImapListener(io = null) {
  if (io) globalIo = io;

  if (!config.imap.enabled) {
    console.log('[IMAP] IMAP listener is currently disabled.');
    statusInfo.enabled = false;
    statusInfo.connected = false;
    statusInfo.listening = false;
    if (globalIo) globalIo.to('admin_room').emit('imap_status', getImapStatus());
    return;
  }

  const user = (config.imap.user || '').trim();
  const pass = (config.imap.pass || '').trim().replace(/\s+/g, '');

  if (!user || !pass) {
    console.warn('[IMAP] Missing IMAP credentials in settings/env.');
    statusInfo.lastError = 'Missing Gmail credentials. Configure in Settings.';
    statusInfo.connected = false;
    statusInfo.listening = false;
    if (globalIo) globalIo.to('admin_room').emit('imap_status', getImapStatus());
    return;
  }

  statusInfo.enabled = true;
  statusInfo.user = user;
  isRunning = true;

  try {
    // Disconnect old client if exists
    if (client) {
      try { await client.logout(); } catch (_) {}
    }

    client = new ImapFlow({
      host: config.imap.host,
      port: config.imap.port,
      secure: config.imap.secure,
      auth: { user, pass },
      logger: false
    });

    client.on('error', (err) => {
      console.error('[IMAP Error]', err.message);
      statusInfo.connected = false;
      statusInfo.listening = false;
      statusInfo.lastError = err.message;
      if (globalIo) globalIo.to('admin_room').emit('imap_status', getImapStatus());
    });

    client.on('close', () => {
      console.log('[IMAP] Connection closed.');
      statusInfo.connected = false;
      statusInfo.listening = false;
      if (globalIo) globalIo.to('admin_room').emit('imap_status', getImapStatus());

      if (isRunning && config.imap.enabled) {
        console.log('[IMAP] Reconnecting in 10 seconds...');
        setTimeout(() => startImapListener(globalIo), 10000);
      }
    });

    console.log(`[IMAP] Connecting to ${config.imap.host} as ${user}...`);
    await client.connect();

    statusInfo.connected = true;
    statusInfo.lastError = null;
    console.log('[IMAP] Successfully authenticated with IMAP!');

    const lock = await client.getMailboxLock(config.imap.mailbox);
    try {
      statusInfo.listening = true;
      statusInfo.lastCheckedAt = Date.now();
      if (globalIo) globalIo.to('admin_room').emit('imap_status', getImapStatus());

      console.log(`[IMAP IDLE] Listening for new payment emails in ${config.imap.mailbox}...`);

      client.on('exists', async (data) => {
        console.log(`[IMAP] New email detected! Total inbox count: ${data.count}`);
        statusInfo.lastCheckedAt = Date.now();
        await fetchAndProcessLatestMessage(client, globalIo);
      });

      await client.idle();
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('[IMAP Start Failed]:', err.message);
    statusInfo.connected = false;
    statusInfo.listening = false;
    statusInfo.lastError = err.message;
    if (globalIo) globalIo.to('admin_room').emit('imap_status', getImapStatus());
  }
}

async function fetchAndProcessLatestMessage(imapClient, io) {
  try {
    const message = await imapClient.fetchOne('*', { source: true, envelope: true });
    if (!message || !message.source) return;

    const parsed = await simpleParser(message.source);
    const subject = parsed.subject || '';
    const fromAddress = parsed.from?.text || '';
    // Strip HTML tags for clean text parsing
    const bodyText = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
    const emailDate = parsed.date || new Date();

    console.log(`[IMAP] Incoming email from: "${fromAddress}", Subject: "${subject}"`);

    // Check sender filter
    const matchesFilter = config.imap.senderFilter.length === 0 ||
      config.imap.senderFilter.some(filter =>
        fromAddress.toLowerCase().includes(filter) || subject.toLowerCase().includes(filter)
      );

    if (!matchesFilter) {
      console.log(`[IMAP] Skipped (does not match filter: ${config.imap.senderFilter.join(', ')})`);
      return;
    }

    const paymentData = parsePaymentEmail(subject, bodyText, emailDate);
    if (paymentData.success && paymentData.amount) {
      console.log(`[IMAP] ✅ Payment Extracted: ₹${paymentData.amount}, UTR: ${paymentData.utr}`);
      statusInfo.processedCount++;

      await processIncomingPayment({
        amount: paymentData.amount,
        utr: paymentData.utr,
        sender: paymentData.sender || fromAddress,
        receivedAt: paymentData.receivedAt,
        source: 'IMAP',
        rawSnippet: paymentData.rawSnippet
      });

      if (io) io.to('admin_room').emit('imap_status', getImapStatus());
    }
  } catch (err) {
    console.error('[IMAP Parse Error]:', err.message);
  }
}

export async function stopImapListener() {
  isRunning = false;
  config.imap.enabled = false;
  if (client) {
    try { await client.logout(); } catch (_) {}
    client = null;
  }
  statusInfo.enabled = false;
  statusInfo.connected = false;
  statusInfo.listening = false;
  if (globalIo) globalIo.to('admin_room').emit('imap_status', getImapStatus());
}

export async function restartImapListener(newConfig = null, io = null) {
  if (newConfig) {
    if (newConfig.user !== undefined) config.imap.user = newConfig.user.trim();
    if (newConfig.pass !== undefined) config.imap.pass = newConfig.pass.trim().replace(/\s+/g, '');
    if (newConfig.enabled !== undefined) config.imap.enabled = Boolean(newConfig.enabled);
    if (newConfig.host) config.imap.host = newConfig.host.trim();
    if (newConfig.port) config.imap.port = parseInt(newConfig.port, 10);
    if (newConfig.senderFilter) {
      config.imap.senderFilter = newConfig.senderFilter.split(',').map(s => s.trim().toLowerCase());
    }
  }

  await stopImapListener();
  if (config.imap.enabled) {
    await startImapListener(io || globalIo);
  }
}

export default {
  startImapListener,
  stopImapListener,
  restartImapListener,
  testImapConnection,
  fetchRecentPaymentEmails,
  getImapStatus
};
