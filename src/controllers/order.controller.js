import { OrderModel } from '../models/order.model.js';
import { claimOrderWithUtr } from '../services/matchingEngine.service.js';
import { buildUpiUri, streamQrPng } from '../utils/qr.util.js';
import { config } from '../../config.js';
import { logActivity } from '../../db/database.js';

function generateOrderCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'ORD-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const OrderController = {
  async create(req, res, next) {
    try {
      const origin = req.headers.origin || req.headers.referer || '';
      const clientIp = req.ip || req.connection?.remoteAddress || '';
      const { amount, customerName = 'Guest', customerPhone = '', webhookUrl = '' } = req.body;
      const parsedAmount = parseFloat(amount);

      if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
        await logActivity({
          eventType: 'ORDER_CREATE_FAILED',
          status: 'FAILED',
          title: 'Order Creation Failed: Invalid Amount',
          details: `Received amount: "${amount}"`,
          clientIp,
          origin
        });
        return res.status(400).json({ success: false, error: 'Valid positive amount is required' });
      }

      const orderCode = generateOrderCode();
      const createdAt = Date.now();
      const expiresAt = createdAt + config.orderExpiryMinutes * 60 * 1000;

      const order = await OrderModel.create({
        orderCode,
        amount: parsedAmount,
        customerName,
        customerPhone,
        createdAt,
        expiresAt,
        webhookUrl
      });

      const upiUri = buildUpiUri({
        vpa: config.merchant.upiVpa,
        merchantName: config.merchant.name,
        amount: parsedAmount,
        orderCode
      });

      // Construct absolute base URL (supports reverse proxies like Render, ngrok, Cloudflare)
      const forwardedProto = req.headers['x-forwarded-proto'];
      const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : (req.protocol || 'http');
      const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${config.port}`;
      const baseUrl = `${protocol}://${host}`;
      const checkoutUrl = `${baseUrl}/checkout/${orderCode}`;

      const orderData = {
        ...order,
        orderId: order.id,
        orderCode,
        amount: parsedAmount,
        currency: 'INR',
        status: 'PENDING',
        expiryMinutes: config.orderExpiryMinutes,
        expiresAt,
        upiUri,
        checkoutUrl,
        sessionUrl: checkoutUrl,
        paymentUrl: checkoutUrl,
        url: checkoutUrl,
        relativeCheckoutUrl: `/checkout/${orderCode}`,
        qrImageUrl: `${baseUrl}/api/orders/qr?data=${encodeURIComponent(upiUri)}`
      };

      await logActivity({
        eventType: 'ORDER_CREATED',
        status: 'SUCCESS',
        title: `Order Created: ${orderCode}`,
        details: `Amount: ₹${parsedAmount.toFixed(2)} | Customer: ${customerName} | Webhook: ${webhookUrl || 'None'}`,
        clientIp,
        origin
      });

      if (req.io) {
        req.io.to('admin_room').emit('new_order', orderData);
        req.io.to('admin_room').emit('api_log', {
          event_type: 'ORDER_CREATED',
          status: 'SUCCESS',
          title: `Order Created: ${orderCode}`,
          details: `₹${parsedAmount.toFixed(2)} from ${origin || 'Client'}`,
          origin,
          created_at: createdAt
        });
      }

      return res.status(201).json({ success: true, order: orderData });
    } catch (err) {
      next(err);
    }
  },

  async getByCode(req, res, next) {
    try {
      const { code } = req.params;
      const order = await OrderModel.findByCode(code);

      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      // Dynamic expiry check
      if (order.status === 'PENDING' && Date.now() > order.expires_at) {
        await OrderModel.markAsExpired(order.id);
        order.status = 'EXPIRED';
      }

      const upiUri = buildUpiUri({
        vpa: config.merchant.upiVpa,
        merchantName: config.merchant.name,
        amount: order.amount,
        orderCode: order.order_code
      });

      const forwardedProto = req.headers['x-forwarded-proto'];
      const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : (req.protocol || 'http');
      const host = req.headers['x-forwarded-host'] || req.get('host') || `localhost:${config.port}`;
      const baseUrl = `${protocol}://${host}`;
      const checkoutUrl = `${baseUrl}/checkout/${order.order_code}`;

      return res.json({
        success: true,
        order: {
          ...order,
          orderId: order.id,
          orderCode: order.order_code,
          upiUri,
          checkoutUrl,
          sessionUrl: checkoutUrl,
          paymentUrl: checkoutUrl,
          url: checkoutUrl,
          relativeCheckoutUrl: `/checkout/${order.order_code}`,
          qrImageUrl: `${baseUrl}/api/orders/qr?data=${encodeURIComponent(upiUri)}`,
          timeRemainingSeconds: Math.max(0, Math.floor((order.expires_at - Date.now()) / 1000))
        }
      });
    } catch (err) {
      next(err);
    }
  },

  async verifyUtr(req, res, next) {
    try {
      const { code } = req.params;
      const { utr } = req.body;

      if (!utr || utr.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'Please enter a valid 12-digit UPI UTR / Ref number' });
      }

      const result = await claimOrderWithUtr(code, utr);
      return res.json(result);
    } catch (err) {
      next(err);
    }
  },

  getQrCode(req, res, next) {
    try {
      const { data } = req.query;
      if (!data) return res.status(400).send('Missing "data" query parameter');
      return streamQrPng(data, res);
    } catch (err) {
      next(err);
    }
  }
};

export default OrderController;
