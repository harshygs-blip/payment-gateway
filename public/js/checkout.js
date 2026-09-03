// Extract orderCode from URL path (/checkout/:code)
const pathParts = window.location.pathname.split('/');
const orderCode = pathParts[pathParts.length - 1] || '';

let timerInterval = null;
let currentOrder = null;
let totalDurationSeconds = 300;

// Elements
const orderCodeBadge = document.getElementById('orderCodeBadge');
const orderCodeDisplay = document.getElementById('orderCodeDisplay');
const merchantName = document.getElementById('merchantName');
const amountDisplay = document.getElementById('amountDisplay');
const qrImage = document.getElementById('qrImage');
const timerClock = document.getElementById('timerClock');
const progressFill = document.getElementById('progressFill');
const statusMessage = document.getElementById('statusMessage');

const btnPayDirect = document.getElementById('btnPayDirect');
const btnGPay = document.getElementById('btnGPay');
const btnPhonePe = document.getElementById('btnPhonePe');
const btnPaytm = document.getElementById('btnPaytm');
const btnFamPay = document.getElementById('btnFamPay');
const btnNavi = document.getElementById('btnNavi');

const btnToggleUtr = document.getElementById('btnToggleUtr');
const utrBox = document.getElementById('utrBox');
const utrInput = document.getElementById('utrInput');
const btnSubmitUtr = document.getElementById('btnSubmitUtr');
const utrFeedback = document.getElementById('utrFeedback');

const successOverlay = document.getElementById('successOverlay');
const successOrderCode = document.getElementById('successOrderCode');
const successAmount = document.getElementById('successAmount');
const successUtr = document.getElementById('successUtr');
const successSender = document.getElementById('successSender');
const successTime = document.getElementById('successTime');

// 1. Fetch Order Details
async function loadOrder() {
  if (!orderCode) {
    statusMessage.innerText = 'Error: Invalid order link.';
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderCode}`);
    const data = await res.json();

    if (!data.success || !data.order) {
      statusMessage.innerText = data.error || 'Order not found or expired.';
      return;
    }

    currentOrder = data.order;
    renderOrder(currentOrder);

    // If already paid
    if (currentOrder.status === 'PAID') {
      showPaymentSuccess(currentOrder);
      return;
    }

    // If expired
    if (currentOrder.status === 'EXPIRED') {
      showExpired();
      return;
    }

    // Start live countdown timer
    startCountdown(currentOrder.timeRemainingSeconds);

    // Connect to WebSockets
    initRealtimeSocket();

  } catch (err) {
    console.error('Failed to load order:', err);
    statusMessage.innerText = 'Network error while loading payment details.';
  }
}

// 2. Render Order & QR
function renderOrder(order) {
  orderCodeDisplay.innerText = order.order_code;
  amountDisplay.innerText = `₹ ${Number(order.amount).toFixed(2)}`;

  // Set dynamic QR code image source
  qrImage.src = `/api/qr?data=${encodeURIComponent(order.upiUri)}`;

  // Mobile Intent Links
  btnPayDirect.href = order.upiUri;
  btnGPay.href = order.upiUri.replace('upi://', 'gpay://upi/');
  btnPhonePe.href = order.upiUri.replace('upi://', 'phonepe://');
  btnPaytm.href = order.upiUri.replace('upi://', 'paytmmp://');
  btnFamPay.href = order.upiUri; // FamPay registers standard upi:// scheme

  if (btnNavi) {
    const isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) {
      const rawParams = order.upiUri.replace(/^upi:\/\/pay\?/, '');
      btnNavi.href = `intent://pay?${rawParams}#Intent;scheme=upi;package=com.naviapp;end`;
    } else {
      btnNavi.href = order.upiUri;
    }
  }
}

// 3. Live Countdown
function startCountdown(remainingSeconds) {
  let timeLeft = remainingSeconds;
  totalDurationSeconds = remainingSeconds > 0 ? remainingSeconds : 300;

  updateTimerDisplay(timeLeft);

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      updateTimerDisplay(0);
      showExpired();
    } else {
      updateTimerDisplay(timeLeft);
    }
  }, 1000);
}

function updateTimerDisplay(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  timerClock.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  const percentage = (seconds / totalDurationSeconds) * 100;
  progressFill.style.width = `${Math.max(0, percentage)}%`;

  if (seconds < 60) {
    timerClock.style.color = '#ef4444';
    progressFill.style.background = '#ef4444';
  }
}

function showExpired() {
  statusMessage.innerText = 'Payment session expired! Please create a new order.';
  statusMessage.style.color = '#ef4444';
  qrImage.style.filter = 'grayscale(100%) opacity(30%)';
  btnPayDirect.style.pointerEvents = 'none';
  btnPayDirect.style.opacity = '0.5';
}

// 4. Connect WebSockets for Instant Push Alert
function initRealtimeSocket() {
  if (typeof io === 'undefined') return;

  const socket = io();

  socket.on('connect', () => {
    console.log('[Socket] Connected to realtime gateway.');
    // Join this specific order room
    socket.emit('join_order', orderCode);
  });

  socket.on('order_status_update', (data) => {
    console.log('[Socket] Order update received:', data);
    if (data.status === 'PAID') {
      showPaymentSuccess(data);
    } else if (data.status === 'EXPIRED') {
      showExpired();
    }
  });
}

// 5. Success Screen & Confetti
function showPaymentSuccess(data) {
  clearInterval(timerInterval);

  successOrderCode.innerText = data.orderCode || orderCode;
  successAmount.innerText = `₹ ${Number(data.amount || currentOrder.amount).toFixed(2)}`;
  successUtr.innerText = data.utr || 'Auto-Verified';
  successSender.innerText = data.sender || 'UPI Verified';
  successTime.innerText = new Date(data.paidAt || Date.now()).toLocaleTimeString();

  successOverlay.classList.add('active');

  // Trigger audio chime (Web Audio API synthesized tone)
  playSuccessSound();

  // Confetti explosion!
  triggerConfetti();
}

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (_) {}
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });
    }, 250);
  }
}

// 6. UTR Fallback Submission
btnToggleUtr.addEventListener('click', () => {
  utrBox.classList.toggle('open');
});

btnSubmitUtr.addEventListener('click', async () => {
  const val = utrInput.value.trim();
  if (val.length < 6) {
    utrFeedback.innerText = 'Please enter a valid 12-digit UTR/Ref number';
    utrFeedback.style.color = '#ef4444';
    return;
  }

  btnSubmitUtr.disabled = true;
  btnSubmitUtr.innerText = 'Verifying...';
  utrFeedback.innerText = '';

  try {
    const res = await fetch(`/api/orders/${orderCode}/verify-utr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ utr: val })
    });

    const data = await res.json();
    if (data.success && data.order?.status === 'PAID') {
      showPaymentSuccess(data.order);
    } else {
      utrFeedback.innerText = data.message || 'Payment not found for this UTR yet.';
      utrFeedback.style.color = '#f59e0b';
    }
  } catch (err) {
    utrFeedback.innerText = 'Error submitting UTR. Please retry.';
    utrFeedback.style.color = '#ef4444';
  } finally {
    btnSubmitUtr.disabled = false;
    btnSubmitUtr.innerText = 'Verify';
  }
});

// Copy Order ID
orderCodeBadge.addEventListener('click', () => {
  navigator.clipboard.writeText(orderCode);
  const oldText = orderCodeDisplay.innerText;
  orderCodeDisplay.innerText = 'Copied!';
  setTimeout(() => { orderCodeDisplay.innerText = oldText; }, 1500);
});

// Start
loadOrder();
