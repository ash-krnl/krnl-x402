import { config } from 'dotenv';
import Fastify from 'fastify';
import { postVerifyPayment, getVerifyDocs } from './facilitator/verify';
import { postSettlePayment, getSettleDocs } from './facilitator/settle/handlers';
import { getSupportedPaymentKinds } from './facilitator/supported';
import { ensureKRNLDelegation } from './lib/eip7702-delegation';
import type { Hex } from 'viem';

// Load environment variables FIRST
config();

// Create Fastify instance with optimized settings
const fastify = Fastify({
  logger: true, // Enable logging for debugging
  disableRequestLogging: false,
  trustProxy: true,
  ignoreTrailingSlash: true,
});

// Health check endpoint
fastify.get('/health', async () => ({ status: 'ok' }));

// Facilitator routes
fastify.post('/facilitator/verify', postVerifyPayment);
fastify.get('/facilitator/verify', getVerifyDocs);
fastify.post('/facilitator/settle', postSettlePayment);
fastify.get('/facilitator/settle', getSettleDocs);
fastify.get('/facilitator/supported', getSupportedPaymentKinds);

// Alias routes to support default x402 SDK endpoints
// These mirror the /facilitator/* endpoints for compatibility with x402-express
fastify.post('/verify', postVerifyPayment);
fastify.get('/verify', getVerifyDocs);
fastify.post('/settle', postSettlePayment);
fastify.get('/settle', getSettleDocs);
fastify.get('/supported', getSupportedPaymentKinds);

// Start server
const start = async () => {
  try {
    const PORT = parseInt(process.env.PORT || '3000', 10);
    const HOST = process.env.HOST || '0.0.0.0';
    
    // Check EIP-7702 delegation if KRNL is enabled
    if (process.env.KRNL_ENABLED === 'true' && process.env.PRIVATE_KEY) {
      const delegationResult = await ensureKRNLDelegation({
        privateKey: process.env.PRIVATE_KEY as Hex,
        rpcUrl: process.env.RPC_URL || 'https://eth-sepolia.public.blastapi.io',
        krnlNodeUrl: process.env.KRNL_NODE_URL,
        delegateAddress: process.env.KRNL_DELEGATE_ADDRESS as Hex | undefined,
      });
      
      if (!delegationResult.success) {
        console.warn('⚠️  Starting server anyway, but KRNL workflows may fail');
      }
    }
    
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 X402 Facilitator Server running on http://${HOST}:${PORT}`);
    console.log(`📍 Endpoints:`);
    console.log(`   - POST http://${HOST}:${PORT}/facilitator/verify`);
    console.log(`   - GET  http://${HOST}:${PORT}/facilitator/verify`);
    console.log(`   - POST http://${HOST}:${PORT}/facilitator/settle`);
    console.log(`   - GET  http://${HOST}:${PORT}/facilitator/settle`);
    console.log(`   - GET  http://${HOST}:${PORT}/facilitator/supported`);
    console.log(`   - POST http://${HOST}:${PORT}/verify (alias)`);
    console.log(`   - GET  http://${HOST}:${PORT}/verify (alias)`);
    console.log(`   - POST http://${HOST}:${PORT}/settle (alias)`);
    console.log(`   - GET  http://${HOST}:${PORT}/settle (alias)`);
    console.log(`   - GET  http://${HOST}:${PORT}/supported (alias)`);
    console.log(`   - GET  http://${HOST}:${PORT}/health`);
  } catch (err) {
    console.error('❌ Error starting server:', err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('\n⏳ Shutting down gracefully...');
  try {
    await fastify.close();
    console.log('✅ Server closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();

export default fastify;
