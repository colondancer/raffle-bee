const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

const router = express.Router();
const prisma = new PrismaClient();

// Admin dashboard - serve embedded Polaris interface
router.get('/', async (req, res) => {
  try {
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).send('Missing shop parameter');
    }

    // Get or create merchant
    let merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop },
    });

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          shopDomain: shop,
          threshold: 50, // Default $50 threshold
          billingPlan: 'STANDARD',
        },
      });
    }

    // Serve the embedded admin interface
    res.sendFile(path.join(__dirname, '../public/admin/index.html'));
    
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// API endpoint to get merchant data
router.get('/api/merchant', async (req, res) => {
  try {
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    res.json(merchant);
    
  } catch (error) {
    console.error('Merchant fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch merchant data' });
  }
});

// API endpoint to get entries
router.get('/api/entries', async (req, res) => {
  try {
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const entries = await prisma.entry.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(entries);
    
  } catch (error) {
    console.error('Entries fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Settings update
router.post('/settings', async (req, res) => {
  try {
    const { shop } = req.query;
    const { threshold, billingPlan } = req.body;
    
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    // Update merchant settings
    const merchant = await prisma.merchant.update({
      where: { shopDomain: shop },
      data: {
        threshold: parseFloat(threshold),
        billingPlan,
      },
    });

    res.json({ success: true, merchant });
    
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get entries for dashboard
router.get('/entries', async (req, res) => {
  try {
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain: shop },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const entries = await prisma.entry.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ entries });
    
  } catch (error) {
    console.error('Entries fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
});

// Simple HTML admin interface
function generateAdminHTML(merchant, stats) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RaffleBee Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f6f6f7;
            color: #202223;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 24px;
            border-radius: 8px;
            margin-bottom: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stat-value {
            font-size: 32px;
            font-weight: 600;
            color: #00848e;
            margin-bottom: 8px;
        }
        .stat-label {
            color: #6b7280;
            font-size: 14px;
        }
        .settings-card {
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #374151;
        }
        input, select {
            width: 100%;
            padding: 12px;
            border: 1px solid #d1d5db;
            border-radius: 6px;
            font-size: 14px;
        }
        button {
            background: #00848e;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
        }
        button:hover {
            background: #026670;
        }
        .help-text {
            font-size: 12px;
            color: #6b7280;
            margin-top: 4px;
        }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .badge.active {
            background: #dcfce7;
            color: #166534;
        }
        .badge.inactive {
            background: #fef3c7;
            color: #92400e;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 RaffleBee Dashboard</h1>
            <p>Increase your average order value with sweepstakes incentives</p>
            <div>
                <span class="badge ${merchant.isActive ? 'active' : 'inactive'}">
                    ${merchant.isActive ? 'Active' : 'Inactive'}
                </span>
                Current Plan: ${merchant.billingPlan}
            </div>
        </div>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${stats.totalEntries}</div>
                <div class="stat-label">Total Entries</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$${stats.totalRevenue.toFixed(2)}</div>
                <div class="stat-label">Total Revenue</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$${stats.averageOrderValue.toFixed(2)}</div>
                <div class="stat-label">Average Order Value</div>
            </div>
        </div>

        <div class="settings-card">
            <h2>Sweepstakes Settings</h2>
            <form id="settingsForm">
                <input type="hidden" name="shop" value="${merchant.shopDomain}">
                
                <div class="form-group">
                    <label for="threshold">Spending Threshold</label>
                    <input type="number" id="threshold" name="threshold" value="${merchant.threshold}" 
                           step="0.01" min="0" required>
                    <div class="help-text">Customers must spend above this amount to qualify for sweepstakes entry</div>
                </div>

                <div class="form-group">
                    <label for="billingPlan">Billing Plan</label>
                    <select id="billingPlan" name="billingPlan" required>
                        <option value="STANDARD" ${merchant.billingPlan === 'STANDARD' ? 'selected' : ''}>
                            Standard - Low monthly fee, higher transaction fees
                        </option>
                        <option value="ENTERPRISE" ${merchant.billingPlan === 'ENTERPRISE' ? 'selected' : ''}>
                            Enterprise - Higher monthly fee, lower transaction fees
                        </option>
                    </select>
                </div>

                <button type="submit">Save Settings</button>
            </form>
        </div>
    </div>

    <script>
        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            try {
                const response = await fetch('/admin/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data),
                });
                
                if (response.ok) {
                    alert('Settings saved successfully!');
                    location.reload();
                } else {
                    alert('Failed to save settings');
                }
            } catch (error) {
                alert('Error saving settings');
                console.error(error);
            }
        });
    </script>
</body>
</html>`;
}

module.exports = router;