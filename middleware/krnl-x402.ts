import { FastifyRequest, FastifyReply } from 'fastify';
import type { PaymentPayload, PaymentRequirements, VerifyResponse } from '../x402/typescript/packages/x402/src/types/index';
import { createKRNLClient, type KRNLNodeConfig } from '../lib/krnl-client';
import { buildX402VerifySettleWorkflow, type X402WorkflowParams } from '../lib/workflow-builder';
import { trackWorkflow, startBackgroundPolling, getWorkflowByNonce } from '../lib/workflow-store';

// Extended VerifyResponse with settlement info
interface ExtendedVerifyResponse extends VerifyResponse {
  transactionHash?: string;
  network?: string;
  settled?: boolean;
}

interface VerifyRequestBody {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface KRNLX402Config {
  nodeUrl: string;
  rpcUrl: string;
  bundlerUrl?: string;
  paymasterUrl?: string;
  attestorImage: string;
  facilitatorUrl: string;
  targetContractAddress: string; // X402Target contract address (required)
  targetContractOwner: string; // Target contract owner/delegate (required)
}

/**
 * KRNL x402 middleware - KRNL ONLY
 * 
 * Starts KRNL workflow execution and returns immediately
 * Background polling will track workflow progress
 * 
 * No fallback logic - KRNL or fail
 */
export async function krnlX402Middleware(
  request: FastifyRequest<{ Body: VerifyRequestBody }>,
  reply: FastifyReply,
  config: KRNLX402Config
): Promise<VerifyResponse | null> {
  const { paymentPayload, paymentRequirements } = request.body;

  // Extract sender and nonce from payment payload
  const isEvmPayload = (p: any): p is { authorization: { from: string; nonce: string } } =>
    p && typeof p === 'object' && 'authorization' in p && p.authorization && 
    typeof p.authorization.from === 'string' && typeof p.authorization.nonce === 'string';

  if (!isEvmPayload(paymentPayload.payload)) {
    console.error('❌ Not an EVM payload');
    return null;
  }

  const sender = paymentPayload.payload.authorization.from;
  const paymentNonce = paymentPayload.payload.authorization.nonce;

  // Check if workflow already exists for this payment nonce (deduplication)
  const existingWorkflow = getWorkflowByNonce(paymentNonce);
  if (existingWorkflow) {
    console.log(`⚠️  Workflow already exists for nonce ${paymentNonce.slice(0, 10)}... (status: ${existingWorkflow.status})`);
    console.log(`   - Existing workflow ID: ${existingWorkflow.workflowId}`);
    console.log(`   - Skipping duplicate request`);
    return {
      isValid: true,
      payer: sender,
    } as VerifyResponse;
  }

  // IMPORTANT: Track workflow BEFORE execution to prevent race conditions
  // This ensures that if KRNL executes the verify step immediately,
  // it won't trigger a duplicate workflow creation
  console.log(`📝 Pre-tracking workflow for nonce ${paymentNonce.slice(0, 10)}... (status: pending)`);
  trackWorkflow(paymentNonce, 'PENDING_EXECUTION');

  // Create KRNL client
  const krnlConfig: KRNLNodeConfig = {
    nodeUrl: config.nodeUrl,
    rpcUrl: config.rpcUrl,
    bundlerUrl: config.bundlerUrl,
    paymasterUrl: config.paymasterUrl,
  };
  const krnlClient = createKRNLClient(krnlConfig);

  // Get KRNL node configuration
  const nodeConfig = await krnlClient.getNodeConfig();
  const nodeAddress = nodeConfig?.workflow?.node_address;

  if (!nodeAddress) {
    console.error('❌ KRNL node address not available');
    return null;
  }

  // Build workflow DSL for atomic verify + settle
  // IMPORTANT: delegateAddress = TARGET_CONTRACT_OWNER, nodeAddress = from KRNL config
  const workflowParams: X402WorkflowParams = {
    paymentPayload,
    paymentRequirements,
    targetContractAddress: config.targetContractAddress,
    delegateAddress: config.targetContractOwner,  // TARGET_CONTRACT_OWNER (matches frontend)
    nodeAddress,  // KRNL node address from getConfig() (matches frontend)
    attestorImage: config.attestorImage,
    facilitatorUrl: config.facilitatorUrl,
    rpcUrl: config.rpcUrl,
    bundlerUrl: config.bundlerUrl,
    paymasterUrl: config.paymasterUrl,
    privateKey: process.env.PRIVATE_KEY, // For signing transaction intent
  };

  const workflowDSL = await buildX402VerifySettleWorkflow(workflowParams);

  // Start workflow execution (returns immediately with intentId)
  console.log('🚀 Starting x402 workflow on KRNL node...');
  const result = await krnlClient.executeWorkflow(workflowDSL);

  if (!result.success) {
    console.error('❌ Failed to start KRNL workflow:', result.error);
    // Remove the pre-tracked workflow since execution failed
    const workflow = getWorkflowByNonce(paymentNonce);
    if (workflow) {
      workflow.status = 'failed';
      workflow.workflowStatus = { 
        status: 'failed', 
        workflowId: 'FAILED', 
        error: result.error 
      } as any;
    }
    return {
      isValid: false,
      invalidReason: 'unexpected_verify_error',
      payer: sender,
    } as VerifyResponse;
  }

  if (!result.workflowId) {
    console.error('❌ No intentId returned from KRNL');
    return {
      isValid: false,
      invalidReason: 'unexpected_verify_error',
      payer: sender,
    } as VerifyResponse;
  }

  // Update workflow tracking with actual intentId
  const workflow = getWorkflowByNonce(paymentNonce);
  if (workflow) {
    workflow.workflowId = result.workflowId;
    console.log(`✅ Updated workflow tracking with intentId: ${result.workflowId}`);
  }

  // Start background polling (does not block)
  // This will poll krnl_workflowStatus until code === 2 (completed)
  startBackgroundPolling(
    paymentNonce,
    result.workflowId,
    () => krnlClient.pollWorkflowUntilComplete(result.workflowId!, 60000, 2000)
  );

  console.log(`✅ KRNL workflow started successfully`);
  console.log(`   - Intent ID: ${result.workflowId}`);
  console.log(`   - Payment nonce: ${paymentNonce}`);
  console.log(`   - Background polling initiated`);

  // Return verify response immediately (non-blocking)
  // Settlement will complete asynchronously via KRNL workflow
  return {
    isValid: true,
    payer: sender,
  } as VerifyResponse;
}

/**
 * Helper to get chain ID from network name
 */
function getChainId(network: string): number {
  const chainIds: Record<string, number> = {
    'base-sepolia': 84532,
    'base': 8453,
    'ethereum': 1,
    'sepolia': 11155111,
    'solana-devnet': 900, // Not a real chain ID, placeholder
    'solana': 900,
  };

  return chainIds[network] || 1;
}

/**
 * Create KRNL x402 configuration from environment variables
 */
export function createKRNLX402Config(): KRNLX402Config {
  const targetContractAddress = process.env.TARGET_CONTRACT_ADDRESS;
  const targetContractOwner = process.env.TARGET_CONTRACT_OWNER;
  
  if (!targetContractAddress) {
    throw new Error('TARGET_CONTRACT_ADDRESS environment variable is required for KRNL workflows');
  }
  
  if (!targetContractOwner) {
    throw new Error('TARGET_CONTRACT_OWNER environment variable is required for KRNL workflows');
  }

  return {
    nodeUrl: process.env.KRNL_NODE_URL || 'https://node.krnl.xyz',
    rpcUrl: process.env.RPC_URL || 'https://lb.drpc.org/sepolia/AnRM4mK1tEyphrn_jexSLbrPxqT4wGIR760VIlZWwHzR',
    bundlerUrl: process.env.BUNDLER_URL,
    paymasterUrl: process.env.PAYMASTER_URL,
    attestorImage: process.env.ATTESTOR_IMAGE || 'ghcr.io/krnl-labs/attestor:latest',
    facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3000',
    targetContractAddress,
    targetContractOwner,
  };
}
