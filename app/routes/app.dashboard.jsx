import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineStack,
  Badge,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  // Get merchant
  const merchant = await prisma.merchant.findUnique({
    where: { shopDomain: shop },
  });

  if (!merchant) {
    return { merchant: null, entries: [], stats: null };
  }

  // Get recent entries
  const entries = await prisma.entry.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get stats
  const totalEntries = await prisma.entry.count({
    where: { 
      merchantId: merchant.id,
      isActive: true,
    },
  });

  const totalRevenue = await prisma.entry.aggregate({
    where: { 
      merchantId: merchant.id,
      isActive: true,
    },
    _sum: { orderAmount: true },
  });

  const stats = {
    totalEntries,
    totalRevenue: totalRevenue._sum.orderAmount || 0,
    averageOrderValue: totalEntries > 0 ? totalRevenue._sum.orderAmount / totalEntries : 0,
  };

  return { merchant, entries, stats };
};

export default function Dashboard() {
  const { merchant, entries, stats } = useLoaderData();

  if (!merchant) {
    return (
      <Page>
        <TitleBar title="Dashboard" />
        <EmptyState
          heading="Set up your RaffleBee settings first"
          action={{
            content: "Go to Settings",
            url: "/app/settings",
          }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <Text variant="bodyMd" as="p">
            Configure your spending threshold and billing plan to get started.
          </Text>
        </EmptyState>
      </Page>
    );
  }

  const rows = entries.map((entry) => [
    entry.orderId,
    entry.customerEmail,
    entry.customerName || "Unknown",
    `$${entry.orderAmount.toFixed(2)}`,
    entry.period,
    <Badge key={entry.id} tone={entry.isActive ? "success" : "warning"}>
      {entry.isActive ? "Active" : "Pending"}
    </Badge>,
    new Date(entry.createdAt).toLocaleDateString(),
  ]);

  return (
    <Page>
      <TitleBar title="RaffleBee Dashboard" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Total Entries
                </Text>
                <Text as="p" variant="headingLg">
                  {stats.totalEntries}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Total Revenue
                </Text>
                <Text as="p" variant="headingLg">
                  ${stats.totalRevenue.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  Avg Order Value
                </Text>
                <Text as="p" variant="headingLg">
                  ${stats.averageOrderValue.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Recent Entries
                  </Text>
                  <Badge tone="info">
                    Threshold: ${merchant.threshold}
                  </Badge>
                </InlineStack>
                
                {entries.length > 0 ? (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "email", 
                      "text",
                      "numeric",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Order ID",
                      "Customer Email", 
                      "Customer Name",
                      "Order Amount",
                      "Period",
                      "Status",
                      "Date",
                    ]}
                    rows={rows}
                  />
                ) : (
                  <EmptyState
                    heading="No entries yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <Text variant="bodyMd" as="p">
                      Entries will appear here when customers make qualifying orders and opt-in to the sweepstakes.
                    </Text>
                  </EmptyState>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}