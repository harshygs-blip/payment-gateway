import dotenv from 'dotenv';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { parsePaymentEmail } from '../services/emailParser.js';

dotenv.config();

async function runCliImapTest() {
  console.log('\n======================================================');
  console.log('🔍 FamPay / Gmail IMAP Diagnostic & Connection Tester');
  console.log('======================================================\n');

  const host = process.env.IMAP_HOST || 'imap.gmail.com';
  const port = parseInt(process.env.IMAP_PORT || '993', 10);
  const user = (process.env.IMAP_USER || '').trim();
  const pass = (process.env.IMAP_PASS || '').trim().replace(/\s+/g, '');
  const filter = (process.env.IMAP_SENDER_FILTER || 'fampay').split(',').map(s => s.trim().toLowerCase());

  console.log(`Host:     ${host}:${port}`);
  console.log(`User:     ${user || '(EMPTY - Please set in .env)'}`);
  console.log(`Filter:   ${filter.join(', ')}\n`);

  if (!user || !pass || pass === 'your_app_password' || pass === 'your_16_char_app_password') {
    console.log('⚠️  Notice: Real IMAP credentials not configured in .env yet.');
    console.log('   To test your live Gmail:');
    console.log('   1. Go to Google Account -> Security -> 2-Step Verification');
    console.log('   2. Generate an "App Password" (16 characters)');
    console.log('   3. Put IMAP_USER and IMAP_PASS in .env file\n');
    process.exit(0);
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false
  });

  try {
    console.log(`Connecting to ${host}...`);
    await client.connect();
    console.log('✅ Connected and authenticated successfully with Gmail!\n');

    const mailbox = await client.status('INBOX', { messages: true, unseen: true });
    console.log(`📬 Mailbox Status (INBOX):`);
    console.log(`   - Total Messages:  ${mailbox.messages}`);
    console.log(`   - Unseen Messages: ${mailbox.unseen}\n`);

    console.log('🔎 Scanning the last 5 messages in INBOX for UPI / FamPay alerts...');
    const lock = await client.getMailboxLock('INBOX');
    try {
      const total = mailbox.messages;
      const startSeq = Math.max(1, total - 4);

      for await (const message of client.fetch(`${startSeq}:${total}`, { source: true, envelope: true })) {
        const parsed = await simpleParser(message.source);
        const subject = parsed.subject || '(No Subject)';
        const from = parsed.from?.text || '(Unknown)';
        const body = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : '');
        const payment = parsePaymentEmail(subject, body, parsed.date || new Date());

        const isMatch = filter.some(f => from.toLowerCase().includes(f) || subject.toLowerCase().includes(f));

        console.log('--------------------------------------------------');
        console.log(`✉️  From:    ${from}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Date:    ${parsed.date?.toLocaleString()}`);
        if (payment.success && payment.amount) {
          console.log(`   🎉 PARSED PAYMENT FOUND:`);
          console.log(`      Amount: ₹${payment.amount}`);
          console.log(`      UTR:    ${payment.utr}`);
          console.log(`      Sender: ${payment.sender}`);
        } else {
          console.log(`   ℹ️  Normal Email (No payment regex match)`);
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }

    console.log('\n======================================================');
    console.log('✅ IMAP connection test completed successfully!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Connection Failed:', err.message);
    if (err.message.includes('Invalid credentials') || err.message.includes('AUTHENTICATIONFAILED')) {
      console.log('\n💡 Tip: Gmail requires an "App Password" (16 chars), not your standard account password.');
      console.log('   Make sure 2-Step Verification is ON in your Google Account.');
    }
  }
}

runCliImapTest();
