/**
 * Email Parser utility specialized for FamPay (FamApp) & Indian UPI payment alert emails.
 * Extracts: amount, 12-digit UTR, FamPay internal Txn ID, sender name/UPI, and payment app.
 */

export function parsePaymentEmail(subject = '', body = '', date = new Date()) {
  const rawText = `${subject}\n${body}`;

  // 1. Preprocess & normalize raw text:
  // FamPay emails often arrive as stripped HTML tables where words are joined without spaces
  const text = rawText
    .replace(/(successfully\s+received|received)/gi, ' $1 ')
    .replace(/(successfully\s+paid|paid)/gi, ' $1 ')
    .replace(/(from|to)\b/gi, ' $1 ')
    .replace(/(Transaction\s*ID|Txn\s*ID)/gi, ' $1 ')
    .replace(/\b(Date)\b/gi, ' $1 ')
    .replace(/(Updated\s*Balance)/gi, ' $1 ')
    .replace(/(UTR)/gi, ' $1 ')
    .replace(/(Purpose)/gi, ' $1 ')
    .replace(/(Sent\s+using)/gi, ' $1 ')
    .replace(/(If\s+this)/gi, ' $1 ')
    .replace(/\s+/g, ' ');

  // 2. Strict Debit / Outgoing Transaction Detection
  // FamApp & Bank debit alerts:
  // - "Your payment of ₹940.00 is successful"
  // - "You have successfully paid ₹940.00 to Facebook"
  // - "paid ₹... to ..."
  // - "You sent ₹... to ..."
  // - "debited from your account"
  const hasDebitKeyword = /(?:successfully\s+paid|paid\s+(?:₹|\u20B9|Rs\.?|INR|\d+[\d.,]*)\s+to|payment\s+to\b|payment\s+of\s+[\d.,₹\s]+\s+is\s+successful|you\s+have\s+(?:successfully\s+)?paid|you\s+(?:have\s+)?sent|sent\s+(?:₹|\u20B9|Rs\.?|INR|\d+[\d.,]*)\s+to|transferred\s+(?:₹|\u20B9|Rs\.?|INR|\d+[\d.,]*)\s+to|\bdebited\b|\bdebit\b|spent\s+on|withdrawn|deducted\s+from)/i.test(text);

  const hasExplicitCredit = /(?:successfully\s+received|received\s*(?:₹|\u20B9|Rs\.?|INR|[^\w\s.,]|\?)?\s*[\d,]+\.?\d*\s*from|credited\s+(?:by|with|to)|money\s+received|payment\s+received\s+from)/i.test(text);

  // If the email indicates a debit / outgoing payment and is NOT an incoming credit, discard immediately
  if (hasDebitKeyword && !hasExplicitCredit) {
    return {
      success: false,
      isDebit: true,
      amount: 0,
      utr: null,
      sender: null,
      error: 'Debit/outgoing transaction detected. Only incoming received amounts are counted in the gateway.',
      rawSubject: subject,
      rawSnippet: text.substring(0, 300)
    };
  }

  // 3. Amount Extraction (Strictly Received / Credited)
  let amount = null;

  // FamApp: "You have successfully received ₹100.0 from RIYAZ PASHA"
  const receivedAmountMatch = text.match(/(?:successfully\s+)?received\s*(?:₹|\u20B9|Rs\.?|INR|[^\w\s.,]|\?)?\s*([\d,]+\.?\d*)/i) ||
                              text.match(/(?:credited\s+(?:by|with)?)\s*(?:₹|\u20B9|Rs\.?|INR|[^\w\s.,]|\?)?\s*([\d,]+\.?\d*)/i) ||
                              text.match(/credited\s+for\s*(?:₹|\u20B9|Rs\.?|INR|[^\w\s.,]|\?)?\s*([\d,]+\.?\d*)/i) ||
                              text.match(/received\s+payment\s+of\s*(?:₹|\u20B9|Rs\.?|INR|[^\w\s.,]|\?)?\s*([\d,]+\.?\d*)/i);

  if (receivedAmountMatch && receivedAmountMatch[1]) {
    const parsed = parseFloat(receivedAmountMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // If no explicit received amount pattern matched and no explicit credit was found, do NOT guess from loose symbols
  if (!amount || isNaN(amount)) {
    if (hasExplicitCredit) {
      const fallbackMatch = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d{0,2})/i);
      if (fallbackMatch && fallbackMatch[1]) {
        amount = parseFloat(fallbackMatch[1].replace(/,/g, ''));
      }
    }
  }

  // Must have a valid positive amount
  if (!amount || isNaN(amount) || amount <= 0) {
    return {
      success: false,
      isDebit: false,
      amount: 0,
      error: 'No valid received payment amount found in email',
      rawSubject: subject,
      rawSnippet: text.substring(0, 300)
    };
  }

  // 4. UTR (12-digit Banking Ref) & FamPay Internal Transaction ID
  let utr = null;
  let txnId = null;

  const utrMatch = text.match(/UTR\s*[:\s#]*([0-9]{12})/i) ||
                   text.match(/UPI\s*Ref(?:\s*no\.?)?\s*[:\s#]*([0-9]{12})/i) ||
                   text.match(/\b([0-9]{12})\b/);

  if (utrMatch) {
    utr = utrMatch[1].trim();
  }

  // FamPay internal ID (e.g. FMPIB6527256761)
  const txnMatch = text.match(/Transaction\s*ID\s*[:\s#]*([A-Za-z0-9]{8,20})/i) ||
                   text.match(/Txn\s*ID\s*[:\s#]*([A-Za-z0-9]{8,20})/i);

  if (txnMatch) {
    txnId = txnMatch[1].trim().replace(/(?:Date|Updated|UTR)$/i, '');
  }

  const finalUtr = utr || txnId || `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // 5. Sender Extraction (Strictly who sent to merchant)
  let sender = 'Unknown';
  const nameMatch = text.match(/received\s+[^\n]+?\s+from\s+([A-Za-z\s]{2,40}?)(?:\s+at\s+\d{1,2}:\d{2}|\s*\(|\s*Transaction\s*ID|\s*Txn\s*ID|\s*\bDate\b|\s*UTR|\s*Updated|$)/i) ||
                    text.match(/from\s+([A-Za-z\s]{2,40}?)(?:\s+at\s+\d{1,2}:\d{2}|\s*\(|\s*Transaction\s*ID|\s*Txn\s*ID|\s*\bDate\b|\s*UTR|\s*Updated|$)/i);
  const upiIdMatch = text.match(/from\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/i) ||
                     text.match(/\(\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)\s*\)/i);

  if (nameMatch && nameMatch[1] && nameMatch[1].trim().length >= 2) {
    const candidate = nameMatch[1].trim();
    if (!['you', 'your', 'account', 'customer', 'fampay', 'famapp'].includes(candidate.toLowerCase())) {
      sender = candidate;
    }
  } else if (upiIdMatch && upiIdMatch[1]) {
    sender = upiIdMatch[1].trim();
  }

  // 6. Payment Purpose / Source App (e.g. "Sent using Paytm UPI")
  let sourceApp = 'UPI';
  const appMatch = text.match(/Sent\s+using\s+([A-Za-z0-9\s]+?)(?:\s+If\s+this|\s+Disclaimer|$)/i);
  if (appMatch && appMatch[1]) {
    sourceApp = appMatch[1].trim();
  }

  return {
    success: true,
    isDebit: false,
    amount,
    utr: finalUtr,
    rawUtr: utr,
    famPayTxnId: txnId,
    sender,
    sourceApp,
    receivedAt: date instanceof Date ? date : new Date(date),
    rawSubject: subject,
    rawSnippet: text.substring(0, 300)
  };
}

export default { parsePaymentEmail };
