import QRCode from 'qrcode';

/**
 * Construct standard NPCI UPI Intent URI
 */
export function buildUpiUri({ vpa, merchantName, amount, orderCode, note }) {
  const cleanVpa = encodeURIComponent(vpa.trim());
  const cleanName = encodeURIComponent(merchantName.trim());
  const cleanAmount = Number(amount).toFixed(2);
  const cleanNote = encodeURIComponent(note || `Order ${orderCode}`);

  return `upi://pay?pa=${cleanVpa}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanNote}`;
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
