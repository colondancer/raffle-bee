require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Prisma
const prisma = new PrismaClient();

// Shopify API setup (simplified for now)
const shopifyConfig = {
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecret: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES?.split(',') || ['read_orders', 'read_customers', 'read_products'],
  hostName: process.env.SHOPIFY_APP_URL?.replace(/https?:\/\//, '') || 'localhost:3000',
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow Shopify embedding
  crossOriginEmbedderPolicy: false,
  frameguard: false, // Allow embedding in iframe
}));
app.use(cors({
  origin: [
    'https://admin.shopify.com',
    /\.myshopify\.com$/,
    process.env.SHOPIFY_APP_URL
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add headers for Shopify embedding
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Shopify-Access-Token');
  next();
});

// Serve static files for admin interface
app.use(express.static(path.join(__dirname, 'public')));

// Import route handlers
const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// Health check for Railway - must be before other routes
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: 'RaffleBee',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// Alternative health endpoints
app.get('/healthz', (req, res) => res.status(200).send('OK'));
app.get('/ping', (req, res) => res.status(200).send('pong'));

// Root route - handle both healthcheck and normal requests
app.get('/', (req, res) => {
  const { shop } = req.query;
  
  if (!shop) {
    // If no shop parameter, show a simple status page instead of redirecting
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>RaffleBee - Shopify App</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-align: center; 
            padding: 50px; 
            background: #f6f6f7;
            color: #202223;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 40px; 
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 { color: #00848e; margin-bottom: 20px; }
          p { color: #6b7280; line-height: 1.6; }
          .status { color: #166534; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎯 RaffleBee</h1>
          <p class="status">✅ Service is running successfully</p>
          <p>This is a Shopify app that increases merchant revenue through sweepstakes incentives.</p>
          <p>To access the admin dashboard, install this app in your Shopify store.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p><small>Shopify App • Built with Express.js • Deployed on Railway</small></p>
        </div>
      </body>
      </html>
    `);
  } else {
    // If shop parameter exists, redirect to admin
    res.redirect(`/admin?shop=${shop}`);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 RaffleBee server running on port ${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`🔗 Webhooks: http://localhost:${PORT}/webhooks`);
});

// Export for testing
module.exports = { app, prisma, shopifyConfig };