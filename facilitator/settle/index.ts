import { FastifyInstance } from 'fastify';
import { postSettlePayment, getSettleDocs } from './handlers';

export default async function settleRoutes(fastify: FastifyInstance) {
  // POST endpoint to settle payments
  fastify.post('/facilitator/settle', postSettlePayment);
  
  // GET endpoint for documentation
  fastify.get('/facilitator/settle', getSettleDocs);
}
