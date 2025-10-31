import { FastifyRequest, FastifyReply } from 'fastify';
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from 'x402/types';
import { settle } from 'x402/facilitator';
import { createSigner } from 'x402/types';
import { getWorkflowByNonce } from '../../lib/workflow-store';
import { createKRNLClient } from '../../lib/krnl-client';
import { createKRNLX402Config } from '../../middleware/krnl-x402';

// Legacy cache for non-KRNL settlements
const settlementCache = new Map<string, SettleResponse>();

interface SettleRequestBody {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * Creates a cache key for settlement tracking
 */
function createSettlementKey(payload: PaymentPayload): string {
  // Use nonce from EVM payload as unique identifier
  if ('authorization' in payload.payload && payload.payload.authorization) {
    return `${payload.payload.authorization.nonce}`;
  }
  // Fallback: use stringified payload (not ideal, but works)
  return JSON.stringify(payload);
}

/**
 * Handles POST requests to settle x402 payments
 * 
 * Flow:
 * 1. Check if KRNL workflow exists for this payment nonce
 * 2. If workflow completed: return cached result
 * 3. If workflow running: wait for completion (with timeout)
 * 4. If no workflow: fall back to standard x402 settle
 *
 * @param request - The incoming request containing payment settlement details
 * @param reply - The response object
 * @returns A JSON response indicating settlement success and transaction hash
 */
export async function postSettlePayment(
  request: FastifyRequest<{ Body: SettleRequestBody }>,
  reply: FastifyReply
) {
  const { paymentPayload, paymentRequirements } = request.body;

  // Extract payment nonce
  const paymentNonce = 'authorization' in paymentPayload.payload
    ? paymentPayload.payload.authorization.nonce
    : undefined;
  
  if (!paymentNonce) {
    console.log('No payment nonce found, using standard settle');
    return fallbackSettle(request, reply);
  }

  // Check if KRNL workflow exists for this payment
  const workflow = getWorkflowByNonce(paymentNonce);
  
  if (!workflow) {
    // No KRNL workflow - check legacy cache or use standard settle
    const settlementKey = createSettlementKey(paymentPayload);
    const cachedSettlement = settlementCache.get(settlementKey);
    
    if (cachedSettlement) {
      console.log('✅ Returning cached non-KRNL settlement');
      return cachedSettlement;
    }
    
    console.log('No KRNL workflow tracked, using standard settle');
    return fallbackSettle(request, reply);
  }

  // KRNL workflow exists - check its status
  console.log(`🔍 Checking KRNL workflow ${workflow.workflowId} status: ${workflow.status}`);

  if (workflow.status === 'completed' && workflow.settleResult) {
    console.log('✅ Returning completed KRNL settlement result');
    return workflow.settleResult;
  }

  if (workflow.status === 'failed') {
    console.log('❌ KRNL workflow failed, falling back to standard settle');
    return fallbackSettle(request, reply);
  }

  // Workflow is pending or running - wait for it
  if (workflow.status === 'pending' || workflow.status === 'running') {
    console.log(`⏳ Waiting for KRNL workflow ${workflow.workflowId} to complete...`);
    
    try {
      const krnlConfig = createKRNLX402Config();
      const krnlClient = createKRNLClient({
        nodeUrl: krnlConfig.nodeUrl,
        rpcUrl: krnlConfig.rpcUrl,
        bundlerUrl: krnlConfig.bundlerUrl,
        paymasterUrl: krnlConfig.paymasterUrl,
      });
      
      // Wait for workflow completion (30s timeout for settle endpoint)
      const workflowStatus = await krnlClient.pollWorkflowUntilComplete(workflow.workflowId, 30000, 2000);
      
      if (workflowStatus.status === 'completed' && workflowStatus.transactionHash) {
        const settleResult: SettleResponse = {
          success: true,
          transaction: workflowStatus.transactionHash,
          network: paymentRequirements.network,
          payer: 'authorization' in paymentPayload.payload 
            ? paymentPayload.payload.authorization.from 
            : undefined,
        };
        
        console.log(`✅ KRNL workflow completed with tx: ${workflowStatus.transactionHash}`);
        return settleResult;
      }
    } catch (error) {
      console.error('Failed to wait for KRNL workflow:', error);
    }
    
    // Timeout or error - fall back
    console.log('⚠️ KRNL workflow timeout, falling back to standard settle');
    return fallbackSettle(request, reply);
  }

  // Unknown state - fallback
  return fallbackSettle(request, reply);
}

/**
 * Fallback to standard x402 settle when KRNL is unavailable
 */
async function fallbackSettle(
  request: FastifyRequest<{ Body: SettleRequestBody }>,
  reply: FastifyReply
): Promise<SettleResponse> {
  const { paymentPayload, paymentRequirements } = request.body;
  
  // Check legacy cache
  const settlementKey = createSettlementKey(paymentPayload);
  const cachedSettlement = settlementCache.get(settlementKey);
  
  if (cachedSettlement) {
    console.log('✅ Settlement already completed (returning cached result)');
    return cachedSettlement;
  }

  // Get private key from environment
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY not set in environment');
    reply.code(500);
    return {
      success: false,
      errorReason: 'unexpected_settle_error' as any,
      transaction: '',
      network: paymentRequirements.network,
    };
  }

  try {
    // Create signer using x402 SDK
    const signer = await createSigner(paymentRequirements.network, privateKey);

    // Perform settlement using x402 SDK
    console.log('💰 Settling payment on-chain...');
    const settleResult = await settle(signer, paymentPayload, paymentRequirements);

    // Cache the result for idempotency
    if (settleResult.success) {
      settlementCache.set(settlementKey, settleResult);
      console.log(`✅ Settlement successful: ${settleResult.transaction}`);
    }

    return settleResult;
  } catch (error) {
    console.error('Error settling payment:', error);
    reply.code(500);
    return {
      success: false,
      errorReason: 'unexpected_settle_error',
      transaction: '',
      network: paymentRequirements.network,
      payer: 'authorization' in paymentPayload.payload
        ? paymentPayload.payload.authorization.from
        : undefined,
    } as SettleResponse;
  }
}

/**
 * Provides API documentation for the settle endpoint
 */
export async function getSettleDocs(request: FastifyRequest, reply: FastifyReply) {
  return {
    endpoint: '/facilitator/settle',
    description: 'POST to settle x402 payments on-chain',
    body: {
      paymentPayload: 'PaymentPayload',
      paymentRequirements: 'PaymentRequirements',
    },
  };
}
