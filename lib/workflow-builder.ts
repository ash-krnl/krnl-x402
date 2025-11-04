import type { WorkflowDSL, WorkflowStep } from './krnl-client';
import type { PaymentPayload, PaymentRequirements } from '../x402/typescript/packages/x402/src/types/index';
import { keccak256, encodePacked, type Hex, type Address, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, baseSepolia, optimismSepolia, arbitrumSepolia } from 'viem/chains';

/**
 * Sign a transaction intent for KRNL workflow execution
 * Matches the frontend pattern from KRNL SDK
 */
async function signTransactionIntent(
  intentId: Hex,
  sender: Address,
  target: Address,
  delegate: Address,
  deadline: bigint,
  privateKey: Hex,
  chainId: number
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  
  // EIP-712 domain for KRNL transaction intents
  const domain = {
    name: 'KRNL',
    version: '1',
    chainId,
  } as const;
  
  // Transaction intent type
  const types = {
    TransactionIntent: [
      { name: 'id', type: 'bytes32' },
      { name: 'sender', type: 'address' },
      { name: 'target', type: 'address' },
      { name: 'delegate', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
  } as const;
  
  // Sign the transaction intent
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'TransactionIntent',
    message: {
      id: intentId,
      sender,
      target,
      delegate,
      deadline,
    },
  });
  
  return signature;
}

export interface X402WorkflowParams {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  targetContractAddress: string; // X402Target contract address
  delegateAddress: string; // KRNL node delegate address
  attestorImage: string; // Docker attestor image
  facilitatorUrl: string; // Facilitator URL
  rpcUrl: string; // RPC endpoint
  bundlerUrl?: string; // Optional bundler URL
  paymasterUrl?: string; // Optional paymaster URL
  privateKey?: string; // Private key for signing transaction intent
}

// Minimal ABI for reading nonces from target contract
const NONCES_ABI = [{
  name: 'nonces',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: 'nonce', type: 'uint256' }],
}] as const;

/**
 * Get contract nonce for a sender address
 * Matches the sample frontend pattern: getContractNonce()
 */
async function getContractNonce(
  targetContractAddress: string,
  senderAddress: string,
  rpcUrl: string,
  chainId: number
): Promise<bigint> {
  // Map chainId to viem chain
  const chainMap: Record<number, any> = {
    11155111: sepolia,
    84532: baseSepolia,
    11155420: optimismSepolia,
    421614: arbitrumSepolia,
  };
  
  const chain = chainMap[chainId] || sepolia;
  
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  
  try {
    const nonce = await client.readContract({
      address: targetContractAddress as Address,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [senderAddress as Address],
    });
    
    console.log(`📊 Contract nonce for ${senderAddress}: ${nonce}`);
    return nonce as bigint;
  } catch (error) {
    console.error(`❌ Failed to read contract nonce:`, error);
    // Fallback to 0 if contract doesn't have nonces function
    console.warn(`⚠️  Using nonce = 0 (contract may not have nonces function)`);
    return 0n;
  }
}

/**
 * Build KRNL workflow DSL for x402 payment settlement
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
    targetContractAddress,
  } = params;

  // Step 1: Call facilitator /verify endpoint
  const verifyStep: WorkflowStep = {
    name: 'x402-verify-payment',
    image: 'ghcr.io/krnl-labs/executor-http@sha256:07ef35b261014304a0163502a7f1dec5395c5cac1fc381dc1f79b052389ab0d5',
    attestor: params.attestorImage,
    next: 'x402-encode-payment-params',
    inputs: {
      url: `${params.facilitatorUrl}/facilitator/verify`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-krnl-internal': 'true', // Marks this as internal call to prevent circular workflow creation
      },
      body: {
        paymentPayload,
        paymentRequirements,
      },
      timeout: 30,
    },
    outputs: [
      {
        name: 'isValid',
        value: 'response.body.isValid',
        type: 'boolean',
        required: true,
        export: true,
      },
      {
        name: 'payer',
        value: 'response.body.payer',
        type: 'string',
        required: false,
        export: true,
      },
      {
        name: 'invalidReason',
        value: 'response.body.invalidReason',
        type: 'string',
        required: false,
        export: true,
      },
    ],
  };

  // Extract payment authorization from payload
  const payload = paymentPayload.payload as any;
  const authorization = payload.authorization;
  const signature = payload.signature;

  // Step 2: Encode PaymentParams struct for X402Target contract
  // Fields must be in alphabetical order: from, nonce, signature, to, validAfter, validBefore, value
  const encodePaymentParamsStep: WorkflowStep = {
    name: 'x402-encode-payment-params',
    image: 'ghcr.io/krnl-labs/executor-encoder-evm@sha256:b28823d12eb1b16cbcc34c751302cd2dbe7e35480a5bc20e4e7ad50a059b6611',
    attestor: params.attestorImage,
    next: 'prepare-authdata',
    config: {
      parameters: [
        {
          name: 'paymentParams',
          type: 'tuple',
          components: [
            { name: 'from', type: 'address' },
            { name: 'nonce', type: 'bytes32' },
            { name: 'signature', type: 'bytes' },
            { name: 'to', type: 'address' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'value', type: 'uint256' },
          ],
        },
      ],
    },
    inputs: {
      value: {
        paymentParams: {
          from: authorization.from,
          nonce: authorization.nonce,
          signature: signature,
          to: authorization.to,
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          value: authorization.value.toString(),
        },
      },
    },
    outputs: [
      {
        name: 'result',
        value: 'result',
        required: true,
        export: true,
      },
    ],
  };

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
  const sender = authorization.from;
  
  // Get contract nonce (uint256) - MATCHES SAMPLE FRONTEND PATTERN
  // Sample uses: const nonce = await getContractNonce(embeddedWallet);
  const contractNonce = await getContractNonce(
    targetContractAddress,
    sender,
    params.rpcUrl,
    config.chainId
  );
  
  // Generate deadline (1 hour from now)
  const intentDeadline = Math.floor(Date.now() / 1000) + 3600;
  
  // Generate deterministic intentId (matching frontend pattern)
  // Sample: keccak256(encodePacked(['address', 'uint256', 'uint256'], [address, nonce, deadline]))
  const intentId = keccak256(encodePacked(
    ['address', 'uint256', 'uint256'],
    [sender as `0x${string}`, contractNonce, BigInt(intentDeadline)]
  )) as `0x${string}`;
  
  console.log(`📝 Generated intent - ID: ${intentId}, sender: ${sender}, deadline: ${intentDeadline}`);
  
  // Sign the transaction intent
  let intentSignature: Hex = '0x';
  if (params.privateKey) {
    intentSignature = await signTransactionIntent(
      intentId,
      sender as Address,
      targetContractAddress as Address,
      params.delegateAddress as Address,
      BigInt(intentDeadline),
      params.privateKey as Hex,
      config.chainId
    );
    console.log(`✍️  Signed intent - signature: ${intentSignature.slice(0, 10)}...`);
  } else {
    console.warn(`⚠️  No private key provided - using empty signature`);
  }

  // Build the complete workflow DSL with actual values
  const workflow: WorkflowDSL = {
    chain_id: config.chainId,
    sender: sender,
    delegate: params.delegateAddress,
    attestor: params.attestorImage,
    target: {
      contract: targetContractAddress,
      function: 'executePayment((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))',
      authData_result: '${x402-encode-payment-params.result}',
      parameters: [],
    },
    sponsor_execution_fee: true,
    value: '0',
    intent: {
      id: intentId,
      signature: intentSignature, // ✅ Signed transaction intent
      deadline: intentDeadline.toString(),
    },
    rpc_url: params.rpcUrl,
    bundler_url: params.bundlerUrl || `https://api.pimlico.io/v2/${config.pimlicoSlug}/rpc?apikey=PLACEHOLDER`,
    paymaster_url: params.paymasterUrl || `https://api.pimlico.io/v2/${config.pimlicoSlug}/rpc?apikey=PLACEHOLDER`,
    gas_limit: '100000', // Match sample frontend gas settings
    max_fee_per_gas: '20000000000',
    max_priority_fee_per_gas: '2000000000',
    workflow: {
      name: 'x402-payment-settlement',
      version: 'v1.0.0',
      steps: [verifyStep, encodePaymentParamsStep],
    },
  };

  return workflow;
}

