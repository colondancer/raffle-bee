import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Badge,
  Banner,
  List,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const { shop } = session;

  // Get or create merchant record
  let merchant = await prisma.merchant.findUnique({
    where: { shopDomain: shop },
  });

  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: {
        shopDomain: shop,
        threshold: 0,
        billingPlan: "STANDARD",
      },
    });
  }

  // Get store's average order value to suggest threshold
  const orderStats = await admin.graphql(`
    query getOrderStats {
      orders(first: 100, query: "financial_status:paid") {
        edges {
          node {
            totalPrice
          }
        }
      }
    }
  `);

  const orderData = await orderStats.json();
  const orders = orderData.data.orders.edges;
  const averageOrderValue = orders.length > 0 
    ? orders.reduce((sum, order) => sum + parseFloat(order.node.totalPrice), 0) / orders.length
    : 0;

  const suggestedThreshold = Math.round(averageOrderValue * 1.15 * 100) / 100;

  return {
    merchant,
    suggestedThreshold,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  
  const threshold = parseFloat(formData.get("threshold"));
  const billingPlan = formData.get("billingPlan");

  // Update merchant settings
  const merchant = await prisma.merchant.update({
    where: { shopDomain: shop },
    data: {
      threshold,
      billingPlan,
    },
  });

  return { success: true, merchant };
};

export default function Settings() {
  const { merchant, suggestedThreshold, averageOrderValue } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  
  const [threshold, setThreshold] = useState(merchant.threshold.toString());
  const [billingPlan, setBillingPlan] = useState(merchant.billingPlan);
  
  const isLoading = ["loading", "submitting"].includes(fetcher.state);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved successfully!");
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("threshold", threshold);
    formData.append("billingPlan", billingPlan);
    fetcher.submit(formData, { method: "POST" });
  };

  const billingPlanOptions = [
    {
      label: "Standard Plan - Low monthly fee, higher transaction fees",
      value: "STANDARD",
    },
    {
      label: "Enterprise Plan - Higher monthly fee, lower transaction fees",
      value: "ENTERPRISE",
    },
  ];

  return (
    <Page>
      <TitleBar title="RaffleBee Settings" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Banner tone="info">
              <Text variant="bodyMd" as="p">
                Welcome to RaffleBee! Set your spending threshold to start offering customers
                sweepstake entries for a chance to win from the shared prize pool.
              </Text>
            </Banner>
          </Layout.Section>
          
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">
                  Sweepstakes Settings
                </Text>
                
                <BlockStack gap="300">
                  <TextField
                    label="Spending Threshold"
                    type="number"
                    value={threshold}
                    onChange={setThreshold}
                    prefix="$"
                    step="0.01"
                    min="0"
                    helpText={`Your current average order value is $${averageOrderValue}. We suggest $${suggestedThreshold} (AOV + 15%).`}
                  />
                  
                  <Select
                    label="Billing Plan"
                    options={billingPlanOptions}
                    value={billingPlan}
                    onChange={setBillingPlan}
                  />
                  
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      loading={isLoading}
                      onClick={handleSave}
                    >
                      Save Settings
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Current Status
                  </Text>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      App Status
                    </Text>
                    <Badge tone={merchant.isActive ? "success" : "warning"}>
                      {merchant.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Current Threshold
                    </Text>
                    <Text as="span" variant="bodyMd">
                      ${merchant.threshold}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">
                      Billing Plan
                    </Text>
                    <Badge tone="info">{merchant.billingPlan}</Badge>
                  </InlineStack>
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    How It Works
                  </Text>
                  <List>
                    <List.Item>
                      Customers who spend above your threshold see a sweepstakes opt-in at checkout
                    </List.Item>
                    <List.Item>
                      Each qualifying order gets one entry in the quarterly drawing
                    </List.Item>
                    <List.Item>
                      You pay a small transaction fee only when customers opt-in
                    </List.Item>
                    <List.Item>
                      Higher spending thresholds typically increase average order values by 15-25%
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}