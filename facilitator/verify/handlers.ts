import { FastifyRequest, FastifyReply } from 'fastify';
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
} from '../../x402/typescript/packages/x402/src/types/index';
import { krnlX402Middleware, createKRNLX402Config } from '../../middleware/krnl-x402';
import { isKRNLNetworkSupported, verifyPaymentForKRNL } from './krnl-verify';

interface VerifyRequestBody {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * Handles POST requests to verify x402 payments - KRNL ONLY
 * 
 * This endpoint serves two purposes:
 * 1. External calls: Start KRNL atomic verify+settle workflow
 * 2. Internal calls (from KRNL workflow): Just verify payment without starting new workflow
 *
 * Internal calls are detected by the 'x-krnl-internal' header to prevent circular workflow creation.
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

    // Detect if this is an INTERNAL call from a KRNL workflow
    const isInternalCall = request.headers['x-krnl-internal'] === 'true';

    if (isInternalCall) {
      // INTERNAL: Called from within KRNL workflow - just verify, don't start new workflow
      console.log(`🔍 Internal verify call (from KRNL workflow)`);
      const verifyResult = await verifyPaymentForKRNL(
        paymentPayload,
        paymentRequirements,
        process.env.RPC_URL
      );
      console.log(`✅ Payment verification: ${verifyResult.isValid ? 'VALID' : 'INVALID'}`);
      return verifyResult;
    } else {
      // EXTERNAL: Client request - start KRNL atomic workflow
      console.log(`📋 External verify request - starting KRNL workflow for network: ${network}`);
      const krnlConfig = createKRNLX402Config();
      const krnlResult = await krnlX402Middleware(request, reply, krnlConfig);
      
      if (krnlResult) {
        console.log('✅ KRNL workflow started successfully');
        return krnlResult;
      }

      // KRNL middleware failed
      console.error('❌ KRNL workflow failed - check configuration');
      reply.code(500);
      return {
        isValid: false,
        invalidReason: 'unexpected_verify_error',
        payer: 'authorization' in paymentPayload.payload
          ? (paymentPayload.payload as any).authorization?.from
          : undefined,
      } as VerifyResponse;
    }
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
