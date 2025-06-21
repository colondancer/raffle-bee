const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Middleware to verify Shopify webhook HMAC
function verifyShopifyWebhook(req, res, next) {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const body = JSON.stringify(req.body);
    const hash = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(body, 'utf8')
      .digest('base64');

    if (hash !== hmac) {
      console.error('Webhook HMAC verification failed');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  } catch (error) {
    console.error('HMAC verification error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Apply HMAC verification to all webhook routes
router.use(verifyShopifyWebhook);

// Webhook for orders/paid - Create sweepstakes entry
router.post('/orders/paid', async (req, res) => {
  try {
    const order = req.body;
    const shopDomain = req.get('x-shopify-shop-domain');

    if (!order || !shopDomain) {
      console.error('Missing order data or shop domain');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // Get merchant settings
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain },
    });

    if (!merchant || !merchant.isActive) {
      console.log(`Merchant not found or inactive for shop: ${shopDomain}`);
      return res.status(200).json({ message: 'Merchant inactive' });
    }

    // Check if order meets threshold (use subtotal before tax/shipping)
    const orderSubtotal = parseFloat(order.subtotal_price);
    if (orderSubtotal < merchant.threshold) {
      console.log(`Order ${order.id} below threshold: $${orderSubtotal} < $${merchant.threshold}`);
      return res.status(200).json({ message: 'Order below threshold' });
    }

    // Check if customer is in US
    const billingAddress = order.billing_address;
    if (!billingAddress || billingAddress.country_code !== 'US') {
      console.log(`Order ${order.id} not from US customer`);
      return res.status(200).json({ message: 'Non-US customer' });
    }

    // Check if entry already exists
    const existingEntry = await prisma.entry.findUnique({
      where: { orderId: order.id.toString() },
    });

    if (existingEntry) {
      console.log(`Entry already exists for order ${order.id}`);
      return res.status(200).json({ message: 'Entry already exists' });
    }

    // Get current period (e.g., "2024-Q1")
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const period = `${year}-Q${quarter}`;

    // Create entry (pending until customer opts in)
    await prisma.entry.create({
      data: {
        orderId: order.id.toString(),
        merchantId: merchant.id,
        customerId: order.customer?.id?.toString() || null,
        customerEmail: order.email,
        customerName: order.customer 
          ? `${order.customer.first_name} ${order.customer.last_name}` 
          : order.billing_address?.name || 'Unknown',
        orderAmount: orderSubtotal,
        period,
        isActive: false, // Will be activated when customer opts in
      },
    });

    // Create transaction record for billing
    const feeAmount = calculateTransactionFee(orderSubtotal, merchant.billingPlan);
    await prisma.transaction.create({
      data: {
        orderId: order.id.toString(),
        merchantId: merchant.id,
        feeAmount,
        status: 'PENDING',
        description: `Transaction fee for order ${order.order_number}`,
      },
    });

    console.log(`Created pending entry for order ${order.id}, customer: ${order.email}`);
    res.status(200).json({ message: 'Entry created successfully' });

  } catch (error) {
    console.error('Orders/paid webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook for orders/updated - Handle refunds and cancellations
router.post('/orders/updated', async (req, res) => {
  try {
    const order = req.body;
    const shopDomain = req.get('x-shopify-shop-domain');

    if (!order || !shopDomain) {
      console.error('Missing order data or shop domain');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // Get merchant settings
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain },
    });

    if (!merchant) {
      console.log(`Merchant not found for shop: ${shopDomain}`);
      return res.status(200).json({ message: 'Merchant not found' });
    }

    // Check if we have an entry for this order
    const entry = await prisma.entry.findUnique({
      where: { orderId: order.id.toString() },
    });

    if (!entry) {
      console.log(`No entry found for order ${order.id}`);
      return res.status(200).json({ message: 'No entry found' });
    }

    // Check for refunds
    const totalRefunded = parseFloat(order.total_refunded || '0');
    const orderSubtotal = parseFloat(order.subtotal_price);
    const remainingAmount = orderSubtotal - totalRefunded;

    // If fully refunded or remaining amount is below threshold, deactivate entry
    if (totalRefunded >= orderSubtotal || remainingAmount < merchant.threshold) {
      await prisma.entry.update({
        where: { orderId: order.id.toString() },
        data: { isActive: false },
      });

      // Update transaction status to refunded
      await prisma.transaction.updateMany({
        where: { 
          orderId: order.id.toString(),
          merchantId: merchant.id,
        },
        data: { status: 'REFUNDED' },
      });

      console.log(`Deactivated entry for order ${order.id} due to refund. Total refunded: $${totalRefunded}`);
    } else {
      console.log(`Partial refund for order ${order.id}. Remaining: $${remainingAmount}, threshold: $${merchant.threshold}. Entry remains active.`);
    }

    res.status(200).json({ message: 'Order update processed' });

  } catch (error) {
    console.error('Orders/updated webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook for app/uninstalled - Clean up merchant data
router.post('/app/uninstalled', async (req, res) => {
  try {
    const shopDomain = req.get('x-shopify-shop-domain');

    if (!shopDomain) {
      console.error('Missing shop domain');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    // Mark merchant as inactive
    await prisma.merchant.updateMany({
      where: { shopDomain },
      data: { isActive: false },
    });

    console.log(`App uninstalled for shop: ${shopDomain}`);
    res.status(200).json({ message: 'App uninstalled processed' });

  } catch (error) {
    console.error('App/uninstalled webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Utility function to calculate transaction fee
function calculateTransactionFee(orderAmount, billingPlan) {
  const baseRate = billingPlan === 'ENTERPRISE' ? 0.02 : 0.03; // 2% vs 3%
  return Math.round(orderAmount * baseRate * 100) / 100;
}

module.exports = router;