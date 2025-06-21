import { json } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request }) => {
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

    return json({
      currentAmount: Math.round(currentAmount * 100) / 100, // Round to 2 decimals
      period,
      nextDrawing: nextDrawing.toISOString(),
      formattedAmount: `$${currentAmount.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}`,
    });

  } catch (error) {
    console.error("Prize pool API error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};