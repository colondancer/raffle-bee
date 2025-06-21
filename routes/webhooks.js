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

// GDPR Compliance Webhooks

// Customer data request - Return all data for a customer
router.post('/customers/data_request', async (req, res) => {
  try {
    const { customer, shop_domain } = req.body;
    
    if (!customer || !shop_domain) {
      console.error('Missing customer or shop_domain in data request');
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Find all data related to this customer
    const entries = await prisma.entry.findMany({
      where: {
        OR: [
          { customerId: customer.id?.toString() },
          { customerEmail: customer.email },
        ],
        merchant: {
          shopDomain: shop_domain
        }
      },
      include: {
        merchant: {
          select: {
            shopDomain: true,
            billingPlan: true,
          }
        }
      }
    });

    const transactions = await prisma.transaction.findMany({
      where: {
        orderId: {
          in: entries.map(entry => entry.orderId)
        }
      }
    });

    // Prepare customer data response
    const customerData = {
      customer_id: customer.id,
      customer_email: customer.email,
      shop_domain: shop_domain,
      entries: entries.map(entry => ({
        id: entry.id,
        order_id: entry.orderId,
        customer_name: entry.customerName,
        order_amount: entry.orderAmount,
        period: entry.period,
        is_active: entry.isActive,
        created_at: entry.createdAt,
      })),
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        order_id: transaction.orderId,
        fee_amount: transaction.feeAmount,
        status: transaction.status,
        created_at: transaction.createdAt,
      })),
      data_collected: {
        sweepstakes_entries: entries.length,
        total_order_value: entries.reduce((sum, entry) => sum + entry.orderAmount, 0),
        active_entries: entries.filter(entry => entry.isActive).length,
      }
    };

    console.log(`Customer data request processed for ${customer.email} from ${shop_domain}`);
    res.status(200).json(customerData);

  } catch (error) {
    console.error('Customer data request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer data erasure - Delete/anonymize customer data
router.post('/customers/redact', async (req, res) => {
  try {
    const { customer, shop_domain } = req.body;
    
    if (!customer || !shop_domain) {
      console.error('Missing customer or shop_domain in redact request');
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Find merchant
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop_domain }
    });

    if (!merchant) {
      console.log(`Merchant not found for redact request: ${shop_domain}`);
      return res.status(200).json({ message: 'Merchant not found' });
    }

    // Delete or anonymize customer entries
    const deletedEntries = await prisma.entry.updateMany({
      where: {
        OR: [
          { customerId: customer.id?.toString() },
          { customerEmail: customer.email },
        ],
        merchantId: merchant.id,
      },
      data: {
        customerId: null,
        customerEmail: 'redacted@privacy.com',
        customerName: 'Redacted Customer',
        isActive: false, // Deactivate entries for privacy
      }
    });

    // Update related transactions
    const entriesIds = await prisma.entry.findMany({
      where: {
        customerEmail: 'redacted@privacy.com',
        merchantId: merchant.id,
      },
      select: { orderId: true }
    });

    await prisma.transaction.updateMany({
      where: {
        orderId: {
          in: entriesIds.map(entry => entry.orderId)
        },
        merchantId: merchant.id,
      },
      data: {
        description: 'Redacted transaction - customer data removed',
      }
    });

    console.log(`Customer data redacted for ${customer.email} from ${shop_domain}. Affected entries: ${deletedEntries.count}`);
    res.status(200).json({ 
      message: 'Customer data redacted successfully',
      entries_affected: deletedEntries.count 
    });

  } catch (error) {
    console.error('Customer redact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Shop data erasure - Delete all shop data (48 hours after uninstall)
router.post('/shop/redact', async (req, res) => {
  try {
    const { shop_domain } = req.body;
    
    if (!shop_domain) {
      console.error('Missing shop_domain in shop redact request');
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Find merchant
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop_domain },
      include: {
        entries: true,
        transactions: true,
      }
    });

    if (!merchant) {
      console.log(`Merchant not found for shop redact: ${shop_domain}`);
      return res.status(200).json({ message: 'Merchant not found' });
    }

    const entriesCount = merchant.entries.length;
    const transactionsCount = merchant.transactions.length;

    // Delete all merchant data (cascading deletes will handle entries/transactions)
    await prisma.merchant.delete({
      where: { shopDomain: shop_domain }
    });

    console.log(`Shop data redacted for ${shop_domain}. Deleted merchant, ${entriesCount} entries, ${transactionsCount} transactions`);
    res.status(200).json({ 
      message: 'Shop data redacted successfully',
      merchant_deleted: true,
      entries_deleted: entriesCount,
      transactions_deleted: transactionsCount
    });

  } catch (error) {
    console.error('Shop redact error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Utility function to calculate transaction fee
function calculateTransactionFee(orderAmount, billingPlan) {
  const baseRate = billingPlan === 'ENTERPRISE' ? 0.02 : 0.03; // 2% vs 3%
  return Math.round(orderAmount * baseRate * 100) / 100;
}

module.exports = router;