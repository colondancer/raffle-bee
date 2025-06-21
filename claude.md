# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RaffleBee is a Shopify app that increases merchant revenue by offering customers sweepstake entries when they hit spending thresholds. All participating stores share one prize pool, creating network effects.

## Current Architecture (Express.js)

**IMPORTANT**: This project was migrated from Remix to Express.js to eliminate deployment complexity and build issues.

## Technology Stack

- **Framework**: Express.js (Node.js web framework)
- **Database**: Neon PostgreSQL with Prisma ORM
- **Payments**: Stripe for merchant billing
- **Frontend**: Simple HTML/CSS/JavaScript (no build process)
- **Deployment**: Railway (deployed from GitHub)
- **Shopify Integration**: @shopify/shopify-api

## Development Commands

```bash
# Start development server (with auto-reload)
npm run dev

# Start production server
npm start

# Database operations
npm run prisma:generate     # Generate Prisma client
npm run prisma:migrate      # Run migrations in development
npm run prisma:deploy       # Deploy migrations to production
npm run setup              # Generate client + deploy migrations

# No build process needed - pure JavaScript!
```

## Architecture Overview

### Database Schema (Prisma Models)

```prisma
model Session {
  // Shopify session storage (existing)
}

model Merchant {
  // Store settings: threshold, billing plan, Stripe customer ID
}

model Entry {
  // Customer sweepstake entries linked to orders
}

model Transaction {
  // Billing records for merchant fees
}

model PrizePool {
  // Shared prize pool amount by period
}
```

### Key Directories

- `server.js` - Main Express application entry point
- `routes/` - Express route handlers organized by function:
  - `routes/webhooks.js` - Shopify webhook handlers
  - `routes/api.js` - API endpoints for customer interactions
  - `routes/admin.js` - Admin dashboard and settings
  - `routes/auth.js` - Shopify OAuth handlers
- `extensions/` - Shopify UI extensions (cart banner, checkout)
- `prisma/` - Database schema and migrations
- `public/` - Static files (CSS, JS, images)
- `railway.toml` - Railway deployment configuration

### Express.js Routes

#### Webhook Endpoints (`/webhooks/`)
**Business Logic Webhooks:**
- `POST /webhooks/orders/paid` - Create entries for qualifying orders
- `POST /webhooks/orders/updated` - Handle refunds and entry adjustments  
- `POST /webhooks/app/uninstalled` - Clean up merchant data

**GDPR Compliance Webhooks:**
- `POST /webhooks/customers/data_request` - Return customer data for GDPR requests
- `POST /webhooks/customers/redact` - Anonymize/delete customer data
- `POST /webhooks/shop/redact` - Delete all shop data (48hrs after uninstall)

#### API Endpoints (`/api/`)
- `POST /api/opt-in` - Handle customer sweepstakes opt-in/opt-out
- `POST /api/cart-check` - Check cart total against threshold
- `GET /api/prize-pool` - Get current prize pool information

#### Admin Interface (`/admin/`)
- `GET /admin` - Main dashboard with stats and settings
- `POST /admin/settings` - Update merchant threshold and billing plan
- `GET /admin/entries` - List customer entries

#### Other Routes
- `GET /` - Status page (or redirect to admin if shop parameter provided)
- `GET /health` - Health check endpoint for Railway
- `GET /auth` - Shopify OAuth flow

### UI Extensions (Planned)

- **Theme App Extension**: Cart banner showing threshold progress
- **Checkout UI Extension**: Opt-in checkbox for sweepstakes
- **Admin Dashboard**: ✅ Implemented as HTML interface

## Business Logic

### Entry Creation Rules

1. Order must be paid (not just created)
2. Order subtotal must meet merchant's threshold
3. Customer must opt-in via checkout extension
4. US customers only (geo-validation required)
5. One entry per qualifying order

### Billing Logic

- Transaction fees charged only on opted-in orders
- Monthly invoicing via Stripe
- Refund handling: full refunds remove entries, partial refunds evaluated against threshold

### Prize Pool

- Shared across all merchants
- Quarterly drawings
- Real-time updates displayed to customers

## Environment Variables

```env
# Shopify App Configuration
SHOPIFY_API_KEY=206bca4f45097090e303515061f0414e
SHOPIFY_API_SECRET=7f1d08e7cf3d88857b6729f802ed176a
SHOPIFY_APP_URL=https://raffle-bee-production.up.railway.app
SCOPES=read_orders,read_customers,read_products

# Database
DATABASE_URL=  # Neon PostgreSQL connection string

# Stripe Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Optional
SHOP_CUSTOM_DOMAIN=
```

## Development Workflow

### Adding New Features

1. Update Prisma schema if database changes needed
2. Run `npm run prisma migrate dev` to create migration
3. Generate Prisma client with `npm run prisma generate`
4. Implement business logic in appropriate route handlers
5. Add UI components following Polaris design system
6. Test webhook handlers using Shopify CLI

### Testing Webhooks

```bash
# Test webhook locally
shopify app generate webhook
shopify app dev --webhook-trigger orders/paid
```

### Database Migrations

Always create migrations for schema changes:
```bash
npm run prisma migrate dev --name add_merchant_settings
```

## Key Constraints

- Checkout modifications limited to approved UI extensions
- All webhooks require HMAC verification
- Must validate payment status before creating entries
- US-only compliance requirements
- Private app distribution only

## Common Development Patterns

### Shopify Admin API Queries

```javascript
const response = await admin.graphql(`
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      totalPrice
      customer { id }
    }
  }
`, { variables: { id: orderId } });
```

### Database Operations

```javascript
// Create entry with Prisma
const entry = await prisma.entry.create({
  data: {
    orderId,
    merchantId,
    customerId,
    amount: order.totalPrice,
    period: getCurrentPeriod(),
  }
});
```

### Error Handling

Always wrap webhook handlers in try-catch and return appropriate HTTP status codes:
```javascript
try {
  // Process webhook
  return new Response(null, { status: 200 });
} catch (error) {
  console.error('Webhook error:', error);
  return new Response(null, { status: 500 });
}
```

## Success Metrics

- 15-25% increase in merchant average order value
- 25%+ customer opt-in rate when eligible
- Zero entry creation errors
- Accurate billing with proper refund handling

## Deployment Notes

✅ **DEPLOYED TO PRODUCTION**: https://raffle-bee-production.up.railway.app

- Express.js app successfully deployed on Railway
- Health checks passing (uptime: 10+ minutes)
- Neon PostgreSQL database connected
- Production URL configured in environment variables

### Next Steps for Shopify Integration:
1. Update Shopify Partner Dashboard with production URL
2. Configure webhooks to point to production endpoints:
   - `https://raffle-bee-production.up.railway.app/webhooks/orders/paid`
   - `https://raffle-bee-production.up.railway.app/webhooks/orders/updated`  
   - `https://raffle-bee-production.up.railway.app/webhooks/app/uninstalled`
3. Test complete integration flow
4. Deploy Theme App Extension and Checkout UI Extension