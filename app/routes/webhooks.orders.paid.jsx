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

    if (!merchant || !merchant.isActive) {
      console.log(`Merchant not found or inactive for shop: ${shopDomain}`);
      return new Response(null, { status: 200 });
    }

    // Check if order meets threshold (use subtotal before tax/shipping)
    const orderSubtotal = parseFloat(order.subtotal_price);
    if (orderSubtotal < merchant.threshold) {
      console.log(`Order ${order.id} below threshold: $${orderSubtotal} < $${merchant.threshold}`);
      return new Response(null, { status: 200 });
    }

    // Check if customer is in US (basic check, should be enhanced)
    const billingAddress = order.billing_address;
    if (!billingAddress || billingAddress.country_code !== "US") {
      console.log(`Order ${order.id} not from US customer`);
      return new Response(null, { status: 200 });
    }

    // Check if entry already exists
    const existingEntry = await prisma.entry.findUnique({
      where: { orderId: order.id.toString() },
    });

    if (existingEntry) {
      console.log(`Entry already exists for order ${order.id}`);
      return new Response(null, { status: 200 });
    }

    // Get current period (e.g., "2024-Q1")
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const period = `${year}-Q${quarter}`;

    // Create entry (but we need to wait for customer opt-in confirmation)
    // For now, we'll create a pending entry that gets activated when customer opts in
    await prisma.entry.create({
      data: {
        orderId: order.id.toString(),
        merchantId: merchant.id,
        customerId: order.customer?.id?.toString() || null,
        customerEmail: order.email,
        customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : order.billing_address?.name || "Unknown",
        orderAmount: orderSubtotal,
        period,
        isActive: false, // Will be activated when customer opts in
      },
    });

    // Create transaction record for billing
    await prisma.transaction.create({
      data: {
        orderId: order.id.toString(),
        merchantId: merchant.id,
        feeAmount: calculateTransactionFee(orderSubtotal, merchant.billingPlan),
        status: "PENDING",
        description: `Transaction fee for order ${order.order_number}`,
      },
    });

    console.log(`Created pending entry for order ${order.id}, customer: ${order.email}`);
    return new Response(null, { status: 200 });

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(null, { status: 500 });
  }
};

function calculateTransactionFee(orderAmount, billingPlan) {
  // Simple fee calculation - customize based on your pricing model
  const baseRate = billingPlan === "ENTERPRISE" ? 0.02 : 0.03; // 2% vs 3%
  return Math.round(orderAmount * baseRate * 100) / 100;
}