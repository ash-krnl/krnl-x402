import { FastifyRequest, FastifyReply } from 'fastify';
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
} from '../../x402/typescript/packages/x402/src/types/index';
import { krnlX402Middleware, createKRNLX402Config } from '../../middleware/krnl-x402';
import { isKRNLNetworkSupported } from './krnl-verify';

interface VerifyRequestBody {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * Handles POST requests to verify x402 payments - KRNL ONLY
 * 
 * This endpoint is exclusively for KRNL atomic verify+settle workflows.
 * There is no fallback to standard x402 verification.
 *
 * @param request - The incoming request containing payment verification details
 * @param reply - The response object
 * @returns A JSON response indicating whether the payment is valid
 */
export async function postVerifyPayment(
  request: FastifyRequest<{ Body: VerifyRequestBody }>,
  reply: FastifyReply
) {
  try {
    const { paymentPayload, paymentRequirements } = request.body;
    const network = paymentRequirements.network;

    console.log(`📋 Verify request received for network: ${network}`);

    // Check if network is supported for KRNL workflows
    if (!isKRNLNetworkSupported(network)) {
      console.error(`❌ Network not supported for KRNL workflows: ${network}`);
      reply.code(400);
      return {
        isValid: false,
        invalidReason: 'invalid_network',
        payer: 'authorization' in paymentPayload.payload
          ? (paymentPayload.payload as any).authorization?.from
          : undefined,
      } as VerifyResponse;
    }

    // Execute KRNL atomic workflow
    console.log(`🔧 Creating KRNL config...`);
    const krnlConfig = createKRNLX402Config();
    
    console.log(`⚡ Executing KRNL middleware...`);
    const krnlResult = await krnlX402Middleware(request, reply, krnlConfig);
    
    if (krnlResult) {
      console.log('✅ KRNL workflow started successfully');
      return krnlResult;
    }

    // If KRNL middleware returns null, it means KRNL is not properly configured
    console.error('❌ KRNL workflow failed - check configuration');
    reply.code(500);
    return {
      isValid: false,
      invalidReason: 'unexpected_verify_error',
      payer: 'authorization' in paymentPayload.payload
        ? (paymentPayload.payload as any).authorization?.from
        : undefined,
    } as VerifyResponse;
  } catch (error) {
    console.error('❌ Error in postVerifyPayment:', error);
    reply.code(500);
    return {
      isValid: false,
      invalidReason: 'unexpected_verify_error',
      payer: undefined,
    } as VerifyResponse;
  }
}

/**
 * Provides API documentation for the verify endpoint
 *
 * @param request - The incoming request
 * @param reply - The response object
 * @returns A JSON response describing the verify endpoint and its expected request body
 */
export async function getVerifyDocs(request: FastifyRequest, reply: FastifyReply) {
  return {
    endpoint: '/facilitator/verify',
    description: 'POST to verify x402 payments',
    body: {
      paymentPayload: 'PaymentPayload',
      paymentRequirements: 'PaymentRequirements',
    },
  };
}
