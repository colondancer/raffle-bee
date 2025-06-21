import { json } from "@remix-run/node";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = await request.json();
    const { orderId, customerOptIn, shopDomain } = body;

    if (!orderId || !shopDomain) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get the merchant
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain },
    });

    if (!merchant) {
      return json({ error: "Merchant not found" }, { status: 404 });
    }

    // Find the pending entry
    const entry = await prisma.entry.findUnique({
      where: { orderId: orderId.toString() },
    });

    if (!entry) {
      return json({ error: "Entry not found" }, { status: 404 });
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
        data: { status: "COMPLETED" },
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
        data: { status: "FAILED" },
      });
    }

    return json({ 
      success: true, 
      entry: updatedEntry,
      message: customerOptIn ? "Entry activated!" : "Opt-out recorded"
    });

  } catch (error) {
    console.error("Opt-in API error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

async function updatePrizePool(period, orderAmount, billingPlan) {
  try {
    // Calculate contribution to prize pool (a percentage of the transaction fee)
    const feeRate = billingPlan === "ENTERPRISE" ? 0.02 : 0.03;
    const transactionFee = orderAmount * feeRate;
    const prizeContribution = transactionFee * 0.5; // 50% of fee goes to prize pool

    // Get or create prize pool for this period
    const prizePool = await prisma.prizePool.upsert({
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

    console.log(`Updated prize pool for ${period}: +$${prizeContribution.toFixed(2)}, total: $${prizePool.currentAmount.toFixed(2)}`);
  } catch (error) {
    console.error("Prize pool update error:", error);
  }
}