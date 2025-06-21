import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    if (!payload.order) {
      console.error("No order data in webhook payload");
      return new Response(null, { status: 400 });
    }

    const order = payload.order;
    const shopDomain = shop;

    // Get merchant settings
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain },
    });

    if (!merchant) {
      console.log(`Merchant not found for shop: ${shopDomain}`);
      return new Response(null, { status: 200 });
    }

    // Check if we have an entry for this order
    const entry = await prisma.entry.findUnique({
      where: { orderId: order.id.toString() },
    });

    if (!entry) {
      console.log(`No entry found for order ${order.id}`);
      return new Response(null, { status: 200 });
    }

    // Check for refunds
    const totalRefunded = parseFloat(order.total_refunded || "0");
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
        data: { status: "REFUNDED" },
      });

      console.log(`Deactivated entry for order ${order.id} due to refund. Total refunded: $${totalRefunded}`);
    } else {
      // Partial refund but still above threshold - keep entry active
      console.log(`Partial refund for order ${order.id}. Remaining: $${remainingAmount}, threshold: $${merchant.threshold}. Entry remains active.`);
    }

    return new Response(null, { status: 200 });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(null, { status: 500 });
  }
};