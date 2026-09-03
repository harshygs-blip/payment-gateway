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

// Tab Switching Logic
function switchTab(tab) {
  document.getElementById('tabBtnDashboard').classList.toggle('active', tab === 'dashboard');
  document.getElementById('tabBtnConfig').classList.toggle('active', tab === 'config');

  document.getElementById('tabContentDashboard').classList.toggle('active', tab === 'dashboard');
  document.getElementById('tabContentConfig').classList.toggle('active', tab === 'config');
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

    const res = await fetch('/api/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  });

  socket.on('order_expired', () => {
    loadStats();
    loadOrders(currentFilter);
  });

  socket.on('imap_status', (status) => {
    updateImapPill(status);
  });
}

// Initial Load
loadStats();
loadOrders('ALL');
loadPayments();
initSocket();
