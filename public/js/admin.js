let socket = null;
let currentFilter = 'ALL';

// Elements - Metrics
const metricRevenue = document.getElementById('metricRevenue');
const metricTotalOrders = document.getElementById('metricTotalOrders');
const metricPaidOrders = document.getElementById('metricPaidOrders');
const metricConversion = document.getElementById('metricConversion');
const metricPendingOrders = document.getElementById('metricPendingOrders');

const imapDot = document.getElementById('imapDot');
const imapText = document.getElementById('imapText');
const uiImapBadge = document.getElementById('uiImapBadge');

const ordersTableBody = document.getElementById('ordersTableBody');
const paymentsFeed = document.getElementById('paymentsFeed');
const paymentsCount = document.getElementById('paymentsCount');

// Elements - Simulator
const simulatorForm = document.getElementById('simulatorForm');
const simAmount = document.getElementById('simAmount');
const simUtr = document.getElementById('simUtr');
const simSender = document.getElementById('simSender');
const btnSimulate = document.getElementById('btnSimulate');
const simResult = document.getElementById('simResult');

// Elements - Create Order Modal
const createOrderForm = document.getElementById('createOrderForm');
const orderAmount = document.getElementById('orderAmount');
const orderCustomerName = document.getElementById('orderCustomerName');
const orderCustomerPhone = document.getElementById('orderCustomerPhone');
const orderWebhook = document.getElementById('orderWebhook');

// Elements - Frontend Configurator
const frontendImapForm = document.getElementById('frontendImapForm');
const uiImapEnabled = document.getElementById('uiImapEnabled');
const uiImapUser = document.getElementById('uiImapUser');
const uiImapPass = document.getElementById('uiImapPass');
const uiImapFilter = document.getElementById('uiImapFilter');
const btnToggleShowPass = document.getElementById('btnToggleShowPass');
const uiBtnTestImap = document.getElementById('uiBtnTestImap');
const uiBtnSaveImap = document.getElementById('uiBtnSaveImap');
const uiImapFeedback = document.getElementById('uiImapFeedback');

const frontendSettingsForm = document.getElementById('frontendSettingsForm');
const uiUpiVpa = document.getElementById('uiUpiVpa');
const uiMerchantName = document.getElementById('uiMerchantName');
const uiExpiryMinutes = document.getElementById('uiExpiryMinutes');
const uiBtnSaveSettings = document.getElementById('uiBtnSaveSettings');
const uiSettingsFeedback = document.getElementById('uiSettingsFeedback');

const uiBtnScanInbox = document.getElementById('uiBtnScanInbox');
const inboxScanResults = document.getElementById('inboxScanResults');

// Ledger DOM Elements
const btnSyncAllEmails = document.getElementById('btnSyncAllEmails');
const syncFeedback = document.getElementById('syncFeedback');
const ledgerTotalMoney = document.getElementById('ledgerTotalMoney');
const ledgerTotalCount = document.getElementById('ledgerTotalCount');
const ledgerTopCustomer = document.getElementById('ledgerTopCustomer');
const ledgerTopCustomerAmount = document.getElementById('ledgerTopCustomerAmount');
const ledgerTopSendersList = document.getElementById('ledgerTopSendersList');
const pasteEmailForm = document.getElementById('pasteEmailForm');
const pasteEmailInput = document.getElementById('pasteEmailInput');
const btnParsePaste = document.getElementById('btnParsePaste');
const pasteFeedback = document.getElementById('pasteFeedback');
const ledgerTableBody = document.getElementById('ledgerTableBody');

// Tab Switching Logic
function switchTab(tab) {
  document.getElementById('tabBtnDashboard').classList.toggle('active', tab === 'dashboard');
  document.getElementById('tabBtnLedger').classList.toggle('active', tab === 'ledger');
  document.getElementById('tabBtnConfig').classList.toggle('active', tab === 'config');
  document.getElementById('tabBtnApiKey').classList.toggle('active', tab === 'apiKey');

  document.getElementById('tabContentDashboard').classList.toggle('active', tab === 'dashboard');
  document.getElementById('tabContentLedger').classList.toggle('active', tab === 'ledger');
  document.getElementById('tabContentConfig').classList.toggle('active', tab === 'config');
  document.getElementById('tabContentApiKey').classList.toggle('active', tab === 'apiKey');

  if (tab === 'ledger') {
    loadLedger();
  } else if (tab === 'apiKey') {
    loadApiKeyDetails();
  }
}
window.switchTab = switchTab;

// Modal Helpers
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}
window.closeModal = closeModal;

document.getElementById('btnOpenCreateOrder').addEventListener('click', () => openModal('modalCreateOrder'));

window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// Show / Hide Password
btnToggleShowPass.addEventListener('click', () => {
  if (uiImapPass.type === 'password') {
    uiImapPass.type = 'text';
    btnToggleShowPass.innerText = '🔒';
  } else {
    uiImapPass.type = 'password';
    btnToggleShowPass.innerText = '👁️';
  }
});

// 1. Load Stats and Settings into UI
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (!data.success) return;

    const { stats } = data;
    metricRevenue.innerText = `₹ ${Number(stats.totalRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    metricTotalOrders.innerText = stats.totalOrders;
    metricPaidOrders.innerText = stats.paidOrders;
    metricPendingOrders.innerText = stats.pendingOrders;

    const rate = stats.totalOrders > 0 ? ((stats.paidOrders / stats.totalOrders) * 100).toFixed(1) : 0;
    metricConversion.innerText = `${rate}% Success Rate`;

    // IMAP Status
    updateImapPill(stats.imapStatus);

    // Populate Frontend Configurator fields
    uiUpiVpa.value = stats.merchantVpa || '';
    uiMerchantName.value = stats.merchantName || '';
    uiExpiryMinutes.value = stats.expiryMinutes || 5;

    if (stats.imapStatus) {
      uiImapEnabled.checked = Boolean(stats.imapStatus.enabled);
      if (stats.imapStatus.user) uiImapUser.value = stats.imapStatus.user;
    }
    if (stats.imapFilter) {
      uiImapFilter.value = stats.imapFilter;
    }

  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function updateImapPill(status) {
  if (!status) return;

  imapDot.className = 'status-dot';
  if (!status.enabled) {
    imapDot.classList.add('disconnected');
    imapText.innerText = 'IMAP: Disabled';
    if (uiImapBadge) {
      uiImapBadge.className = 'badge PENDING';
      uiImapBadge.innerText = 'Disabled';
    }
  } else if (status.connected && status.listening) {
    imapDot.classList.add('connected');
    imapText.innerText = 'IMAP: Live Listening';
    if (uiImapBadge) {
      uiImapBadge.className = 'badge PAID';
      uiImapBadge.innerText = 'Live Listening (Active)';
    }
  } else if (status.connected) {
    imapDot.classList.add('idle');
    imapText.innerText = 'IMAP: Connected';
    if (uiImapBadge) {
      uiImapBadge.className = 'badge PENDING';
      uiImapBadge.innerText = 'Connected (Idle)';
    }
  } else {
    imapDot.classList.add('disconnected');
    imapText.innerText = status.lastError ? `IMAP: Error` : 'IMAP: Disconnected';
    if (uiImapBadge) {
      uiImapBadge.className = 'badge EXPIRED';
      uiImapBadge.innerText = status.lastError || 'Disconnected';
    }
  }
}

// 2. Load Orders
async function loadOrders(filter = 'ALL') {
  currentFilter = filter;
  try {
    const res = await fetch(`/api/admin/orders?status=${filter}`);
    const data = await res.json();
    if (!data.success) return;

    renderOrders(data.orders);
  } catch (err) {
    console.error('Failed to load orders:', err);
  }
}

function renderOrders(orders) {
  if (!orders || orders.length === 0) {
    ordersTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">
          No orders found. Click "+ Create Order" to generate one.
        </td>
      </tr>
    `;
    return;
  }

  ordersTableBody.innerHTML = orders.map(ord => {
    const isPending = ord.status === 'PENDING';
    const isPaid = ord.status === 'PAID';
    const isExpired = ord.status === 'EXPIRED';

    let timeDetail = '-';
    if (isPaid) {
      timeDetail = `<span style="color: var(--accent-green);">Paid @ ${new Date(ord.paid_at || ord.created_at).toLocaleTimeString()}</span><br><span style="font-family: 'JetBrains Mono'; font-size: 11px; color: var(--text-dim);">${ord.utr || 'Auto'}</span>`;
    } else if (isPending) {
      const remainingSecs = Math.max(0, Math.floor((ord.expires_at - Date.now()) / 1000));
      const mins = Math.floor(remainingSecs / 60);
      const secs = remainingSecs % 60;
      timeDetail = `<span style="color: var(--accent-amber);">Expires in ${mins}m ${secs}s</span>`;
    } else if (isExpired) {
      timeDetail = `<span style="color: var(--text-dim);">Expired</span>`;
    }

    return `
      <tr>
        <td>
          <a href="/checkout/${ord.order_code}" target="_blank" class="code-badge" title="Open Customer Checkout">
            ${ord.order_code} ↗
          </a>
        </td>
        <td style="font-weight: 700; font-size: 15px;">₹ ${Number(ord.amount).toFixed(2)}</td>
        <td><span class="badge ${ord.status}">${ord.status}</span></td>
        <td>
          <div>${ord.customer_name || 'Guest'}</div>
          <div style="font-size: 11px; color: var(--text-dim);">${ord.customer_phone || ''}</div>
        </td>
        <td>${timeDetail}</td>
        <td>
          <a href="/checkout/${ord.order_code}" target="_blank" class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;">
            Open Page
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

// 3. Load Payments Log
async function loadPayments() {
  try {
    const res = await fetch('/api/admin/payments');
    const data = await res.json();
    if (!data.success) return;

    renderPayments(data.payments);
  } catch (err) {
    console.error('Failed to load payments:', err);
  }
}

function renderPayments(payments) {
  paymentsCount.innerText = `${payments.length} items`;

  if (!payments || payments.length === 0) {
    paymentsFeed.innerHTML = `
      <div style="font-size: 12px; color: var(--text-dim); text-align: center; padding: 20px;">
        No payments recorded yet.
      </div>
    `;
    return;
  }

  paymentsFeed.innerHTML = payments.map(p => {
    const isMatched = p.is_matched === 1;
    return `
      <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-card); border-radius: var(--radius-sm); padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 700; color: ${isMatched ? 'var(--accent-green)' : 'var(--accent-amber)'}; font-size: 14px;">
            ₹ ${Number(p.amount).toFixed(2)}
          </span>
          <span class="badge ${isMatched ? 'PAID' : 'PENDING'}" style="font-size: 10px;">
            ${isMatched ? `Matched: ${p.matched_order_code}` : 'Unmatched'}
          </span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono'; margin-bottom: 2px;">
          Ref: ${p.utr}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim);">
          <span>From: ${p.sender || 'Unknown'}</span>
          <span>${new Date(p.received_at).toLocaleTimeString()} (${p.source})</span>
        </div>
      </div>
    `;
  }).join('');
}

// 4. Create Order Handler
createOrderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitOrder');
  btn.disabled = true;
  btn.innerText = 'Creating...';

  try {
    const payload = {
      amount: orderAmount.value,
      customerName: orderCustomerName.value || 'Guest',
      customerPhone: orderCustomerPhone.value || '',
      webhookUrl: orderWebhook.value || ''
    };

    const headers = { 'Content-Type': 'application/json' };
    if (currentApiKey) {
      headers['x-api-key'] = currentApiKey;
    }

    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success && data.order) {
      closeModal('modalCreateOrder');
      createOrderForm.reset();
      
      loadStats();
      loadOrders(currentFilter);

      simAmount.value = data.order.amount;
      window.open(data.order.checkoutUrl, '_blank');
    } else {
      alert(data.error || 'Failed to create order');
    }
  } catch (err) {
    alert('Error creating order: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Generate Checkout Session';
  }
});

// 5. Simulator Handler
simulatorForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  btnSimulate.disabled = true;
  btnSimulate.innerText = 'Simulating...';
  simResult.style.display = 'none';

  try {
    const payload = {
      amount: simAmount.value,
      utr: simUtr.value || undefined,
      sender: simSender.value
    };

    const res = await fetch('/api/admin/simulate-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    simResult.style.display = 'block';

    if (data.success && data.result.matched) {
      simResult.style.color = '#10b981';
      simResult.innerHTML = `✅ <b>Success!</b> Matched with Order <b>${data.result.order.order_code}</b> for ₹${data.result.order.amount}!`;
    } else if (data.success && !data.result.matched) {
      simResult.style.color = '#f59e0b';
      simResult.innerHTML = `⚠️ Payment recorded, but <b>no active pending order</b> for ₹${simAmount.value} was open.`;
    } else {
      simResult.style.color = '#ef4444';
      simResult.innerHTML = `❌ ${data.result?.reason || 'Simulation failed'}`;
    }

    loadStats();
    loadOrders(currentFilter);
    loadPayments();

  } catch (err) {
    simResult.style.display = 'block';
    simResult.style.color = '#ef4444';
    simResult.innerText = 'Error simulating: ' + err.message;
  } finally {
    btnSimulate.disabled = false;
    btnSimulate.innerText = '🚀 Simulate Incoming Payment';
  }
});

// 6. Test IMAP 1-Click Button Handler
uiBtnTestImap.addEventListener('click', async () => {
  const user = uiImapUser.value.trim();
  const pass = uiImapPass.value.trim();

  if (!user || !pass) {
    uiImapFeedback.style.display = 'block';
    uiImapFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    uiImapFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    uiImapFeedback.style.color = '#f87171';
    uiImapFeedback.innerText = '⚠️ Please enter both your Gmail address and 16-character Google App Password to test.';
    return;
  }

  uiBtnTestImap.disabled = true;
  uiBtnTestImap.innerText = '⏳ Connecting to Gmail...';
  uiImapFeedback.style.display = 'none';

  try {
    const res = await fetch('/api/admin/imap/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });

    const data = await res.json();
    uiImapFeedback.style.display = 'block';

    if (data.success) {
      uiImapFeedback.style.background = 'rgba(16, 185, 129, 0.15)';
      uiImapFeedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      uiImapFeedback.style.color = '#34d399';
      uiImapFeedback.innerHTML = `✅ <b>Connection Successful!</b><br>Logged into Gmail. Found <b>${data.totalMessages}</b> emails in INBOX (${data.unseenMessages} unread).`;
    } else {
      uiImapFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
      uiImapFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      uiImapFeedback.style.color = '#f87171';
      uiImapFeedback.innerHTML = `❌ <b>Connection Failed:</b><br>${data.error}`;
    }
  } catch (err) {
    uiImapFeedback.style.display = 'block';
    uiImapFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    uiImapFeedback.style.color = '#f87171';
    uiImapFeedback.innerText = 'Network error: ' + err.message;
  } finally {
    uiBtnTestImap.disabled = false;
    uiBtnTestImap.innerText = '🔍 Test Connection (1-Click)';
  }
});

// 7. Save & Start Live IMAP Listener Handler (Zero .env)
frontendImapForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  uiBtnSaveImap.disabled = true;
  uiBtnSaveImap.innerText = 'Saving to Database...';

  try {
    const payload = {
      enabled: uiImapEnabled.checked,
      user: uiImapUser.value.trim(),
      senderFilter: uiImapFilter.value.trim()
    };
    if (uiImapPass.value.trim()) {
      payload.pass = uiImapPass.value.trim();
    }

    const res = await fetch('/api/admin/imap/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    uiImapFeedback.style.display = 'block';
    if (data.success) {
      uiImapFeedback.style.background = 'rgba(16, 185, 129, 0.15)';
      uiImapFeedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      uiImapFeedback.style.color = '#34d399';
      uiImapFeedback.innerHTML = `💾 <b>Settings Saved to Database!</b><br>IMAP Live Listener is now <b>${payload.enabled ? '🟢 ACTIVE & LISTENING' : '⚪ DISABLED'}</b>.`;
      loadStats();
    } else {
      uiImapFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
      uiImapFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      uiImapFeedback.style.color = '#f87171';
      uiImapFeedback.innerHTML = `❌ ${data.error || 'Failed to apply settings'}`;
    }
  } catch (err) {
    uiImapFeedback.style.display = 'block';
    uiImapFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    uiImapFeedback.style.color = '#f87171';
    uiImapFeedback.innerText = 'Failed: ' + err.message;
  } finally {
    uiBtnSaveImap.disabled = false;
    uiBtnSaveImap.innerText = '💾 Save & Start Live Listener';
  }
});

// 8. Save UPI & Merchant Settings (Zero .env)
frontendSettingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  uiBtnSaveSettings.disabled = true;
  uiBtnSaveSettings.innerText = 'Saving...';

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upiVpa: uiUpiVpa.value.trim(),
        merchantName: uiMerchantName.value.trim(),
        expiryMinutes: uiExpiryMinutes.value
      })
    });
    const data = await res.json();

    uiSettingsFeedback.style.display = 'block';
    if (data.success) {
      uiSettingsFeedback.style.background = 'rgba(16, 185, 129, 0.15)';
      uiSettingsFeedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      uiSettingsFeedback.style.color = '#34d399';
      uiSettingsFeedback.innerText = '✅ UPI settings saved to database successfully!';
      loadStats();
    } else {
      uiSettingsFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
      uiSettingsFeedback.style.color = '#f87171';
      uiSettingsFeedback.innerText = '❌ ' + data.error;
    }
  } catch (err) {
    uiSettingsFeedback.style.display = 'block';
    uiSettingsFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    uiSettingsFeedback.style.color = '#f87171';
    uiSettingsFeedback.innerText = 'Error: ' + err.message;
  } finally {
    uiBtnSaveSettings.disabled = false;
    uiBtnSaveSettings.innerText = '💾 Save UPI Settings';
  }
});

// 9. Scan Inbox Now Button (Diagnostic live tester)
uiBtnScanInbox.addEventListener('click', async () => {
  uiBtnScanInbox.disabled = true;
  uiBtnScanInbox.innerText = 'Scanning...';
  inboxScanResults.innerHTML = '<div style="text-align:center; color: var(--text-dim); padding: 14px;">Connecting to Gmail & scanning latest emails...</div>';

  try {
    const res = await fetch('/api/admin/imap/recent');
    const data = await res.json();

    if (data.success && data.emails && data.emails.length > 0) {
      inboxScanResults.innerHTML = data.emails.map(em => {
        const hasPayment = em.parsedPayment !== null;
        return `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-card); border-radius: 8px; padding: 10px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-weight: 600; font-size: 12px; color: #fff;">${em.subject}</span>
              <span class="badge ${hasPayment ? 'PAID' : 'PENDING'}" style="font-size: 10px;">
                ${hasPayment ? `Parsed: ₹${em.parsedPayment.amount}` : 'No Payment Pattern'}
              </span>
            </div>
            <div style="font-size: 11px; color: var(--text-dim);">From: ${em.from}</div>
            ${hasPayment ? `
              <div style="font-size: 11px; color: var(--accent-green); margin-top: 4px; font-family: 'JetBrains Mono';">
                UTR: ${em.parsedPayment.utr} | Sender: ${em.parsedPayment.sender}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    } else {
      inboxScanResults.innerHTML = `<div style="color: var(--accent-amber); font-size: 12px; padding: 14px; text-align: center;">${data.error || 'No matching emails found or IMAP credentials not connected yet.'}</div>`;
    }
  } catch (err) {
    inboxScanResults.innerHTML = `<div style="color: #ef4444; font-size: 12px; padding: 14px; text-align: center;">Error scanning: ${err.message}</div>`;
  } finally {
    uiBtnScanInbox.disabled = false;
    uiBtnScanInbox.innerText = '📥 Scan Inbox Now';
  }
});

// 10. WebSockets Realtime Sync
function initSocket() {
  if (typeof io === 'undefined') return;

  socket = io();

  socket.on('connect', () => {
    console.log('[Socket Admin] Connected.');
    socket.emit('join_admin');
  });

  socket.on('new_order', () => {
    loadStats();
    loadOrders(currentFilter);
  });

  socket.on('payment_event', () => {
    loadStats();
    loadOrders(currentFilter);
    loadPayments();
    loadLedger();
  });

  socket.on('order_expired', () => {
    loadStats();
    loadOrders(currentFilter);
  });

  socket.on('imap_status', (status) => {
    updateImapPill(status);
  });
}

// 11. Load Financial Ledger (Hisab-Kitab)
async function loadLedger() {
  try {
    const res = await fetch('/api/admin/ledger');
    const data = await res.json();
    if (!data.success || !data.ledger) return;

    const { totalCollected, totalTransactions, topSenders, payments } = data.ledger;

    // Metrics
    ledgerTotalMoney.innerText = `₹ ${Number(totalCollected).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    ledgerTotalCount.innerText = totalTransactions;

    if (topSenders && topSenders.length > 0) {
      ledgerTopCustomer.innerText = topSenders[0].sender;
      ledgerTopCustomerAmount.innerText = `₹${Number(topSenders[0].total).toFixed(2)} (${topSenders[0].count} payments)`;

      // Render Top Senders Breakdown
      ledgerTopSendersList.innerHTML = topSenders.map((s, idx) => {
        const pct = totalCollected > 0 ? ((s.total / totalCollected) * 100).toFixed(0) : 0;
        return `
          <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-card); border-radius: var(--radius-sm); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-weight: 700; color: #fff; font-size: 13px;">
                #${idx + 1} ${s.sender}
              </span>
              <span style="font-weight: 700; color: var(--accent-green); font-size: 14px;">
                ₹ ${Number(s.total).toFixed(2)}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim);">
              <span>${s.count} transactions</span>
              <span>${pct}% of total</span>
            </div>
          </div>
        `;
      }).join('');
    } else {
      ledgerTopCustomer.innerText = '-';
      ledgerTopCustomerAmount.innerText = 'No payments recorded yet';
      ledgerTopSendersList.innerHTML = `
        <div style="text-align: center; color: var(--text-dim); padding: 20px; font-size: 13px;">
          No customer history recorded yet. Sync with Gmail or paste an email.
        </div>
      `;
    }

    // Render Full Historical Ledger Table
    if (payments && payments.length > 0) {
      ledgerTableBody.innerHTML = payments.map(p => {
        return `
          <tr>
            <td style="font-size: 12px; color: var(--text-muted);">${new Date(p.received_at).toLocaleString()}</td>
            <td style="font-weight: 700; font-size: 15px; color: var(--accent-green);">₹ ${Number(p.amount).toFixed(2)}</td>
            <td style="font-weight: 600;">${p.sender || 'Unknown'}</td>
            <td style="font-family: 'JetBrains Mono'; font-size: 12px; color: #38bdf8;">${p.utr}</td>
            <td style="font-size: 12px; color: var(--text-dim);">${p.source}</td>
            <td><span class="badge PAID">VERIFIED IN LEDGER</span></td>
          </tr>
        `;
      }).join('');
    } else {
      ledgerTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-dim); padding: 30px;">
            No historical payments in ledger. Click "Sync Past Payments from Gmail" above!
          </td>
        </tr>
      `;
    }

  } catch (err) {
    console.error('Failed to load ledger:', err);
  }
}
window.loadLedger = loadLedger;

// 12. 1-Click Sync Past Payments from Gmail
btnSyncAllEmails.addEventListener('click', async () => {
  btnSyncAllEmails.disabled = true;
  btnSyncAllEmails.innerText = '⏳ Syncing All Past Emails from Gmail...';
  syncFeedback.style.display = 'block';
  syncFeedback.style.background = 'rgba(56, 189, 248, 0.15)';
  syncFeedback.style.border = '1px solid rgba(56, 189, 248, 0.3)';
  syncFeedback.style.color = '#38bdf8';
  syncFeedback.innerHTML = 'Connecting to Gmail inbox and scanning past payment receipts... Please wait 5-10 seconds.';

  try {
    const res = await fetch('/api/admin/imap/sync-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxEmails: 100 })
    });
    const data = await res.json();

    if (data.success) {
      syncFeedback.style.background = 'rgba(16, 185, 129, 0.15)';
      syncFeedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      syncFeedback.style.color = '#34d399';
      syncFeedback.innerHTML = `
        🎉 <b>Hisab-Kitab Complete!</b><br>
        Scanned <b>${data.scannedCount}</b> past emails.<br>
        Found & Imported <b>${data.importedCount}</b> payments totaling <b>₹${data.totalAmount.toFixed(2)}</b>!<br>
        (${data.duplicateCount} already existed in ledger).
      `;
      loadLedger();
      loadStats();
      loadPayments();
    } else {
      syncFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
      syncFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      syncFeedback.style.color = '#f87171';
      syncFeedback.innerHTML = `❌ <b>Sync Failed:</b><br>${data.error}`;
    }
  } catch (err) {
    syncFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    syncFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    syncFeedback.style.color = '#f87171';
    syncFeedback.innerText = 'Network error: ' + err.message;
  } finally {
    btnSyncAllEmails.disabled = false;
    btnSyncAllEmails.innerText = '🔄 1-Click Sync Past Payments from Gmail';
  }
});

// 13. Quick Paste Email to Parse & Add to Ledger
pasteEmailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const rawText = pasteEmailInput.value.trim();
  if (!rawText) return;

  btnParsePaste.disabled = true;
  btnParsePaste.innerText = 'Parsing...';
  pasteFeedback.style.display = 'none';

  try {
    const res = await fetch('/api/admin/ledger/parse-paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: rawText })
    });
    const data = await res.json();

    pasteFeedback.style.display = 'block';
    if (data.success) {
      pasteFeedback.style.background = 'rgba(16, 185, 129, 0.15)';
      pasteFeedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      pasteFeedback.style.color = '#34d399';
      pasteFeedback.innerHTML = `✅ <b>${data.message}</b>`;
      pasteEmailInput.value = '';
      loadLedger();
      loadStats();
      loadPayments();
    } else {
      pasteFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
      pasteFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      pasteFeedback.style.color = '#f87171';
      pasteFeedback.innerHTML = `❌ ${data.error}`;
    }
  } catch (err) {
    pasteFeedback.style.display = 'block';
    pasteFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    pasteFeedback.style.color = '#f87171';
    pasteFeedback.innerText = 'Error parsing: ' + err.message;
  } finally {
    btnParsePaste.disabled = false;
    btnParsePaste.innerText = '⚡ Parse & Add to Ledger';
  }
});

// ==================== 14. API KEY MANAGEMENT & INTEGRATION ==================== //
let currentApiKey = '';
let currentKeyCreated = null;
let currentRequireApiKey = true;
let isKeyVisible = false;
let activeSnippetLang = 'curl';

async function loadApiKeyDetails() {
  try {
    const res = await fetch('/api/admin/api-key');
    const data = await res.json();
    if (!data.success) return;

    currentApiKey = data.apiKey;
    currentRequireApiKey = data.requireApiKey;
    currentKeyCreated = data.createdAt;

    const input = document.getElementById('uiApiKeyInput');
    if (input) {
      input.value = currentApiKey;
      input.type = isKeyVisible ? 'text' : 'password';
    }

    const createdLabel = document.getElementById('apiKeyCreatedAt');
    if (createdLabel && data.createdAt) {
      createdLabel.innerText = `Created: ${new Date(data.createdAt).toLocaleDateString()} ${new Date(data.createdAt).toLocaleTimeString()}`;
    }

    const toggle = document.getElementById('uiToggleRequireApiKey');
    if (toggle) {
      toggle.checked = currentRequireApiKey;
    }

    const badge = document.getElementById('apiKeyStatusBadge');
    if (badge) {
      badge.className = currentRequireApiKey ? 'badge badge-success' : 'badge badge-pending';
      badge.innerText = currentRequireApiKey ? '🟢 Strictly Enforced' : '🔓 Open Testing';
    }

    renderCurrentSnippet();
  } catch (err) {
    console.error('Failed to load API key details:', err);
  }
}
window.loadApiKeyDetails = loadApiKeyDetails;

function toggleApiKeyVisibility() {
  const input = document.getElementById('uiApiKeyInput');
  const btn = document.getElementById('btnToggleApiKeyVisibility');
  if (!input) return;

  isKeyVisible = !isKeyVisible;
  input.type = isKeyVisible ? 'text' : 'password';
  btn.innerText = isKeyVisible ? '🙈' : '👁️';
}
window.toggleApiKeyVisibility = toggleApiKeyVisibility;

function copyApiKeyToClipboard() {
  if (!currentApiKey) return;
  navigator.clipboard.writeText(currentApiKey).then(() => {
    const feedback = document.getElementById('apiKeyCopyFeedback');
    if (feedback) {
      feedback.style.display = 'block';
      setTimeout(() => {
        feedback.style.display = 'none';
      }, 2500);
    }
  }).catch(err => {
    console.error('Clipboard copy error:', err);
  });
}
window.copyApiKeyToClipboard = copyApiKeyToClipboard;

async function confirmRegenerateApiKey() {
  const confirmed = confirm("⚠️ ARE YOU SURE?\\n\\nRegenerating this API Key will immediately invalidate the current key. Any external apps or websites using the old key will fail until updated.");
  if (!confirmed) return;

  try {
    const res = await fetch('/api/admin/api-key/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      alert(`🎉 New API Key Generated!\\n\\nKey: ${data.apiKey}\\n\\nPlease copy and update your applications.`);
      loadApiKeyDetails();
    } else {
      alert(`❌ Error: ${data.error}`);
    }
  } catch (err) {
    alert('Failed to regenerate API Key: ' + err.message);
  }
}
window.confirmRegenerateApiKey = confirmRegenerateApiKey;

async function toggleRequireApiKey(isRequired) {
  try {
    const res = await fetch('/api/admin/api-key/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ required: isRequired })
    });
    const data = await res.json();
    if (data.success) {
      const badge = document.getElementById('apiKeyStatusBadge');
      if (badge) {
        badge.className = data.requireApiKey ? 'badge badge-success' : 'badge badge-pending';
        badge.innerText = data.requireApiKey ? '🟢 Strictly Enforced' : '🔓 Open Testing';
      }
    }
  } catch (err) {
    console.error('Failed to toggle require API key:', err);
  }
}
window.toggleRequireApiKey = toggleRequireApiKey;

function switchCodeSnippet(lang) {
  activeSnippetLang = lang;
  document.getElementById('codeTabCurl')?.classList.toggle('active', lang === 'curl');
  document.getElementById('codeTabNodejs')?.classList.toggle('active', lang === 'nodejs');
  document.getElementById('codeTabPython')?.classList.toggle('active', lang === 'python');
  document.getElementById('codeTabPhp')?.classList.toggle('active', lang === 'php');
  renderCurrentSnippet();
}
window.switchCodeSnippet = switchCodeSnippet;

function renderCurrentSnippet() {
  const box = document.getElementById('codeSnippetBox');
  if (!box) return;

  const origin = window.location.origin;
  const key = currentApiKey || 'pg_live_YOUR_API_KEY_HERE';

  if (activeSnippetLang === 'curl') {
    box.innerText = `curl -X POST "${origin}/api/orders/create" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${key}" \\
  -d '{
    "amount": 500.00,
    "customerName": "Rahul Sharma",
    "customerPhone": "9876543210",
    "webhookUrl": "https://your-domain.com/webhook"
  }'`;
  } else if (activeSnippetLang === 'nodejs') {
    box.innerText = `// Node.js (v18+ with native fetch)
const response = await fetch('${origin}/api/orders/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '${key}'
  },
  body: JSON.stringify({
    amount: 500.00,
    customerName: 'Rahul Sharma',
    customerPhone: '9876543210',
    webhookUrl: 'https://your-domain.com/webhook'
  })
});

const data = await response.json();
if (data.success) {
  console.log('Order Code:', data.order.orderCode);
  console.log('Redirect User to:', '${origin}' + data.order.checkoutUrl);
  console.log('UPI Intent URI:', data.order.upiUri);
}`;
  } else if (activeSnippetLang === 'python') {
    box.innerText = `import requests

url = "${origin}/api/orders/create"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "${key}"
}
payload = {
    "amount": 500.00,
    "customerName": "Rahul Sharma",
    "customerPhone": "9876543210",
    "webhookUrl": "https://your-domain.com/webhook"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

if data.get("success"):
    print("Order Code:", data["order"]["orderCode"])
    print("Checkout URL:", "${origin}" + data["order"]["checkoutUrl"])`;
  } else if (activeSnippetLang === 'php') {
    box.innerText = `<?php
$curl = curl_init();

$payload = json_encode([
    "amount" => 500.00,
    "customerName" => "Rahul Sharma",
    "customerPhone" => "9876543210",
    "webhookUrl" => "https://your-domain.com/webhook"
]);

curl_setopt_array($curl, [
    CURLOPT_URL => "${origin}/api/orders/create",
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => "POST",
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        "Content-Type: application/json",
        "x-api-key: ${key}"
    ],
]);

$response = curl_exec($curl);
curl_close($curl);

$data = json_decode($response, true);
if ($data['success']) {
    echo "Order Code: " . $data['order']['orderCode'] . "\\n";
    echo "Checkout URL: ${origin}" . $data['order']['checkoutUrl'] . "\\n";
}`;
  }
}

function copyCurrentSnippet() {
  const box = document.getElementById('codeSnippetBox');
  if (!box) return;
  navigator.clipboard.writeText(box.innerText).then(() => {
    alert('✅ Code snippet copied to clipboard!');
  });
}
window.copyCurrentSnippet = copyCurrentSnippet;

async function testApiKeyOrderCreation() {
  const amountInput = document.getElementById('testOrderAmount');
  const resultBox = document.getElementById('apiTestConsoleResult');
  const amt = parseFloat(amountInput.value) || 10;

  resultBox.style.display = 'block';
  resultBox.innerText = 'Sending HTTP POST request with x-api-key...';

  try {
    const start = Date.now();
    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': currentApiKey
      },
      body: JSON.stringify({
        amount: amt,
        customerName: 'API Key Test Runner',
        customerPhone: '9999999999'
      })
    });
    const duration = Date.now() - start;
    const json = await res.json();

    resultBox.innerText = `HTTP ${res.status} ${res.statusText} (${duration}ms)\\n` + JSON.stringify(json, null, 2);
    if (json.success) {
      loadStats();
      loadOrders(currentFilter);
    }
  } catch (err) {
    resultBox.innerText = 'Network Error: ' + err.message;
  }
}
window.testApiKeyOrderCreation = testApiKeyOrderCreation;

// Initial Load
loadStats();
loadOrders('ALL');
loadPayments();
loadLedger();
loadApiKeyDetails();
initSocket();
