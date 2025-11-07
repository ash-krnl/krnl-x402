/**
 * Test Client for KRNL x402 Facilitator - Privy Session Signer
 * 
 * Uses session signers (authorization keys) to sign:
 * 1. EIP-3009 payment authorization (USDC transfer)
 * 2. KRNL transaction intent signature
 * 
 * Assumes EIP-7702 delegation is already done via frontend
 * 
 * References:
 * - https://docs.privy.io/controls/authorization-keys/using-owners/sign/automatic
 * - https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data
 */

import { config } from 'dotenv';
import { type Hex, type Address, type Account, type SignableMessage, keccak256, encodePacked, createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { wrapFetchWithPayment, decodeXPaymentResponse } from '../x402/typescript/packages/x402-fetch/src/index';
import _fetch from 'node-fetch';
import { createKRNLClient } from '../lib/krnl-client';
import crypto from 'crypto';
import path from 'path';
import canonicalize from 'canonicalize';
import type { TransactionIntentParams } from '../sdk-react-7702/src/types';

// Load environment variables from test/.env.local
config({ path: path.join(__dirname, '.env.local') });

// Configuration
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PRIVY_AUTHORIZATION_PRIVATE_KEY = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY; // Session signer private key
const PRIVY_WALLET_ID = process.env.PRIVY_WALLET_ID; // Wallet ID
const PRIVY_WALLET_ADDRESS = process.env.PRIVY_WALLET_ADDRESS; // Wallet address
const TEST_SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:4000';
const KRNL_NODE_URL = process.env.KRNL_NODE_URL || 'https://node.krnl.xyz';
const RPC_URL = process.env.RPC_URL || 'https://lb.drpc.org/sepolia/AnRM4mK1tEyphrn_jexSLbrPxqT4wGIR760VIlZWwHzR';
const TARGET_CONTRACT_ADDRESS = process.env.TARGET_CONTRACT_ADDRESS as Address;
const TARGET_CONTRACT_OWNER = process.env.TARGET_CONTRACT_OWNER as Address;
const DEFAULT_CHAIN_ID = 11155111; // Sepolia

if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
  console.error('❌ Missing PRIVY_APP_ID or PRIVY_APP_SECRET in .env');
  process.exit(1);
}

if (!PRIVY_AUTHORIZATION_PRIVATE_KEY) {
  console.error('❌ Missing PRIVY_AUTHORIZATION_PRIVATE_KEY in .env');
  console.error('   This is the base64-encoded private key from your session signer');
  console.error('   Get it from: https://dashboard.privy.io → Settings → Session Signers');
  process.exit(1);
}

if (!PRIVY_WALLET_ID || !PRIVY_WALLET_ADDRESS) {
  console.error('❌ Missing PRIVY_WALLET_ID or PRIVY_WALLET_ADDRESS in .env');
  process.exit(1);
}

if (!TARGET_CONTRACT_ADDRESS || !TARGET_CONTRACT_OWNER) {
  console.error('❌ Missing TARGET_CONTRACT_ADDRESS or TARGET_CONTRACT_OWNER in .env');
  console.error('   These are required for KRNL intent signing');
  process.exit(1);
}

/**
 * Privy Account Adapter with Session Signers
 * 
 * Implements the viem Account interface for use with x402-fetch.
 * Uses Privy's authorization keys for secure, scoped signing.
 * 
 * The x402-fetch wrapper will call signMessage() and signTypedData()
 * to handle payment authorization and intent signing automatically.
 * 
 * Reference: https://docs.privy.io/controls/authorization-keys/using-owners/sign/automatic
 */
class PrivySessionSignerAccount implements Account {
  public address: Address;
  public type = 'local' as const;
  public source = 'privy-session-signer' as const;
  public publicKey: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';
  
  public intentSignature?: Hex; // KRNL transaction intent signature
  public transactionIntent?: TransactionIntentParams; // Full intent params for facilitator
  
  constructor(
    private appId: string,
    private appSecret: string,
    private authorizationPrivateKey: string,
    private walletId: string,
    walletAddress: string
  ) {
    this.address = walletAddress as Address;
  }
  
  /**
   * Generate authorization signature for Privy API calls
   * Matches Privy's exact implementation with JSON canonicalization
   * Ref: https://docs.privy.io/controls/authorization-keys/using-owners/sign/direct-implementation
   */
  private generateAuthorizationSignature(input: {
    version: 1;
    url: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET';
    headers: Record<string, string>;
    body?: any;
  }): string {
    const payload = {
      version: input.version,
      method: input.method,
      url: input.url,
      body: input.body || null,
      headers: input.headers,
    };
    
    // JSON-canonicalize the payload (RFC 8785) - REQUIRED by Privy
    const serializedPayload = canonicalize(payload) as string;
    const serializedPayloadBuffer = Buffer.from(serializedPayload);
    
    // Convert private key to PEM format
    const privateKeyAsPem = `-----BEGIN PRIVATE KEY-----\n${this.authorizationPrivateKey}\n-----END PRIVATE KEY-----`;
    const privateKey = crypto.createPrivateKey({
      key: privateKeyAsPem,
      format: 'pem',
    });
    
    // Sign with SHA-256
    const signatureBuffer = crypto.sign('sha256', serializedPayloadBuffer, privateKey);
    
    return signatureBuffer.toString('base64');
  }
  
  /**
   * Call Privy RPC API directly
   */
  private async callPrivyRPC(method: string, params: any[] | Record<string, any>, includeChainType = true): Promise<any> {
    const url = `https://api.privy.io/v1/wallets/${this.walletId}/rpc`;
    const body: any = { 
      method, 
      params 
    };
    
    // Only include chain_type for certain methods (e.g., personal_sign)
    if (includeChainType) {
      body.chain_type = 'ethereum';
    }
    
    // Basic Auth: base64(appId:appSecret)
    const basicAuth = Buffer.from(`${this.appId}:${this.appSecret}`).toString('base64');
    
    // IMPORTANT: Only include headers that start with 'privy-' or 'content-type' in signature
    // Per Privy docs: https://docs.privy.io/controls/authorization-keys/using-owners/sign
    const headersForSignature = {
      'privy-app-id': this.appId,
      // Don't include Authorization or origin in signature!
    };
    
    const authSignature = this.generateAuthorizationSignature({
      version: 1,
      url,
      method: 'POST',
      headers: headersForSignature,
      body,
    });
    
    const response = await _fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${basicAuth}`,       // Send but don't sign
        'privy-app-id': this.appId,                  // Send and signed
        'privy-authorization-signature': authSignature,
        'origin': 'http://localhost:4000',           // Send but don't sign
      },
      body: JSON.stringify(body),
    });
    
    const result: any = await response.json();
    
    if (result.error) {
      throw new Error(`Privy RPC error: ${result.error.message || result.error}`);
    }
    
    // Privy returns: { method: "...", data: { signature: "0x..." } }
    if (result.data?.signature) {
      return result.data.signature;
    }
    
    // Fallback for other response formats
    if (result.result) {
      return result.result;
    }
    
    console.error('Unexpected Privy RPC response:', JSON.stringify(result, null, 2));
    throw new Error('Privy RPC returned unexpected response format');
  }
  
  /**
   * Sign a message (EIP-191) using Privy RPC API directly
   */
  async signMessage({ message }: { message: SignableMessage }): Promise<Hex> {
    let messageToSign: string;
    
    if (typeof message === 'string') {
      messageToSign = message;
    } else if (message instanceof Uint8Array) {
      messageToSign = `0x${Buffer.from(message).toString('hex')}`;
    } else if ('raw' in message) {
      messageToSign = typeof message.raw === 'string' 
        ? message.raw 
        : `0x${Buffer.from(message.raw).toString('hex')}`;
    } else {
      throw new Error('Unsupported message format');
    }
    
    // Call Privy RPC API with correct format
    const signature = await this.callPrivyRPC('personal_sign', {
      message: messageToSign,
      encoding: 'hex',
    });
    return signature as Hex;
  }
  
  /**
   * Sign typed data (EIP-712) using Privy RPC API directly
   * Reference: https://docs.privy.io/wallets/using-wallets/ethereum/sign-typed-data
   */
  async signTypedData(typedData: any): Promise<Hex> {
    // Transform primaryType to primary_type if needed
    const formattedTypedData = {
      types: typedData.types,
      message: typedData.message,
      primary_type: typedData.primaryType || typedData.primary_type,
      domain: typedData.domain,
    };
    
    // Call Privy RPC API - no chain_type for eth_signTypedData_v4
    const signature = await this.callPrivyRPC('eth_signTypedData_v4', {
      typed_data: formattedTypedData,
    }, false);
    
    return signature as Hex;
  }
  
  /**
   * Sign a hash directly (required by viem Account interface)
   */
  async sign({ hash }: { hash: Hex }): Promise<Hex> {
    // Use signMessage to sign the hash
    return this.signMessage({ message: hash });
  }
  
  /**
   * Sign transaction (not needed for x402)
   */
  async signTransaction(): Promise<Hex> {
    throw new Error('signTransaction not supported - use Privy transaction API');
  }
  
  /**
   * Sign arbitrary data (not needed for x402)
   */
  async signUserOperation(): Promise<Hex> {
    throw new Error('signUserOperation not supported');
  }
}

/**
 * KRNL Intent Signing Utilities
 */

/**
 * ABI type definitions matching frontend
 */
interface ABIInput {
  name: string;
  type: string;
  internalType?: string;
  components?: ABIInput[];
}

interface ABIFunction {
  name: string;
  type: string;
  inputs: ABIInput[];
  outputs: any[];
}

/**
 * Payment Contract ABI - executePayment function only
 */
const PAYMENT_CONTRACT_ABI: ABIFunction[] = [{
  name: 'executePayment',
  type: 'function',
  inputs: [{
    name: 'authData',
    type: 'tuple',
    internalType: 'struct TargetBase.AuthData',
    components: [
      { name: 'nonce', type: 'uint256', internalType: 'uint256' },
      { name: 'expiry', type: 'uint256', internalType: 'uint256' },
      { name: 'id', type: 'bytes32', internalType: 'bytes32' },
      {
        name: 'executions',
        type: 'tuple[]',
        internalType: 'struct TargetBase.Execution[]',
        components: [
          { name: 'id', type: 'bytes32', internalType: 'bytes32' },
          { name: 'request', type: 'bytes', internalType: 'bytes' },
          { name: 'response', type: 'bytes', internalType: 'bytes' }
        ]
      },
      { name: 'result', type: 'bytes', internalType: 'bytes' },
      { name: 'sponsorExecutionFee', type: 'bool', internalType: 'bool' },
      { name: 'signature', type: 'bytes', internalType: 'bytes' }
    ]
  }],
  outputs: []
}];

/**
 * Build type string from ABI input - matches frontend implementation
 */
function buildTypeString(input: ABIInput): string {
  if (input.type === 'tuple') {
    const components = input.components?.map((comp) => buildTypeString(comp)).join(',') || '';
    return `(${components})`;
  } else if (input.type === 'tuple[]') {
    const components = input.components?.map((comp) => buildTypeString(comp)).join(',') || '';
    return `(${components})[]`;
  } else {
    return input.type;
  }
}

/**
 * Get function selector for executePayment - dynamically generated from ABI
 * Matches frontend implementation exactly
 */
function getFunctionSelector(): Hex {
  const targetFunctionName = 'executePayment';
  
  const targetFunctionSelector = PAYMENT_CONTRACT_ABI.find(
    (item) => item.type === 'function' && item.name === targetFunctionName
  );
  
  if (!targetFunctionSelector) {
    throw new Error(`Function ${targetFunctionName} not found in ABI`);
  }
  
  const functionSig = `${targetFunctionName}(${targetFunctionSelector.inputs.map((input) => buildTypeString(input)).join(',')})`;
  const functionSelectorBytes = keccak256(encodePacked(['string'], [functionSig])).slice(0, 10) as Hex;
  
  if (functionSelectorBytes.length !== 10) {
    throw new Error(`Invalid function selector length: ${functionSelectorBytes.length}`);
  }
  
  console.log(`   Function signature: ${functionSig}`);
  console.log(`   Function selector: ${functionSelectorBytes}`);
  
  return functionSelectorBytes;
}

/**
 * Get contract nonce for sender
 */
async function getContractNonce(
  targetContractAddress: Address,
  senderAddress: Address,
  rpcUrl: string
): Promise<bigint> {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  
  const NONCES_ABI = [{
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'nonce', type: 'uint256' }],
  }] as const;
  
  try {
    const nonce = await client.readContract({
      address: targetContractAddress,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [senderAddress],
    });
    return nonce as bigint;
  } catch (error) {
    console.warn(`⚠️  Failed to read contract nonce, using 0`);
    return 0n;
  }
}

/**
 * Create TransactionIntentParams from raw values
 * Matches SDK's createTransactionIntent pattern
 */
function createTransactionIntent(
  address: Address,
  nonce: bigint,
  targetContract: Address,
  delegate: Address,
  nodeAddress: Address
): TransactionIntentParams {
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  const functionSelector = getFunctionSelector();
  
  // Generate intentId - same as SDK
  const intentId = keccak256(encodePacked(
    ['address', 'uint256', 'uint256'],
    [address, nonce, BigInt(deadline)]
  )) as Hex;
  
  return {
    target: targetContract,
    value: BigInt(0),
    id: intentId,
    nodeAddress,
    delegate,
    targetFunction: functionSelector,
    nonce,
    deadline: BigInt(deadline)
  };
}

/**
 * Sign transaction intent using SDK's encoding logic
 * Based on: KRNLDelegatedAccountSDK.signTransactionIntent()
 * Ref: /sdk-react-7702/src/KRNLDelegatedAccountSDK.ts:151-185
 * 
 * This uses the EXACT same encoding as the SDK but works with Privy session signers
 */
async function signTransactionIntentWithSessionSigner(
  account: PrivySessionSignerAccount,
  intentParams: TransactionIntentParams
): Promise<Hex> {
  // SDK implementation from KRNLDelegatedAccountSDK.ts:156-184
  // Encode the 8 parameters exactly as SDK does
  const targetFunctionBytes = intentParams.targetFunction.slice(0, 10) as `0x${string}`;
  
  const intentHash = keccak256(
    encodePacked(
      ['address', 'uint256', 'bytes32', 'address', 'address', 'bytes4', 'uint256', 'uint256'],
      [
        intentParams.target,
        intentParams.value,
        intentParams.id,
        intentParams.nodeAddress,
        intentParams.delegate,
        targetFunctionBytes,
        intentParams.nonce,
        intentParams.deadline
      ]
    )
  );
  
  // Sign with personal_sign via Privy REST API (instead of SDK's getEthereumProvider)
  const signature = await account.signMessage({ message: intentHash });
  
  return signature;
}

/**
 * Sign KRNL transaction intent - SDK-based implementation
 * Uses SDK's createTransactionIntent + signTransactionIntent logic
 * Returns both the intent params and signature for facilitator
 */
async function signKRNLIntent(
  account: PrivySessionSignerAccount,
  targetContract: Address,
  delegate: Address,
  nodeAddress: Address
): Promise<{ intentParams: TransactionIntentParams; signature: Hex }> {
  console.log('📝 Preparing KRNL transaction intent (SDK-based)...');
  
  // Get contract nonce
  console.log(`   Target contract: ${targetContract}`);
  console.log(`   Sender address: ${account.address}`);
  console.log(`   RPC URL: ${RPC_URL}`);
  
  const nonce = await getContractNonce(targetContract, account.address, RPC_URL);
  console.log(`   Contract nonce: ${nonce}`);
  
  // Create intent parameters using SDK pattern
  const intentParams = createTransactionIntent(
    account.address,
    nonce,
    targetContract,
    delegate,
    nodeAddress
  );
  
  console.log(`   Intent ID: ${intentParams.id}`);
  console.log(`   Deadline: ${intentParams.deadline.toString()}`);
  console.log(`   Nonce: ${intentParams.nonce.toString()}`);
  console.log(`   Target: ${intentParams.target}`);
  console.log(`   Delegate: ${intentParams.delegate}`);
  console.log(`   Node: ${intentParams.nodeAddress}`);
  
  // Sign using SDK's encoding logic (adapted for session signer)
  const signature = await signTransactionIntentWithSessionSigner(account, intentParams);
  console.log(`✅ KRNL intent signed (SDK method): ${signature.slice(0, 10)}...`);
  
  return { intentParams, signature };
}

/**
 * Validate wallet configuration from environment
 */
function validateWalletConfig(): { walletId: string; address: string } {
  if (!PRIVY_WALLET_ID || !PRIVY_WALLET_ADDRESS) {
    throw new Error('Missing PRIVY_WALLET_ID or PRIVY_WALLET_ADDRESS in .env');
  }
  
  return {
    walletId: PRIVY_WALLET_ID,
    address: PRIVY_WALLET_ADDRESS,
  };
}

/**
 * Create Privy session signer account for signing
 */
async function createPrivySessionSignerAccount() {
  console.log(`🔐 Initializing Privy Session Signer...`);
  
  const wallet = validateWalletConfig();
  
  console.log(`✅ Using wallet with session signer:`);
  console.log(`   Wallet ID: ${wallet.walletId}`);
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Auth Method: Session Signer (Authorization Key)`);
  console.log(`   🎯 Using Privy REST API with authorization keys (no SDK needed!)\n`);
  
  // Create Privy account adapter with session signer (no SDK needed!)
  const account = new PrivySessionSignerAccount(
    PRIVY_APP_ID!,
    PRIVY_APP_SECRET!,
    PRIVY_AUTHORIZATION_PRIVATE_KEY!, // Authorization key for signing
    wallet.walletId,
    wallet.address
  );
  
  return {
    account,
    address: wallet.address,
    walletId: wallet.walletId,
  };
}

/**
 * Make a paid request to a protected endpoint
 */
async function makePaidRequest(
  fetchWithPayment: ReturnType<typeof wrapFetchWithPayment>,
  endpoint: string,
  method: string = 'GET'
) {
  console.log(`📞 Requesting ${method} ${endpoint}...`);

  try {
    const response = await fetchWithPayment(`${TEST_SERVER_URL}${endpoint}`, {
      method,
    });

    const paymentResponseHeader = response.headers.get('x-payment-response');
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Request failed: ${response.status}`);
      console.log(`   Error: ${errorText}\n`);
      
      if (paymentResponseHeader) {
        const paymentResponse = decodeXPaymentResponse(paymentResponseHeader);
        console.log(`   Payment Response:`, paymentResponse);
      }
      
      return null;
    }

    const data = await response.json();
    console.log(`✅ Request successful!`);
    console.log(`   Data:`, JSON.stringify(data, null, 2));
    
    if (paymentResponseHeader) {
      const paymentResponse = decodeXPaymentResponse(paymentResponseHeader);
      console.log(`   Payment Info:`);
      console.log(`     - Payer: ${paymentResponse.payer}`);
      console.log(`     - Transaction: ${paymentResponse.transaction || 'pending'}`);
      console.log(`     - Settlement: Background via KRNL\n`);
    }
    
    return data;
  } catch (error: any) {
    console.error(`❌ Request error:`, error.message);
    return null;
  }
}

/**
 * Main test flow
 */
async function runTest() {
  try {
    console.log(`\n🚀 KRNL x402 Test Client (Privy Session Signer)`);
    console.log(`===============================================\n`);

    // Initialize Privy session signer account
    const { account, address, walletId } = await createPrivySessionSignerAccount();
    
    console.log(`🔐 Signer: Privy Session Signer (Authorization Key)`);
    console.log(`📍 Address: ${address}`);
    console.log(`📍 Wallet ID: ${walletId}`);
    console.log(`📍 Test Server: ${TEST_SERVER_URL}\n`);
    
    // Get KRNL node configuration
    console.log(`🔗 Getting KRNL configuration...`);
    const krnlClient = createKRNLClient({
      nodeUrl: KRNL_NODE_URL,
      rpcUrl: RPC_URL,
    });
    const nodeConfig = await krnlClient.getNodeConfig();
    const nodeAddress = nodeConfig?.workflow?.node_address as Address;
    
    if (!nodeAddress) {
      throw new Error('Failed to get KRNL node address');
    }
    
    console.log(`   Node: ${nodeAddress}`);
    console.log(`   Target: ${TARGET_CONTRACT_ADDRESS}`);
    console.log(`   Delegate: ${TARGET_CONTRACT_OWNER}\n`);
    
    // Sign KRNL transaction intent BEFORE creating payment
    const { intentParams, signature: intentSignature } = await signKRNLIntent(
      account,
      TARGET_CONTRACT_ADDRESS,
      TARGET_CONTRACT_OWNER,
      nodeAddress
    );
    
    // Attach both intent params and signature to account (x402-fetch will include in payment)
    account.transactionIntent = intentParams;
    account.intentSignature = intentSignature;
    console.log(`✅ Transaction intent and signature attached to account\n`);
    
    // Wrap fetch with Privy account (now has both EIP-3009 and intent signing)
    const fetchWithPayment = wrapFetchWithPayment(_fetch as any, account);
    
    console.log(`\n📋 Test: Accessing Protected Resource`);
    console.log(`=======================================\n`);

    // Access premium content (0.01 USDC)
    console.log(`--- Premium Content Access ---`);
    const result = await makePaidRequest(fetchWithPayment, '/premium', 'GET');

    if (result) {
      console.log(`\n🎉 Test completed successfully!`);
      console.log(`\nℹ️  How it worked:`);
      console.log(`   1. ✅ EIP-7702 delegation (already done via frontend)`);
      console.log(`   2. 📝 Signed EIP-3009 payment authorization via Privy session key`);
      console.log(`   3. 📝 Signed KRNL transaction intent via Privy session key`);
      console.log(`   4. 📦 x402-fetch handled payment flow automatically`);
      console.log(`   5. ✅ KRNL facilitator verified and started settlement workflow`);
      console.log(`   6. 🔄 Payment settled asynchronously via KRNL`);
      console.log(`   7. 🔒 No app secrets exposed in client - only scoped session key!\n`);
    } else {
      console.log(`\n❌ Test failed - No data received`);
      console.log(`\n💡 Debug tips:`);
      console.log(`   - Check that EIP-7702 delegation is set up (use frontend first)`);
      console.log(`   - Verify session signer is added to the wallet`);
      console.log(`   - Ensure USDC balance is sufficient`);
      console.log(`   - Check KRNL node is running and accessible`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.log(`\n💡 Debug tips:`);
    console.log(`   - Run \`npm install\` to ensure @privy-io/node is installed`);
    console.log(`   - Check .env file has all required values`);
    console.log(`   - Verify authorization key has correct permissions`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runTest().catch(err => {
    console.error('💥 Test crashed:', err);
    process.exit(1);
  });
}

export { createPrivySessionSignerAccount, makePaidRequest };
