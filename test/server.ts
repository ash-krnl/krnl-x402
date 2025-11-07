/**
 * Test Server for KRNL x402 Facilitator
 * 
 * Follows official x402 seller pattern:
 * - Uses x402-express middleware for automatic payment handling
 * - Protected endpoints return 402 without payment
 * - Middleware handles verification with facilitator
 * 
 * Reference: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers
 */

import { config } from 'dotenv';
import express from 'express';
import { paymentMiddleware } from '../x402/typescript/packages/x402-express/src/index';
import type { Address } from 'viem';

config();

const app = express();

// Configuration
const PORT = parseInt(process.env.TEST_SERVER_PORT || '4000');
const HOST = process.env.HOST || '0.0.0.0';
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS as Address;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3000';
const KRNL_NODE_URL = process.env.KRNL_NODE_URL || 'https://node.krnl.xyz';

if (!RECIPIENT_ADDRESS) {
  console.error('❌ Missing RECIPIENT_ADDRESS in .env');
  process.exit(1);
}

// Add CORS middleware to allow frontend requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Payment, X-Payout-Required');
  res.header('Access-Control-Expose-Headers', 'X-Payment-Response, X-Payout-Required');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Add JSON body parser
app.use(express.json());

// Expose KRNL node config to the browser via this server (avoids CORS and non-JSON issues)
app.get('/x402/config', async (req, res) => {
  try {
    const r = await fetch(`${KRNL_NODE_URL}/config`);
    const text = await r.text();
    try {
      const json = JSON.parse(text);
      res.status(r.status).json(json);
    } catch {
      res.status(r.status).send(text);
    }
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to fetch KRNL node config', details: e?.message });
  }
});

// Apply x402 payment middleware (official pattern)
// This automatically handles 402 responses and payment verification
app.use(
  paymentMiddleware(
    RECIPIENT_ADDRESS, // Your receiving wallet address
    {
      // Protected endpoint configuration
      'GET /premium': {
        price: '$0.01', // USDC amount in dollars
        network: 'sepolia',
        config: {
          description: 'Get premium content',
          outputSchema: {
            type: 'object',
            properties: {
              data: { type: 'object' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    {
      url: FACILITATOR_URL as `${string}://${string}`, // Use your KRNL facilitator
    }
  )
);

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'test-resource-server' });
});

/**
 * Protected resource: Premium content
 * Payment handled automatically by x402-express middleware (0.01 USDC)
 */
app.get('/premium', (req, res) => {
  // Middleware already verified payment - just return the content
  res.json({
    data: {
      title: 'Premium Content',
      content: 'This is protected premium content accessible via x402 payment',
      timestamp: new Date().toISOString(),
      paid: true,
    },
    message: '✅ Payment verified! Content delivered. Settlement via KRNL workflow.',
  });
});

/**
 * Start server
 */
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Test Resource Server (x402-express)`);
  console.log(`========================================`);
  console.log(`📍 Server: http://${HOST}:${PORT}`);
  console.log(`📍 Facilitator: ${FACILITATOR_URL}`);
  console.log(`📍 Recipient: ${RECIPIENT_ADDRESS}`);
  console.log(`\nEndpoints:`);
  console.log(`   GET  /health   - Health check (free)`);
  console.log(`   GET  /premium  - Premium content (0.01 USDC)`);
  console.log(`\nℹ️  Payment handling: x402-express middleware`);
  console.log(`ℹ️  Settlement: KRNL facilitator (atomic workflows)\n`);
});

export { app };
