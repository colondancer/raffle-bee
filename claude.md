# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RaffleBee is a Shopify app that increases merchant revenue by offering customers sweepstake entries when they hit spending thresholds. All participating stores share one prize pool, creating network effects.

## Technology Stack

- **Framework**: Remix + Shopify App Remix
- **Database**: Neon PostgreSQL with Prisma ORM
- **Payments**: Stripe for merchant billing
- **Frontend**: Polaris + Shopify UI Extensions
- **Deployment**: Shopify App Store (private distribution)

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Database operations
npm run prisma generate    # Generate Prisma client
npm run prisma migrate dev # Run migrations in development
npm run prisma migrate deploy # Deploy migrations to production
npm run prisma studio      # Open Prisma Studio

# Linting and formatting
npm run lint

# Shopify CLI commands
npm run deploy          # Deploy app to Shopify
npm run generate        # Generate Shopify extensions
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

- `app/routes/` - Remix routes for admin pages and API endpoints
- `app/routes/webhooks/` - Shopify webhook handlers
- `extensions/` - Shopify UI extensions (cart banner, checkout)
- `prisma/` - Database schema and migrations

### Webhook Handlers

- `orders/paid` - Create entries for qualifying orders
- `orders/updated` - Handle refunds and entry adjustments
- `app/uninstalled` - Clean up merchant data

### UI Extensions

- **Theme App Extension**: Cart banner showing threshold progress
- **Checkout UI Extension**: Opt-in checkbox for sweepstakes
- **Admin Dashboard**: Merchant settings and analytics

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
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=
SCOPES=read_orders,write_products

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

- Use `npm run deploy` to deploy to Shopify
- Ensure DATABASE_URL points to production Neon database
- Set NODE_ENV=production in production environment
- Monitor webhook delivery in Shopify Partner Dashboard