import { json } from "@remix-run/node";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const body = await request.json();
    const { cartTotal, shop } = body;

    if (!cartTotal || !shop) {
      return json({ 
        showBanner: false,
        error: "Missing required fields" 
      });
    }

    // Get merchant settings
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop },
    });

    if (!merchant || !merchant.isActive || merchant.threshold <= 0) {
      return json({ showBanner: false });
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

    return json({
      showBanner: true,
      qualified,
      threshold: merchant.threshold,
      prizeAmount: formattedPrize,
      cartTotal,
    });

  } catch (error) {
    console.error("Cart check API error:", error);
    return json({ 
      showBanner: false,
      error: "Internal server error" 
    });
  }
};