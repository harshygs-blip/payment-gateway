import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  merchant: {
    upiVpa: process.env.MERCHANT_UPI_VPA || 'harsh@fam',
    name: process.env.MERCHANT_NAME || 'Personal Gateway'
  },
  
  orderExpiryMinutes: parseInt(process.env.ORDER_EXPIRY_MINUTES || '5', 10),
  
  imap: {
    enabled: process.env.IMAP_ENABLED === 'true',
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: process.env.IMAP_SECURE !== 'false',
    user: process.env.IMAP_USER || '',
    pass: process.env.IMAP_PASS || '',
    mailbox: process.env.IMAP_MAILBOX || 'INBOX',
    senderFilter: (process.env.IMAP_SENDER_FILTER || 'fampay').split(',').map(s => s.trim().toLowerCase())
  },
  
  adminSecret: process.env.ADMIN_SECRET_KEY || 'admin123'
};
