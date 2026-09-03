let socket = null;
let currentFilter = 'ALL';

// Elements
const metricRevenue = document.getElementById('metricRevenue');
const metricTotalOrders = document.getElementById('metricTotalOrders');
const metricPaidOrders = document.getElementById('metricPaidOrders');
const metricConversion = document.getElementById('metricConversion');
const metricPendingOrders = document.getElementById('metricPendingOrders');

const imapDot = document.getElementById('imapDot');
const imapText = document.getElementById('imapText');

const ordersTableBody = document.getElementById('ordersTableBody');
const paymentsFeed = document.getElementById('paymentsFeed');
const paymentsCount = document.getElementById('paymentsCount');

const simulatorForm = document.getElementById('simulatorForm');
const simAmount = document.getElementById('simAmount');
const simUtr = document.getElementById('simUtr');
const simSender = document.getElementById('simSender');
const btnSimulate = document.getElementById('btnSimulate');
const simResult = document.getElementById('simResult');

const createOrderForm = document.getElementById('createOrderForm');
const orderAmount = document.getElementById('orderAmount');
const orderCustomerName = document.getElementById('orderCustomerName');
const orderCustomerPhone = document.getElementById('orderCustomerPhone');
const orderWebhook = document.getElementById('orderWebhook');

const settingsForm = document.getElementById('settingsForm');
const settingUpiVpa = document.getElementById('settingUpiVpa');
const settingMerchantName = document.getElementById('settingMerchantName');
const settingExpiryMinutes = document.getElementById('settingExpiryMinutes');

const settingImapEnabled = document.getElementById('settingImapEnabled');
const settingImapUser = document.getElementById('settingImapUser');
const settingImapPass = document.getElementById('settingImapPass');
const settingImapFilter = document.getElementById('settingImapFilter');
const btnTestImap = document.getElementById('btnTestImap');
const imapTestFeedback = document.getElementById('imapTestFeedback');

// Modal Helpers
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

document.getElementById('btnOpenCreateOrder').addEventListener('click', () => openModal('modalCreateOrder'));
document.getElementById('btnOpenSettings').addEventListener('click', () => openModal('modalSettings'));

// Close modal on click outside
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// 1. Load Stats
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

    // Populate Settings modal
    settingUpiVpa.value = stats.merchantVpa || '';
    settingMerchantName.value = stats.merchantName || '';
    settingExpiryMinutes.value = stats.expiryMinutes || 5;
    if (stats.imapStatus) {
      settingImapEnabled.checked = Boolean(stats.imapStatus.enabled);
      if (stats.imapStatus.user) settingImapUser.value = stats.imapStatus.user;
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
    imapText.innerText = 'IMAP: Disabled (Simulator Active)';
  } else if (status.connected && status.listening) {
    imapDot.classList.add('connected');
    imapText.innerText = 'IMAP: Live Listening';
  } else if (status.connected) {
    imapDot.classList.add('idle');
    imapText.innerText = 'IMAP: Connected';
  } else {
    imapDot.classList.add('disconnected');
    imapText.innerText = status.lastError ? `IMAP: Error` : 'IMAP: Disconnected';
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
      
      // Load updated data
      loadStats();
      loadOrders(currentFilter);

      // Pre-fill simulator with this amount for quick testing!
      simAmount.value = data.order.amount;

      // Open new checkout page in new tab
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

// 6. Test IMAP Button Handler
btnTestImap.addEventListener('click', async () => {
  const user = settingImapUser.value.trim();
  const pass = settingImapPass.value.trim();

  if (!user || !pass) {
    imapTestFeedback.style.display = 'block';
    imapTestFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    imapTestFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    imapTestFeedback.style.color = '#f87171';
    imapTestFeedback.innerText = '⚠️ Please enter both your Gmail address and 16-character App Password to test.';
    return;
  }

  btnTestImap.disabled = true;
  btnTestImap.innerText = '⏳ Connecting to Gmail IMAP...';
  imapTestFeedback.style.display = 'none';

  try {
    const res = await fetch('/api/admin/imap/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });

    const data = await res.json();
    imapTestFeedback.style.display = 'block';

    if (data.success) {
      imapTestFeedback.style.background = 'rgba(16, 185, 129, 0.15)';
      imapTestFeedback.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      imapTestFeedback.style.color = '#34d399';
      imapTestFeedback.innerHTML = `✅ <b>Connection Successful!</b><br>Authenticated with Gmail. Found <b>${data.totalMessages}</b> messages in INBOX (${data.unseenMessages} unread).`;
    } else {
      imapTestFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
      imapTestFeedback.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      imapTestFeedback.style.color = '#f87171';
      imapTestFeedback.innerHTML = `❌ <b>Connection Failed:</b><br>${data.error}`;
    }
  } catch (err) {
    imapTestFeedback.style.display = 'block';
    imapTestFeedback.style.background = 'rgba(239, 68, 68, 0.15)';
    imapTestFeedback.style.color = '#f87171';
    imapTestFeedback.innerText = 'Network error testing IMAP: ' + err.message;
  } finally {
    btnTestImap.disabled = false;
    btnTestImap.innerText = '🔍 Test Connection';
  }
});

// 7. Settings Handler
settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById('btnSaveSettings');
  saveBtn.disabled = true;
  saveBtn.innerText = 'Saving...';

  try {
    // 1. Save general settings
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upiVpa: settingUpiVpa.value,
        merchantName: settingMerchantName.value,
        expiryMinutes: settingExpiryMinutes.value
      })
    });
    const data = await res.json();

    // 2. Restart/Update IMAP listener if configured
    const imapPayload = {
      enabled: settingImapEnabled.checked,
      user: settingImapUser.value.trim(),
      senderFilter: settingImapFilter.value
    };
    if (settingImapPass.value.trim()) {
      imapPayload.pass = settingImapPass.value.trim();
    }

    const imapRes = await fetch('/api/admin/imap/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(imapPayload)
    });
    const imapData = await imapRes.json();

    if (data.success) {
      alert('Settings updated successfully! IMAP Listener is ' + (settingImapEnabled.checked ? 'ENABLED' : 'DISABLED') + '.');
      closeModal('modalSettings');
      loadStats();
    }
  } catch (err) {
    alert('Failed to update settings: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = 'Save Settings & Update Gateway';
  }
});

// 7. WebSockets Realtime Sync
function initSocket() {
  if (typeof io === 'undefined') return;

  socket = io();

  socket.on('connect', () => {
    console.log('[Socket Admin] Connected.');
    socket.emit('join_admin');
  });

  socket.on('new_order', (order) => {
    console.log('[Socket] New order created:', order);
    loadStats();
    loadOrders(currentFilter);
  });

  socket.on('payment_event', (event) => {
    console.log('[Socket] Payment event:', event);
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
