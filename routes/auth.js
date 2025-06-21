const express = require('express');
const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Shopify API (only if environment variables are available)
let shopify = null;

if (process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET) {
  try {
    shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET,
      scopes: process.env.SCOPES?.split(',') || ['read_orders', 'read_customers', 'read_products'],
      hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, '') || 'localhost:3000',
      hostScheme: 'https',
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: true,
      logger: {
        level: 'info',
      },
    });
    console.log('Shopify API initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Shopify API:', error.message);
  }
} else {
  console.warn('Shopify API not initialized - missing environment variables');
}

// Shopify OAuth - Start OAuth flow
router.get('/', async (req, res) => {
  try {
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).send('Missing shop parameter');
    }

    // Check if Shopify API is configured
    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return res.status(500).send('Shopify API not configured - missing environment variables');
    }

    // Validate shop domain
    const sanitizedShop = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    
    // Create OAuth URL
    const authUrl = `https://${sanitizedShop}/admin/oauth/authorize?` +
      `client_id=${process.env.SHOPIFY_API_KEY}&` +
      `scope=${process.env.SCOPES || 'read_orders,read_customers,read_products'}&` +
      `redirect_uri=${process.env.SHOPIFY_APP_URL}/auth/callback&` +
      `state=${shop}`;
    
    res.redirect(authUrl);
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).send('Authentication failed');
  }
});

// OAuth callback - Exchange code for access token
router.get('/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;
    
    if (!shop || !code) {
      return res.status(400).send('Missing required parameters');
    }

    // Check if Shopify API is configured
    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
      return res.status(500).send('Shopify API not configured - missing environment variables');
    }

    // Validate shop domain
    const sanitizedShop = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
    
    // Exchange code for access token
    const tokenResponse = await fetch(`https://${sanitizedShop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for access token');
    }

    const { access_token } = await tokenResponse.json();

    // Store merchant data and setup webhooks
    await setupMerchant(sanitizedShop, access_token);

    console.log(`Successfully authenticated shop: ${sanitizedShop}`);
    res.redirect(`/admin?shop=${sanitizedShop}`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Setup merchant and webhooks
async function setupMerchant(shopDomain, accessToken) {
  try {
    // Create or update merchant record
    const merchant = await prisma.merchant.upsert({
      where: { shopDomain },
      update: {
        accessToken,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        shopDomain,
        accessToken,
        threshold: 50.0, // Default $50 threshold
        billingPlan: 'STANDARD',
        isActive: true,
      },
    });

    // Register webhooks
    await registerWebhooks(shopDomain, accessToken);

    console.log(`Merchant setup completed for ${shopDomain}`);
    return merchant;
  } catch (error) {
    console.error('Setup merchant error:', error);
    throw error;
  }
}

// Register webhooks with Shopify
async function registerWebhooks(shopDomain, accessToken) {
  const webhooks = [
    // Business logic webhooks
    {
      topic: 'orders/paid',
      address: `${process.env.SHOPIFY_APP_URL}/webhooks/orders/paid`,
      format: 'json',
    },
    {
      topic: 'orders/updated',
      address: `${process.env.SHOPIFY_APP_URL}/webhooks/orders/updated`,
      format: 'json',
    },
    {
      topic: 'app/uninstalled',
      address: `${process.env.SHOPIFY_APP_URL}/webhooks/app/uninstalled`,
      format: 'json',
    },
    // GDPR compliance webhooks (required for app approval)
    {
      topic: 'customers/data_request',
      address: `${process.env.SHOPIFY_APP_URL}/webhooks/customers/data_request`,
      format: 'json',
    },
    {
      topic: 'customers/redact',
      address: `${process.env.SHOPIFY_APP_URL}/webhooks/customers/redact`,
      format: 'json',
    },
    {
      topic: 'shop/redact',
      address: `${process.env.SHOPIFY_APP_URL}/webhooks/shop/redact`,
      format: 'json',
    },
  ];

  for (const webhook of webhooks) {
    try {
      const response = await fetch(`https://${shopDomain}/admin/api/2023-10/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ webhook }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Registered webhook: ${webhook.topic} for ${shopDomain}`);
      } else {
        const error = await response.text();
        console.error(`Failed to register webhook ${webhook.topic}:`, error);
      }
    } catch (error) {
      console.error(`Error registering webhook ${webhook.topic}:`, error);
    }
  }
}

module.exports = router;