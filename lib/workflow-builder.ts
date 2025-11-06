import type { WorkflowDSL, WorkflowStep } from './krnl-client';
import type { PaymentPayload, PaymentRequirements } from '../x402/typescript/packages/x402/src/types/index';
import type { Hex, Address } from 'viem';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Transaction Intent Parameters
 * Matches KRNL SDK TransactionIntentParams structure from frontend
 */
export interface TransactionIntentParams {
  target: Address;
  value: bigint;
  id: Hex;
  nodeAddress: Address;
  delegate: Address;
  targetFunction: Hex;
  nonce: bigint;
  deadline: bigint;
}

/**
 * Note: Transaction intent is created and signed by the CLIENT
 * 
 * The client:
 * 1. Creates intent params (nonce, deadline, id, etc.)
 * 2. Signs the intent with their key (e.g., Privy session key)
 * 3. Includes BOTH params and signature in payment payload
 * 
 * The facilitator uses the client's intent params directly from the payload.
 * This ensures the intent ID matches what the client signed!
 */

export interface X402WorkflowParams {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  attestorImage: string; // Docker attestor image
  facilitatorUrl: string; // Facilitator URL
  rpcUrl: string; // RPC endpoint
  bundlerUrl?: string; // Optional bundler URL
  paymasterUrl?: string; // Optional paymaster URL
  // Note: Client provides ALL intent params (target, delegate, node, nonce, deadline, signature)
  // Facilitator uses client's values directly - no overrides!
}

/**
 * Replace template placeholders with actual values
 * Supports both {{PLACEHOLDER}} syntax and nested object values
 */
function replaceTemplatePlaceholders(template: string, replacements: Record<string, any>): string {
  let result = template;
  
  // Replace all {{PLACEHOLDER}} patterns
  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    const replacementValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    result = result.split(placeholder).join(replacementValue);
  }
  
  return result;
}

/**
 * Load and process workflow template from JSON file
 */
function loadWorkflowTemplate(replacements: Record<string, any>): WorkflowDSL {
  const templatePath = path.join(__dirname, '..', 'facilitator', 'workflow-template.json');
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  const processedTemplate = replaceTemplatePlaceholders(templateContent, replacements);
  return JSON.parse(processedTemplate);
}

/**
 * Build KRNL workflow DSL for x402 payment settlement using template
 * 
 * Workflow:
 * 1. Call /verify endpoint to validate payment
 * 2. Encode PaymentParams struct for the target contract
 * 3. Call X402Target.executePayment() with encoded data
 * 
 * @param params Payment payload and requirements
 * @returns KRNL workflow DSL with signed transaction intent
 */
export async function buildX402VerifySettleWorkflow(params: X402WorkflowParams): Promise<WorkflowDSL> {
  const {
    paymentPayload,
    paymentRequirements,
  } = params;

  // Extract payment authorization from payload
  const payload = paymentPayload.payload as any;
  const authorization = payload.authorization;
  const signature = payload.signature;

  // Map network names to chain IDs and Pimlico network slugs
  const networkConfig: Record<string, { chainId: number; pimlicoSlug: string }> = {
    'sepolia': { chainId: 11155111, pimlicoSlug: 'sepolia' },
    'ethereum-sepolia': { chainId: 11155111, pimlicoSlug: 'sepolia' },
    'base-sepolia': { chainId: 84532, pimlicoSlug: 'base-sepolia' },
    'optimism-sepolia': { chainId: 11155420, pimlicoSlug: 'optimism-sepolia' },
    'arbitrum-sepolia': { chainId: 421614, pimlicoSlug: 'arbitrum-sepolia' },
  };

  const network = paymentRequirements.network.toLowerCase();
  const config = networkConfig[network] || networkConfig['sepolia']; // Default to Ethereum Sepolia

  // Extract sender from payment payload
  const sender = authorization.from as Address;
  
  // Extract transaction intent parameters from client payload
  // Client provides BOTH the intent params (nonce, deadline, id) AND signature
  // This ensures intent ID matches what client signed!
  const payloadData = payload as any;
  const clientIntent = payloadData.transactionIntent;
  const intentSignature: Hex = payloadData.intentSignature;
  
  if (!clientIntent) {
    console.error(`❌ No transaction intent provided by client`);
    console.error(`   Client must include transactionIntent in payment payload`);
    throw new Error('Missing transaction intent - client must provide intent parameters');
  }
  
  // Use client's intent parameters directly - DO NOT RECOMPUTE!
  // Client computed intentId = keccak256(sender, nonce, deadline) at time T1
  // If we recompute with new nonce/deadline at time T2, intentId will be different!
  const transactionIntent: TransactionIntentParams = {
    target: clientIntent.target as Address,
    value: BigInt(clientIntent.value),
    id: clientIntent.id as Hex,
    nodeAddress: clientIntent.nodeAddress as Address,
    delegate: clientIntent.delegate as Address,
    targetFunction: clientIntent.targetFunction as Hex,
    nonce: BigInt(clientIntent.nonce),
    deadline: BigInt(clientIntent.deadline)
  };
  
  console.log(`📝 Using client transaction intent:`);
  console.log(`   ID: ${transactionIntent.id}`);
  console.log(`   Nonce: ${transactionIntent.nonce.toString()}`);
  console.log(`   Deadline: ${transactionIntent.deadline.toString()}`);
  console.log(`   Delegate: ${transactionIntent.delegate}`);
  console.log(`   Target: ${transactionIntent.target}`);
  console.log(`   Node: ${transactionIntent.nodeAddress}`);
  console.log(`   Sender: ${sender}`);
  
  if (!intentSignature || intentSignature === '0x') {
    console.error(`❌ No intent signature provided by client`);
    console.error(`   Client must sign transaction intent before sending payment`);
    throw new Error('Missing intent signature - client must sign transaction intent');
  }
  
  console.log(`✅ Using client-signed transaction intent: ${intentSignature.slice(0, 10)}...`);

  // Build template replacements object
  const replacements = {
    // Core workflow params
    CHAIN_ID: config.chainId.toString(),
    SENDER: sender,
    DELEGATE: transactionIntent.delegate,  // Use client's delegate value!
    ATTESTOR_IMAGE: params.attestorImage,
    TARGET_CONTRACT: transactionIntent.target,  // Use client's target value!
    
    // Intent params from client
    INTENT_ID: transactionIntent.id,
    INTENT_SIGNATURE: intentSignature,
    INTENT_DEADLINE: transactionIntent.deadline.toString(),
    
    // Network configuration
    RPC_URL: params.rpcUrl,
    BUNDLER_URL: params.bundlerUrl || `https://api.pimlico.io/v2/${config.pimlicoSlug}/rpc?apikey=PLACEHOLDER`,
    PAYMASTER_URL: params.paymasterUrl || `https://api.pimlico.io/v2/${config.pimlicoSlug}/rpc?apikey=PLACEHOLDER`,
    
    // Facilitator URL
    FACILITATOR_URL: params.facilitatorUrl,
    
    // Payment payload (as JSON objects for nested replacement)
    PAYMENT_PAYLOAD: paymentPayload,
    PAYMENT_REQUIREMENTS: paymentRequirements,
    
    // Payment authorization fields
    PAYMENT_FROM: authorization.from,
    PAYMENT_NONCE: authorization.nonce,
    PAYMENT_SIGNATURE: signature,
    PAYMENT_TO: authorization.to,
    PAYMENT_VALID_AFTER: authorization.validAfter.toString(),
    PAYMENT_VALID_BEFORE: authorization.validBefore.toString(),
    PAYMENT_VALUE: authorization.value.toString(),
  };
  
  console.log(`📝 Building workflow from template with replacements:`);
  console.log(`   Chain ID: ${config.chainId}`);
  console.log(`   Sender: ${sender}`);
  console.log(`   Intent ID: ${transactionIntent.id}`);
  console.log(`   Using template: facilitator/workflow-template.json`);

  // Load and process template
  const workflow = loadWorkflowTemplate(replacements);

  return workflow;
}

