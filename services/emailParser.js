/**
 * Email Parser utility specialized for FamPay (FamApp) & Indian UPI payment alert emails.
 * Extracts: amount, 12-digit UTR, FamPay internal Txn ID, sender name/UPI, and payment app.
 */

export function parsePaymentEmail(subject = '', body = '', date = new Date()) {
  const rawText = `${subject}\n${body}`;

  // 1. Preprocess & normalize raw text:
  // FamPay emails often arrive as stripped HTML tables where words are joined without spaces
  // e.g. "received₹500.0from MEENA KUMARITransaction ID :FMPIB6527256761Date :...UTR :214771578746Purpose"
  const text = rawText
    .replace(/(successfully\s+received|received)/gi, ' $1 ')
    .replace(/(from)/gi, ' $1 ')
    .replace(/(Transaction\s*ID|Txn\s*ID)/gi, ' $1 ')
    .replace(/\b(Date)\b/gi, ' $1 ')
    .replace(/(Updated\s*Balance)/gi, ' $1 ')
    .replace(/(UTR)/gi, ' $1 ')
    .replace(/(Purpose)/gi, ' $1 ')
    .replace(/(Sent\s+using)/gi, ' $1 ')
    .replace(/(If\s+this)/gi, ' $1 ')
    .replace(/\s+/g, ' ');

  // 2. Amount Extraction
  // Priority 1: Explicitly match the received/credited amount (avoids matching "Updated Balance: ₹500.36")
  let amount = null;
  const receivedAmountMatch = text.match(/(?:successfully\s+)?received\s*(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)/i) ||
                              text.match(/(?:credited\s+(?:by|with)?|payment\s+of)\s*(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)/i);

  if (receivedAmountMatch && receivedAmountMatch[1]) {
    amount = parseFloat(receivedAmountMatch[1].replace(/,/g, ''));
  }

  // Priority 2: Fallback to general currency symbol
  if (!amount || isNaN(amount)) {
    const fallbackMatch = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+\.?\d{0,2})/i);
    if (fallbackMatch && fallbackMatch[1]) {
      amount = parseFloat(fallbackMatch[1].replace(/,/g, ''));
    }
  }

  // 3. UTR (12-digit Banking Ref) & FamPay Internal Transaction ID
  // Standard bank 12-digit UTR has the highest priority for customer verification
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

  // Use 12-digit UTR if found; otherwise use FamPay Txn ID; fallback to generated timestamp
  const finalUtr = utr || txnId || `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // 4. Sender Extraction
  let sender = 'Unknown';
  const nameMatch = text.match(/from\s+([A-Za-z\s]{2,40}?)(?:\s*\(|\s*Transaction\s*ID|\s*Txn\s*ID|\s*\bDate\b|\s*UTR|\s*Updated|$)/i);
  const upiIdMatch = text.match(/(?:from|\()\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/i);

  if (nameMatch && nameMatch[1] && nameMatch[1].trim().length >= 2) {
    const candidate = nameMatch[1].trim();
    if (!['you', 'your', 'account', 'customer'].includes(candidate.toLowerCase())) {
      sender = candidate;
    }
  } else if (upiIdMatch && upiIdMatch[1]) {
    sender = upiIdMatch[1].trim();
  }

  // 5. Payment Purpose / Source App (e.g. "Sent using Paytm UPI")
  let sourceApp = 'UPI';
  const appMatch = text.match(/Sent\s+using\s+([A-Za-z0-9\s]+?)(?:\s+If\s+this|\s+Disclaimer|$)/i);
  if (appMatch && appMatch[1]) {
    sourceApp = appMatch[1].trim();
  }

  return {
    success: Boolean(amount && !isNaN(amount) && amount > 0),
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
