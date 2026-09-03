import { initDatabase, query } from '../db/database.js';
import { processIncomingPayment, claimOrderWithUtr } from '../services/matchingEngine.js';

async function runIntegrationTest() {
  console.log('--- Starting Integration Test: Database & Time-Window Matching Engine ---');
  await initDatabase();

  // 1. Create a test order for ₹350.00
  const orderCode = `ORD-TEST-${Date.now().toString().slice(-4)}`;
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000;

  const orderInsert = await query.run(
    `INSERT INTO orders (order_code, amount, customer_name, status, created_at, expires_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?)`,
    [orderCode, 350.00, 'Test User', now, expiresAt]
  );
  console.log(`✅ [1/5] Created test order ${orderCode} for ₹350.00 (ID: ${orderInsert.lastID})`);

  // 2. Simulate incoming payment within the time-window
  const testUtr = `UTR-${Date.now()}`;
  const matchResult = await processIncomingPayment({
    amount: 350.00,
    utr: testUtr,
    sender: 'harsh@fam',
    receivedAt: now + 15000, // 15 seconds after order creation
    source: 'TEST',
    rawSnippet: `Received ₹350 from harsh@fam. UTR: ${testUtr}`
  });

  if (matchResult.matched && matchResult.order.status === 'PAID') {
    console.log(`✅ [2/5] Payment matched with order ${matchResult.order.order_code}! Status = PAID`);
  } else {
    console.error('❌ [2/5] Failed to match payment with active order:', matchResult);
    process.exit(1);
  }

  // 3. Test Duplicate Prevention with the same UTR
  const duplicateResult = await processIncomingPayment({
    amount: 350.00,
    utr: testUtr,
    sender: 'harsh@fam',
    receivedAt: now + 20000,
    source: 'TEST'
  });

  if (duplicateResult.reason === 'DUPLICATE_PAYMENT') {
    console.log('✅ [3/5] Duplicate payment with same UTR correctly prevented.');
  } else {
    console.error('❌ [3/5] Duplicate payment was not prevented!', duplicateResult);
    process.exit(1);
  }

  // 4. Test Unmatched Payment (e.g. ₹999.00 with no active order)
  const unmatchedResult = await processIncomingPayment({
    amount: 999.00,
    utr: `UNMATCHED-${Date.now()}`,
    sender: 'someone@upi',
    receivedAt: now,
    source: 'TEST'
  });

  if (!unmatchedResult.matched && unmatchedResult.reason === 'NO_ACTIVE_ORDER_FOUND') {
    console.log('✅ [4/5] Unmatched payment correctly recorded with is_matched = 0.');
  } else {
    console.error('❌ [4/5] Unmatched payment handling failed:', unmatchedResult);
    process.exit(1);
  }

  // 5. Test Manual UTR Claim Fallback
  // Create another order for ₹120.00
  const orderCode2 = `ORD-MANUAL-${Date.now().toString().slice(-4)}`;
  await query.run(
    `INSERT INTO orders (order_code, amount, customer_name, status, created_at, expires_at)
     VALUES (?, 120.00, 'Manual Test', 'PENDING', ?, ?)`,
    [orderCode2, now, expiresAt]
  );

  const manualUtr = `MANUAL-UTR-${Date.now()}`;
  // Payment arrived as unmatched first
  await processIncomingPayment({
    amount: 120.00,
    utr: manualUtr,
    sender: 'manual@upi',
    receivedAt: now - 300000, // arrived slightly earlier or out of sync
    source: 'TEST'
  });

  // Customer claims with UTR
  const claimResult = await claimOrderWithUtr(orderCode2, manualUtr);
  if (claimResult.success && claimResult.order.status === 'PAID') {
    console.log('✅ [5/5] Manual UTR claim successfully matched and resolved order to PAID!');
  } else {
    console.error('❌ [5/5] Manual UTR claim failed:', claimResult);
    process.exit(1);
  }

  console.log('\n🎉 ALL 5 INTEGRATION TESTS PASSED PERFECTLY!\n');
  process.exit(0);
}

runIntegrationTest().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
