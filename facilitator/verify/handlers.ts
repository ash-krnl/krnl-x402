import { FastifyRequest, FastifyReply } from 'fastify';
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
} from 'x402/types';
import { verify } from 'x402/facilitator';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { krnlX402Middleware, createKRNLX402Config } from '../../middleware/krnl-x402';

// Supported networks (from x402 SDK)
const SupportedEVMNetworks = [
  'abstract', 'abstract-testnet', 'base-sepolia', 'base',
  'avalanche-fuji', 'avalanche', 'iotex', 'sei', 'sei-testnet',
  'polygon', 'polygon-amoy', 'peaq'
];

// KRNL does not support Solana yet; disable SVM support for now
const SupportedSVMNetworks: string[] = [];

interface VerifyRequestBody {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * Handles POST requests to verify x402 payments
 * 
 * Flow:
 * 1. KRNL middleware intercepts and attempts atomic verify+settle
 * 2. If KRNL succeeds, return result directly
 * 3. If KRNL is disabled or fails, fall back to standard verification
 *
 * @param request - The incoming request containing payment verification details
 * @param reply - The response object
 * @returns A JSON response indicating whether the payment is valid
 */
export async function postVerifyPayment(
  request: FastifyRequest<{ Body: VerifyRequestBody }>,
  reply: FastifyReply
) {
  // Try KRNL atomic execution first
  const krnlConfig = createKRNLX402Config();
  const krnlResult = await krnlX402Middleware(request, reply, krnlConfig);
  
  // If KRNL handled it successfully, return the result
  if (krnlResult) {
    console.log('✅ Request handled by KRNL atomic flow');
    return krnlResult;
  }
  
  // Fall back to standard verification flow
  console.log('📋 Using standard verification flow');
  const { paymentPayload: rawPaymentPayload, paymentRequirements: rawPaymentRequirements } = request.body;

  const network = rawPaymentRequirements.network;
  
  // Create appropriate client based on network type
  let client: any;
  
  if (SupportedEVMNetworks.includes(network)) {
    // EVM network - create viem client
    // For now, default to baseSepolia - extend this for other networks
    client = createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.RPC_URL)
    });
  } else if (SupportedSVMNetworks.includes(network)) {
    // SVM network - would need Solana client setup
    // For now, return unsupported
    reply.code(400);
    return {
      isValid: false,
      invalidReason: 'invalid_network',
    } as VerifyResponse;
  } else {
    reply.code(400);
    return {
      isValid: false,
      invalidReason: 'invalid_network',
    } as VerifyResponse;
  }

  // Use the payload and requirements directly
  // The x402 verify function will validate them
  const paymentPayload = rawPaymentPayload;
  const paymentRequirements = rawPaymentRequirements;

  try {
    const verifyResult = await verify(client, paymentPayload, paymentRequirements);
    return verifyResult;
  } catch (error) {
    console.error('Error verifying payment:', error);
    reply.code(500);
    return {
      isValid: false,
      invalidReason: 'unexpected_verify_error',
      payer: 'authorization' in paymentPayload.payload
        ? paymentPayload.payload.authorization.from
        : undefined,
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
