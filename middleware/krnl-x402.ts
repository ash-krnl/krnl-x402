import { FastifyRequest, FastifyReply } from 'fastify';
import type { PaymentPayload, PaymentRequirements, VerifyResponse } from 'x402/types';
import { createKRNLClient, type KRNLNodeConfig } from '../lib/krnl-client';
import { buildSimpleX402Workflow, type X402WorkflowParams } from '../lib/workflow-builder';
import { trackWorkflow, startBackgroundPolling } from '../lib/workflow-store';

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
  enabled: boolean;
  nodeUrl: string;
  rpcUrl: string;
  bundlerUrl?: string;
  paymasterUrl?: string;
  attestorImage: string;
  facilitatorUrl: string;
  defaultDelegate?: string;
}

/**
 * KRNL-enhanced x402 middleware
 * 
 * Starts KRNL workflow execution and returns immediately
 * Background polling will track workflow progress
 */
export async function krnlX402Middleware(
  request: FastifyRequest<{ Body: VerifyRequestBody }>,
  reply: FastifyReply,
  config: KRNLX402Config
): Promise<VerifyResponse | null> {
  // If KRNL is disabled, return null to let normal flow continue
  if (!config.enabled) {
    return null;
  }

  const { paymentPayload, paymentRequirements } = request.body;

  try {
    // Extract sender and nonce from payment payload
    const isEvmPayload = (p: any): p is { authorization: { from: string; nonce: string } } =>
      p && typeof p === 'object' && 'authorization' in p && p.authorization && 
      typeof p.authorization.from === 'string' && typeof p.authorization.nonce === 'string';

    if (!isEvmPayload(paymentPayload.payload)) {
      console.log('Not an EVM payload, falling back to standard flow');
      return null;
    }

    const sender = paymentPayload.payload.authorization.from;
    const paymentNonce = paymentPayload.payload.authorization.nonce;

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
    const nodeAddress = nodeConfig?.workflow?.node_address || config.defaultDelegate;

    if (!nodeAddress) {
      console.error('KRNL node address not available, falling back to standard flow');
      return null;
    }

    // Build workflow DSL for atomic verify + settle
    const workflowParams: X402WorkflowParams = {
      paymentPayload,
      paymentRequirements,
      sender,
      delegate: nodeAddress,
      chainId: getChainId(paymentRequirements.network),
      facilitatorUrl: config.facilitatorUrl,
      attestorImage: config.attestorImage,
      rpcUrl: config.rpcUrl,
      bundlerUrl: config.bundlerUrl,
      paymasterUrl: config.paymasterUrl,
    };

    const workflowDSL = buildSimpleX402Workflow(workflowParams);

    // Start workflow execution (returns immediately with workflow ID)
    console.log('🚀 Starting x402 workflow on KRNL node...');
    const result = await krnlClient.executeWorkflow(workflowDSL);

    if (!result.success || !result.workflowId) {
      console.error('Failed to start KRNL workflow:', result.error);
      return null;
    }

    // Track workflow for async polling
    trackWorkflow(paymentNonce, result.workflowId);

    // Start background polling (does not block)
    startBackgroundPolling(
      paymentNonce,
      result.workflowId,
      () => krnlClient.pollWorkflowUntilComplete(result.workflowId!, 60000, 2000)
    );

    console.log(`✅ KRNL workflow ${result.workflowId} started (polling in background)`);

    // Return verify response immediately
    // Settlement will complete asynchronously
    return {
      isValid: true,
      payer: sender,
    };
  } catch (error) {
    console.error('KRNL middleware error:', error);
    // Fall back to standard flow on error
    return null;
  }
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
  return {
    enabled: process.env.KRNL_ENABLED === 'true',
    nodeUrl: process.env.KRNL_NODE_URL || 'https://node.krnl.xyz',
    rpcUrl: process.env.RPC_URL || 'https://lb.drpc.org/sepolia/AnRM4mK1tEyphrn_jexSLbrPxqT4wGIR760VIlZWwHzR',
    bundlerUrl: process.env.BUNDLER_URL,
    paymasterUrl: process.env.PAYMASTER_URL,
    attestorImage: process.env.ATTESTOR_IMAGE || 'ghcr.io/krnl-labs/attestor:latest',
    facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3000',
    defaultDelegate: process.env.DEFAULT_DELEGATE,
  };
}
