import Fastify from 'fastify';
import { postVerifyPayment, getVerifyDocs } from './facilitator/verify';
import { postSettlePayment, getSettleDocs } from './facilitator/settle/handlers';
import { getSupportedPaymentKinds } from './facilitator/supported';

// Create Fastify instance with optimized settings
const fastify = Fastify({
  logger: false, // Disable logging for max performance
  disableRequestLogging: true,
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

// Start server
const start = async () => {
  try {
    const PORT = parseInt(process.env.PORT || '3000', 10);
    const HOST = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🚀 X402 Facilitator Server running on http://${HOST}:${PORT}`);
    console.log(`📍 Endpoints:`);
    console.log(`   - POST http://${HOST}:${PORT}/facilitator/verify`);
    console.log(`   - GET  http://${HOST}:${PORT}/facilitator/verify`);
    console.log(`   - POST http://${HOST}:${PORT}/facilitator/settle`);
    console.log(`   - GET  http://${HOST}:${PORT}/facilitator/settle`);
    console.log(`   - GET  http://${HOST}:${PORT}/facilitator/supported`);
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
