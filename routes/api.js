const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// API endpoint for customer opt-in/opt-out
router.post('/opt-in', async (req, res) => {
  try {
    const { orderId, customerOptIn, shopDomain } = req.body;

    if (!orderId || !shopDomain) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the merchant
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Find the pending entry
    const entry = await prisma.entry.findUnique({
      where: { orderId: orderId.toString() },
    });

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    // Update entry based on opt-in status
    const updatedEntry = await prisma.entry.update({
      where: { orderId: orderId.toString() },
      data: { isActive: customerOptIn },
    });

    // Update transaction status
    if (customerOptIn) {
      await prisma.transaction.updateMany({
        where: { 
          orderId: orderId.toString(),
          merchantId: merchant.id,
        },
        data: { status: 'COMPLETED' },
      });

      // Update prize pool
      await updatePrizePool(entry.period, entry.orderAmount, merchant.billingPlan);
    } else {
      // Customer declined - mark transaction as failed
      await prisma.transaction.updateMany({
        where: { 
          orderId: orderId.toString(),
          merchantId: merchant.id,
        },
        data: { status: 'FAILED' },
      });
    }

    res.json({ 
      success: true, 
      entry: updatedEntry,
      message: customerOptIn ? 'Entry activated!' : 'Opt-out recorded'
    });

  } catch (error) {
    console.error('Opt-in API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint for cart threshold checking
router.post('/cart-check', async (req, res) => {
  try {
    const { cartTotal, shop } = req.body;

    if (!cartTotal || !shop) {
      return res.json({ 
        showBanner: false,
        error: 'Missing required fields' 
      });
    }

    // Get merchant settings
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop },
    });

    if (!merchant || !merchant.isActive || merchant.threshold <= 0) {
      return res.json({ showBanner: false });
    }

    // Get current prize pool
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const period = `${year}-Q${quarter}`;

    const prizePool = await prisma.prizePool.findUnique({
      where: { period },
    });

    const prizeAmount = prizePool?.currentAmount || 1000; // Default prize if no pool yet
    const formattedPrize = `$${prizeAmount.toLocaleString('en-US', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    })}`;

    const qualified = cartTotal >= merchant.threshold;

    res.json({
      showBanner: true,
      qualified,
      threshold: merchant.threshold,
      prizeAmount: formattedPrize,
      cartTotal,
    });

  } catch (error) {
    console.error('Cart check API error:', error);
    res.json({ 
      showBanner: false,
      error: 'Internal server error' 
    });
  }
});

// API endpoint for prize pool information
router.get('/prize-pool', async (req, res) => {
  try {
    // Get current period
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const period = `${year}-Q${quarter}`;

    // Get current prize pool
    const prizePool = await prisma.prizePool.findUnique({
      where: { period },
    });

    const currentAmount = prizePool?.currentAmount || 0;

    // Calculate next drawing date (end of current quarter)
    const quarterEndMonth = quarter * 3;
    const nextDrawing = new Date(year, quarterEndMonth, 0); // Last day of quarter

    res.json({
      currentAmount: Math.round(currentAmount * 100) / 100, // Round to 2 decimals
      period,
      nextDrawing: nextDrawing.toISOString(),
      formattedAmount: `$${currentAmount.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`,
    });

  } catch (error) {
    console.error('Prize pool API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Utility function to update prize pool
async function updatePrizePool(period, orderAmount, billingPlan) {
  try {
    // Calculate contribution to prize pool (a percentage of the transaction fee)
    const feeRate = billingPlan === 'ENTERPRISE' ? 0.02 : 0.03;
    const transactionFee = orderAmount * feeRate;
    const prizeContribution = transactionFee * 0.5; // 50% of fee goes to prize pool

    // Get or create prize pool for this period
    await prisma.prizePool.upsert({
      where: { period },
      update: {
        currentAmount: {
          increment: prizeContribution,
        },
      },
      create: {
        period,
        currentAmount: prizeContribution,
        isActive: true,
      },
    });

    console.log(`Updated prize pool for ${period}: +$${prizeContribution.toFixed(2)}`);
  } catch (error) {
    console.error('Prize pool update error:', error);
  }
}

module.exports = router;