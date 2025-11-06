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
  
  // Extract flat KRNL intent fields from client payload
  // Client provides only the fields needed for DSL template replacement
  const payloadData = payload as any;
  const intentId: Hex | undefined = payloadData.intentId;
  const intentSignature: Hex | undefined = payloadData.intentSignature;
  const intentDeadline: string | undefined = payloadData.intentDeadline;
  const intentDelegate: Address | undefined = payloadData.intentDelegate;
  const intentTarget: Address | undefined = payloadData.intentTarget;
  
  // Validate required KRNL fields
  if (!intentId || !intentSignature || !intentDeadline || !intentDelegate || !intentTarget) {
    console.error(`❌ Missing KRNL intent fields from client`);
    console.error(`   Required: intentId, intentSignature, intentDeadline, intentDelegate, intentTarget`);
    console.error(`   Received:`, { intentId, intentSignature, intentDeadline, intentDelegate, intentTarget });
    throw new Error('Missing KRNL intent fields - client must provide all intent parameters');
  }
  
  console.log(`📝 Using client KRNL intent fields:`);
  console.log(`   Intent ID: ${intentId}`);
  console.log(`   Signature: ${intentSignature.slice(0, 10)}...`);
  console.log(`   Deadline: ${intentDeadline}`);
  console.log(`   Delegate: ${intentDelegate}`);
  console.log(`   Target: ${intentTarget}`);
  console.log(`   Sender: ${sender}`);

  // Build template replacements object
  const replacements = {
    // Core workflow params
    CHAIN_ID: config.chainId.toString(),
    SENDER: sender,
    DELEGATE: intentDelegate,  // Use client's delegate value!
    ATTESTOR_IMAGE: params.attestorImage,
    TARGET_CONTRACT: intentTarget,  // Use client's target value!
    
    // Intent params from client
    INTENT_ID: intentId,
    INTENT_SIGNATURE: intentSignature,
    INTENT_DEADLINE: intentDeadline,
    
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
  console.log(`   Intent ID: ${intentId}`);
  console.log(`   Using template: facilitator/workflow-template.json`);

  // Load and process template
  const workflow = loadWorkflowTemplate(replacements);

  return workflow;
}

