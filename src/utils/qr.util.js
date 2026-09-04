import QRCode from 'qrcode';

/**
 * Construct standard NPCI UPI Intent URI
 */
export function buildUpiUri({ vpa, merchantName, amount, orderCode, note }) {
  // IMPORTANT: VPA (pa=) must NOT be encodeURIComponent'd
  // The @ symbol MUST remain as @ — Paytm, GPay, PhonePe etc. all reject %40
  // Only pn= (name) and tn= (note) should be percent-encoded per NPCI spec
  const cleanVpa = vpa.trim();
  const cleanName = encodeURIComponent(merchantName.trim());
  const cleanAmount = Number(amount).toFixed(2);
  const cleanNote = encodeURIComponent(note || `Pay ${orderCode}`);
  // tr= transaction reference helps UPI apps track + reconcile payments
  const txnRef = encodeURIComponent(orderCode || `TXN${Date.now()}`);

  // mode=00 = default pay mode (required by some strict UPI apps like Paytm)
  return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmount}&tr=${txnRef}&tn=${cleanNote}&cu=INR&mode=00`;
}

/**
 * Stream QR Code as PNG to an HTTP response
 */
export function streamQrPng(text, res) {
  res.setHeader('Content-Type', 'image/png');
  return QRCode.toFileStream(res, text, {
    margin: 1,
    width: 280,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });
}

/**
 * Generate QR code as DataURL (base64 string)
 */
export async function generateQrDataUrl(text) {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 280,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });
}

export default { buildUpiUri, streamQrPng, generateQrDataUrl };
