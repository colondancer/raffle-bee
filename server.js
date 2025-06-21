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
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Root route
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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