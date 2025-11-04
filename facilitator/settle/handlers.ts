import { FastifyRequest, FastifyReply } from 'fastify';
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
} from '../../x402/typescript/packages/x402/src/types/index';
import { getWorkflowByNonce } from '../../lib/workflow-store';
import { createKRNLClient } from '../../lib/krnl-client';
import { createKRNLX402Config } from '../../middleware/krnl-x402';

interface SettleRequestBody {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

/**
 * Handles POST requests to settle x402 payments - KRNL ONLY
 * 
 * Flow:
 * 1. Check if KRNL workflow exists for this payment nonce
 * 2. If workflow completed: return result immediately
 * 3. If workflow running: poll until completion (30s timeout)
 * 4. If no workflow: return error (atomic verify+settle required)
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
    console.error('❌ No payment nonce found in payload');
    reply.code(400);
    return {
      success: false,
      errorReason: 'unexpected_settle_error',
      transaction: '',
      network: paymentRequirements.network,
    } as SettleResponse;
  }

  // Check if KRNL workflow exists for this payment
  const workflow = getWorkflowByNonce(paymentNonce);
  
  if (!workflow) {
    console.error(`❌ No KRNL workflow found for nonce ${paymentNonce.slice(0, 10)}...`);
    console.error('   Payment must go through /verify endpoint first to create atomic workflow');
    reply.code(404);
    return {
      success: false,
      errorReason: 'unexpected_settle_error',
      transaction: '',
      network: paymentRequirements.network,
    } as SettleResponse;
  }

  // KRNL workflow exists - check its status
  console.log(`🔍 Checking KRNL workflow ${workflow.workflowId} status: ${workflow.status}`);

  // If already completed, return cached result
  if (workflow.status === 'completed' && workflow.settleResult) {
    console.log('✅ Returning completed KRNL settlement result');
    return workflow.settleResult;
  }

  // If failed, return error
  if (workflow.status === 'failed') {
    console.error('❌ KRNL workflow failed');
    const errorMessage = workflow.workflowStatus?.error || 'Workflow execution failed';
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

  // Workflow is pending or running - wait for completion
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
      
      // Workflow completed but no transaction hash
      console.error('❌ Workflow completed but no transaction hash returned');
      reply.code(500);
      return {
        success: false,
        errorReason: 'unexpected_settle_error',
        transaction: '',
        network: paymentRequirements.network,
      } as SettleResponse;
      
    } catch (error) {
      console.error('❌ Error polling KRNL workflow:', error);
      reply.code(500);
      return {
        success: false,
        errorReason: 'unexpected_settle_error',
        transaction: '',
        network: paymentRequirements.network,
      } as SettleResponse;
    }
  }

  // Unknown state
  console.error(`❌ Workflow in unknown state: ${workflow.status}`);
  reply.code(500);
  return {
    success: false,
    errorReason: 'unexpected_settle_error',
    transaction: '',
    network: paymentRequirements.network,
  } as SettleResponse;
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
