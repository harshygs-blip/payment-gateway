import { parsePaymentEmail } from '../services/emailParser.js';

console.log('--- Testing Email Parser with Real FamPay Samples ---');

const testCases = [
  {
    name: 'Real User Sample: FamPay (FamApp) Payment Email',
    subject: 'Money Received on FamPay',
    body: `Hey Chandan Jena,You have successfully received₹500.0from MEENA KUMARITransaction ID :FMPIB6527256761Date :06:10 PM IST, 03 September 2026Updated Balance :₹500.36UTR :214771578746Purpose :Sent using Paytm UPIIf this was not done by you, call us and report this at +91 8095858881 or email us at support@famapp.inBest, Fam.`,
    expectedAmount: 500,
    expectedUtr: '214771578746',
    expectedTxnId: 'FMPIB6527256761',
    expectedSender: 'MEENA KUMARI',
    expectedApp: 'Paytm UPI'
  },
  {
    name: 'FamPay Standard Notification with space',
    subject: 'You received money on FamPay!',
    body: 'You have received ₹250 from Rahul Sharma (rahul@okhdfcbank). UPI Ref: 423456789012',
    expectedAmount: 250,
    expectedUtr: '423456789012',
    expectedSender: 'Rahul Sharma'
  },
  {
    name: 'FamPay INR Credit Alert',
    subject: 'Money Credited!',
    body: 'INR 1500.00 credited to your FamPay account. Txn ID: FP98234812',
    expectedAmount: 1500,
    expectedUtr: 'FP98234812'
  },
  {
    name: 'Bank SMS/Email Alert',
    subject: 'Credit Alert: UPI Transaction',
    body: 'Dear Customer, A/C credited by Rs 1,250.50 on 04-Sep-26 by UPI/423456789012/Payment.',
    expectedAmount: 1250.50,
    expectedUtr: '423456789012'
  }
];

let passed = 0;
for (const tc of testCases) {
  const result = parsePaymentEmail(tc.subject, tc.body);

  const amountMatch = result.amount === tc.expectedAmount;
  const utrMatch = result.utr === tc.expectedUtr;
  const senderMatch = !tc.expectedSender || result.sender.toLowerCase().includes(tc.expectedSender.toLowerCase());

  if (amountMatch && utrMatch && senderMatch) {
    console.log(`✅ [PASS] ${tc.name}`);
    console.log(`   Amount:  ₹${result.amount}`);
    console.log(`   UTR:     ${result.utr}`);
    if (result.famPayTxnId) console.log(`   Txn ID:  ${result.famPayTxnId}`);
    console.log(`   Sender:  ${result.sender}`);
    if (result.sourceApp) console.log(`   App:     ${result.sourceApp}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${tc.name}`);
    console.error(`   Expected: Amount=${tc.expectedAmount}, UTR=${tc.expectedUtr}, Sender=${tc.expectedSender}`);
    console.error(`   Got:      Amount=${result.amount}, UTR=${result.utr}, Sender=${result.sender}`);
  }
  console.log('--------------------------------------------------');
}

console.log(`\nParser Results: ${passed}/${testCases.length} tests passed.`);
if (passed === testCases.length) {
  console.log('🎉 100% SUCCESS: Real FamPay email format parsed flawlessly!\n');
}
