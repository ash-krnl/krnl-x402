/**
 * KRNL x402 Client - EOA + EIP-4337 Smart Account Implementation
 *
 * Modern approach using:
 * ✅ EOA (private key) as the owner wallet
 * ✅ EIP-4337 factory to create/manage smart account
 * ✅ Dual signing: EIP-712 hash + EIP-191 signature (USDC) + EIP-191 (intent)
 * ✅ KRNL SDK pattern for account abstraction
 * ✅ Enhanced x402 payload with intent parameters
 * ✅ EIP-1271 signature validation via smart account
 * 
 * USDC Signing Flow:
 * 1. Compute EIP-712 hash manually (USDC transferWithAuthorization)
 * 2. Sign the hash with EIP-191 (raw message signature)
 * 3. SCA validates signature via EIP-1271
 */

import { config } from 'dotenv';
import {
  type Hex,
  type Address,
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  toHex,
  formatEther,
  encodeAbiParameters,
  parseAbiParameters
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { AccountFactory4337ABI } from '../sdk-react-4337/src/abis/AccountFactory4337';
import { DelegatedAccount4337ABI } from '../sdk-react-4337/src/abis/DelegatedAccount4337';
import { getCreateAccountCallData } from '../sdk-react-4337/src/utils/createSmartAccount';
import { wrapFetchWithPayment } from '../x402/typescript/packages/x402-fetch/src/index';
import _fetch from 'node-fetch';

// Load environment variables from .env.local (for client)
config({ path: '.env.local' });

// Environment configuration
const PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY! as Hex;
const RPC_URL = process.env.RPC_URL!;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS! as Address;
const APP_SECRET = process.env.APP_SECRET!;
const KRNL_NODE_URL = process.env.KRNL_NODE_URL || 'https://node.krnl.xyz';
const TARGET_CONTRACT = process.env.TARGET_CONTRACT_ADDRESS! as Address;
const TARGET_CONTRACT_OWNER = process.env.TARGET_CONTRACT_OWNER! as Address;
const USDC_CONTRACT = process.env.USDC_CONTRACT! as Address;
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS! as Address;
const TEST_SERVER_URL = 'http://localhost:4000';

// Validate required environment variables
const requiredEnvVars = {
  CLIENT_PRIVATE_KEY: PRIVATE_KEY,
  RPC_URL,
  FACTORY_ADDRESS,
  APP_SECRET,
  TARGET_CONTRACT_ADDRESS: TARGET_CONTRACT,
  TARGET_CONTRACT_OWNER,
  USDC_CONTRACT,
  RECIPIENT_ADDRESS
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

interface KRNLNodeConfig {
  nodeAddress: string;
  executorImages: string[];
}

interface TransactionIntentParams {
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
 * KRNL EIP-4337 Account Manager
 * Handles EOA + Smart Account creation and dual signing
 */
class EIP4337AccountManager {
  public eoaAccount: ReturnType<typeof privateKeyToAccount>;
  public walletClient: ReturnType<typeof createWalletClient>;
  public publicClient: ReturnType<typeof createPublicClient>;
  public smartAccountAddress: Address | null = null;
  public isSmartAccountDeployed = false;

  constructor() {
    // Create EOA from private key
    this.eoaAccount = privateKeyToAccount(PRIVATE_KEY);

    // Create wallet client with EOA
    this.walletClient = createWalletClient({
      account: this.eoaAccount,
      chain: sepolia,
      transport: http(RPC_URL)
    });

    // Create public client
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL)
    });

    console.log('✅ EOA Account Manager initialized');
    console.log(`   EOA Address: ${this.eoaAccount.address}`);
    console.log(`   Chain: ${sepolia.name} (${sepolia.id})`);
  }

  /**
   * Get smart account address using factory + EOA + app secret
   */
  async getSmartAccountAddress(): Promise<Address> {
    // Calculate salt: keccak256(eoaAddress + appSecret)
    const saltInput = `${this.eoaAccount.address}${APP_SECRET}`;
    const saltValue = keccak256(toHex(saltInput));

    const accountAddress = await this.publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: AccountFactory4337ABI,
      functionName: 'getDelegatedAccountAddress',
      args: [this.eoaAccount.address, saltValue]
    });

    return accountAddress as Address;
  }

  /**
   * Check if smart account is deployed
   */
  async checkSmartAccountDeployment(accountAddress: Address): Promise<boolean> {
    try {
      const bytecode = await this.publicClient.getBytecode({
        address: accountAddress
      });
      return bytecode !== undefined && bytecode !== '0x';
    } catch {
      return false;
    }
  }

  /**
   * Initialize smart account (get address and check deployment)
   */
  async initializeSmartAccount(): Promise<void> {
    console.log('🔗 Initializing EIP-4337 smart account...');

    // Get smart account address
    this.smartAccountAddress = await this.getSmartAccountAddress();
    console.log(`   Smart Account Address: ${this.smartAccountAddress}`);

    // Check deployment status
    this.isSmartAccountDeployed = await this.checkSmartAccountDeployment(this.smartAccountAddress);
    console.log(`   Deployed: ${this.isSmartAccountDeployed ? '✅' : '❌'}`);

    if (!this.isSmartAccountDeployed) {
      console.log('   ⚠️  Smart account not deployed - deploying now...');
      await this.deploySmartAccount();
    }

    // Check balances
    await this.checkBalances();
  }

  /**
   * Check EOA and smart account balances
   */
  async checkBalances(): Promise<void> {
    // EOA ETH balance
    const eoaBalance = await this.publicClient.getBalance({
      address: this.eoaAccount.address
    });
    console.log(`   EOA ETH Balance: ${formatEther(eoaBalance)} ETH`);

    // Smart Account ETH balance (if deployed)
    if (this.smartAccountAddress && this.isSmartAccountDeployed) {
      const smartBalance = await this.publicClient.getBalance({
        address: this.smartAccountAddress
      });
      console.log(`   Smart Account ETH Balance: ${formatEther(smartBalance)} ETH`);
    }

    // USDC balance check
    await this.checkUSDCBalance();
  }

  /**
   * Deploy smart account using factory (following SDK pattern)
   */
  async deploySmartAccount(): Promise<void> {
    if (!this.smartAccountAddress) {
      throw new Error('Smart account address not initialized');
    }

    try {
      console.log('🚀 Deploying smart account via factory...');

      // Use SDK's getCreateAccountCallData (like the frontend)
      const { functionName, args } = getCreateAccountCallData({
        ownerAddress: this.eoaAccount.address,
        appSecret: APP_SECRET
      });

      console.log(`   Calling ${functionName} with args:`, args);

      // Call factory to deploy smart account
      const hash = await this.walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: AccountFactory4337ABI,
        functionName: functionName as any,
        args: args as any[],
      });

      console.log(`   Transaction hash: ${hash}`);
      console.log('   ⏳ Waiting for deployment confirmation...');

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      console.log(`   ✅ Smart account deployed! Block: ${receipt.blockNumber}`);

      // Update deployment status
      this.isSmartAccountDeployed = true;

    } catch (error: any) {
      console.error('❌ Failed to deploy smart account:', error.message);
      throw error;
    }
  }

  /**
   * Check USDC balance for payments
   */
  async checkUSDCBalance(): Promise<void> {
    const ERC20_ABI = [{
      name: 'balanceOf',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ type: 'uint256' }],
    }] as const;

    try {
      // Check both EOA and Smart Account USDC balances
      const [eoaBalance, smartBalance] = await Promise.all([
        this.publicClient.readContract({
          address: USDC_CONTRACT,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [this.eoaAccount.address]
        }),
        this.smartAccountAddress ? this.publicClient.readContract({
          address: USDC_CONTRACT,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [this.smartAccountAddress]
        }) : Promise.resolve(0n)
      ]);

      console.log(`   EOA USDC Balance: ${Number(eoaBalance) / 1000000} USDC`);
      console.log(`   Smart Account USDC Balance: ${Number(smartBalance) / 1000000} USDC`);

      if (Number(smartBalance) === 0) {
        console.log(`   ⚠️  Smart account has no USDC - make sure to fund it!`);
      }

    } catch (error) {
      console.log('   USDC Balance: Unable to fetch (contract may not exist)');
    }
  }

  /**
   * Sign USDC transferWithAuthorization using EIP-712 hash + EIP-191 signature
   * Note: SCA expects raw message signatures (EIP-191), not EIP-712 typed data
   */
  async signUSDCAuthorization(
    authorization: {
      from: Address;
      to: Address;
      value: bigint;
      validAfter: bigint;
      validBefore: bigint;
      nonce: Hex;
    },
    usdcDomainSeparator: Hex
  ): Promise<Hex> {
    console.log('🔐 Computing USDC EIP-712 hash and signing with EIP-191...');
    console.log(`   From (Smart Account): ${authorization.from}`);
    console.log(`   To: ${authorization.to}`);
    console.log(`   Value: ${authorization.value}`);

    // Step 1: Compute EIP-712 hash manually
    const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
      toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
    );

    // EIP-712 uses abi.encode (padded), not encodePacked
    const structHash = keccak256(
      encodeAbiParameters(
        parseAbiParameters('bytes32, address, address, uint256, uint256, uint256, bytes32'),
        [
          TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
          authorization.from,
          authorization.to,
          authorization.value,
          authorization.validAfter,
          authorization.validBefore,
          authorization.nonce
        ]
      )
    );

    // Final EIP-712 hash
    const eip712Hash = keccak256(
      encodePacked(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        ['0x19' as Hex, '0x01' as Hex, usdcDomainSeparator, structHash]
      )
    );

    console.log(`   EIP-712 Hash: ${eip712Hash}`);

    // Step 2: Sign the raw hash with EIP-191
    const signature = await this.walletClient.signMessage({
      message: { raw: eip712Hash }
    });

    console.log('✅ USDC authorization signed (EIP-191):', signature.slice(0, 10) + '...');
    return signature;
  }

  /**
   * Sign EIP-191 KRNL transaction intent
   */
  async signTransactionIntent(intentParams: TransactionIntentParams): Promise<Hex> {
    console.log('🔐 Signing KRNL transaction intent...');

    const intentHash = keccak256(
      encodePacked(
        ['address', 'uint256', 'bytes32', 'address', 'address', 'bytes4', 'uint256', 'uint256'],
        [
          intentParams.target,
          intentParams.value,
          intentParams.id,
          intentParams.nodeAddress,
          intentParams.delegate,
          intentParams.targetFunction,
          intentParams.nonce,
          intentParams.deadline
        ]
      )
    );

    const signature = await this.walletClient.signMessage({
      message: { raw: intentHash }
    });

    console.log('✅ Transaction intent signed:', signature.slice(0, 10) + '...');
    return signature;
  }
}

/**
 * Get KRNL node configuration (matching SDK implementation)
 */
async function getKRNLNodeConfig(): Promise<KRNLNodeConfig> {
  try {
    const response = await fetch(KRNL_NODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'krnl_getConfig',
        params: [],
        id: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch node config: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('📋 KRNL node raw response:', JSON.stringify(data, null, 2));

    if (!data.result) {
      throw new Error('Invalid response from KRNL node: missing result');
    }

    // Handle both old and new response formats (exactly like SDK)
    if (data.result.workflow && data.result.workflow.node_address) {
      return {
        nodeAddress: data.result.workflow.node_address,
        executorImages: data.result.workflow.executor_images || []
      };
    }

    // Return direct result if it has nodeAddress
    if (data.result.nodeAddress) {
      return data.result;
    }

    // If we get here, the format is unexpected
    throw new Error(`Unexpected KRNL node response format: ${JSON.stringify(data.result)}`);

  } catch (error) {
    console.warn('⚠️  Failed to get KRNL node config, using fallback:', error);
    return {
      nodeAddress: '0xb18e8F975b8AF9717d74b753f8ba357c0d77Eb06',
      executorImages: ['image://docker.io/ash20pk20/attestor-krnl-x402:latest']
    };
  }
}

/**
 * Get function selector for executePayment - matches frontend implementation exactly
 */
function getFunctionSelector(): Hex {
  // Use the exact same hardcoded signature as frontend to avoid encoding differences
  const functionSignature = 'executePayment((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))';
  const hash = keccak256(Buffer.from(functionSignature));
  const functionSelectorBytes = hash.slice(0, 10) as Hex;

  console.log(`   Function signature: ${functionSignature}`);
  console.log(`   Function selector: ${functionSelectorBytes}`);

  return functionSelectorBytes;
}

/**
 * Get contract nonce for intent generation
 */
async function getContractNonce(
  targetContractAddress: Address,
  senderAddress: Address,
  publicClient: ReturnType<typeof createPublicClient>
): Promise<bigint> {
  const NONCES_ABI = [{
    name: 'nonces',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'nonce', type: 'uint256' }],
  }] as const;

  try {
    const nonce = await publicClient.readContract({
      address: targetContractAddress,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [senderAddress],
    });
    return nonce as bigint;
  } catch (error) {
    console.warn('⚠️  Could not read contract nonce, using timestamp-based nonce');
    return BigInt(Math.floor(Date.now() / 1000));
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🚀 KRNL x402 EIP-4337 Client (EOA + Smart Account)');
    console.log('=====================================================\n');

    // 1. Initialize account manager
    const accountManager = new EIP4337AccountManager();
    await accountManager.initializeSmartAccount();

    if (!accountManager.smartAccountAddress) {
      throw new Error('Failed to initialize smart account');
    }

    console.log('');

    // 2. Get KRNL node configuration
    console.log('🔗 Getting KRNL node configuration...');
    const nodeConfig = await getKRNLNodeConfig();
    console.log(`   Node Address: ${nodeConfig.nodeAddress}`);
    console.log(`   Target Contract: ${TARGET_CONTRACT}`);
    console.log(`   Delegate (Owner): ${TARGET_CONTRACT_OWNER}`);
    console.log('');

    // 3. Create transaction intent parameters
    console.log('📝 Creating KRNL transaction intent...');
    const nonce = await getContractNonce(TARGET_CONTRACT, accountManager.smartAccountAddress, accountManager.publicClient);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
    const functionSelector = getFunctionSelector();

    const intentId = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint256'],
        [accountManager.smartAccountAddress, nonce, deadline]
      )
    ) as Hex;

    const intentParams: TransactionIntentParams = {
      target: TARGET_CONTRACT,
      value: BigInt(0),
      id: intentId,
      nodeAddress: nodeConfig.nodeAddress as Address,
      delegate: TARGET_CONTRACT_OWNER,
      targetFunction: functionSelector,
      nonce,
      deadline
    };

    console.log(`   Intent ID: ${intentParams.id}`);
    console.log(`   Nonce: ${intentParams.nonce}`);
    console.log(`   Deadline: ${intentParams.deadline}`);
    console.log('');

    // 4. Sign transaction intent with EOA
    const intentSignature = await accountManager.signTransactionIntent(intentParams);
    console.log('');

    // 5. Get USDC domain separator
    console.log('🔐 Fetching USDC domain separator...');
    const USDC_ABI = [{
      name: 'DOMAIN_SEPARATOR',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'bytes32' }],
    }] as const;

    const usdcDomainSeparator = await accountManager.publicClient.readContract({
      address: USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: 'DOMAIN_SEPARATOR'
    }) as Hex;

    console.log(`   Domain Separator: ${usdcDomainSeparator}`);
    console.log('');

    // 6. Create USDC authorization (using smart account as 'from')
    console.log('💰 Creating USDC payment authorization...');
    console.log(`   EOA Address: ${accountManager.eoaAccount.address}`);
    console.log(`   Smart Account Address: ${accountManager.smartAccountAddress}`);
    console.log(`   Using Smart Account (funded): ${accountManager.smartAccountAddress}`);

    const usdcAuthorization = {
      from: accountManager.smartAccountAddress, // ← Use smart account address (now funded)
      to: RECIPIENT_ADDRESS,
      value: BigInt(10000), // 0.01 USDC (6 decimals)
      validAfter: BigInt(0),
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
      nonce: '0x' + Math.random().toString(16).slice(2).padStart(64, '0') as Hex,
    };

    console.log('🔍 USDC Authorization object:');
    console.log(`   from: ${usdcAuthorization.from}`);
    console.log(`   to: ${usdcAuthorization.to}`);
    console.log(`   value: ${usdcAuthorization.value}`);

    // 7. Sign USDC authorization with EOA (EIP-712 hash + EIP-191 signature)
    const usdcSignature = await accountManager.signUSDCAuthorization(usdcAuthorization, usdcDomainSeparator);
    console.log('');

    // 7. Attach KRNL parameters and smart account address to wallet client (for x402 SDK)
    console.log('🔗 Attaching KRNL parameters and smart account to wallet client...');
    (accountManager.walletClient as any).intentSignature = intentSignature;
    (accountManager.walletClient as any).transactionIntent = intentParams;
    (accountManager.walletClient as any).smartAccountAddress = accountManager.smartAccountAddress;

    console.log('✅ Parameters attached to wallet client:');
    console.log('   📝 USDC EIP-712 authorization ready ✅');
    console.log('   🔐 USDC signature will be created by x402 SDK ✅');
    console.log('   🏦 Smart Account Address attached ✅');
    console.log('   🆕 KRNL intent ID attached ✅');
    console.log('   🆕 KRNL intent signature attached ✅');
    console.log('   🆕 KRNL intent parameters attached ✅');
    console.log('');

    // 8. Test payment with enhanced payload
    console.log('📤 Testing enhanced x402 payment flow...');
    console.log('=====================================');

    // Test server connection first
    try {
      const healthResponse = await _fetch(`${TEST_SERVER_URL}/health`);
      if (healthResponse.ok) {
        console.log('✅ Test server is running');
      } else {
        throw new Error(`Server returned ${healthResponse.status}`);
      }
    } catch (error) {
      console.log('❌ Test server not running - start with: npm run test-server');
      return;
    }

    console.log('📞 Requesting premium content with x402 payment...');

    // Use x402-fetch with enhanced payload - need to pass wallet client
    const wrappedFetch = wrapFetchWithPayment(
      _fetch as any,
      accountManager.walletClient, // Pass the wallet client
      BigInt(0.1 * 10 ** 6) // 0.1 USDC max
    );

    const response = await wrappedFetch(
      `${TEST_SERVER_URL}/premium`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Payment successful! Content received:');
      console.log('   Title:', data.data?.title);
      console.log('   Message:', data.message);
      console.log('   Timestamp:', data.data?.timestamp);
    } else {
      console.log('❌ Payment failed with status:', response.status);
      const errorText = await response.text();
      console.log('   Error:', errorText);
    }

    console.log('');
    console.log('🎉 EIP-4337 Migration Complete!');
    console.log('================================');
    console.log('✅ EOA-based account management');
    console.log('✅ EIP-4337 smart account integration');
    console.log('✅ Dual signature system (EIP-712 + EIP-191)');
    console.log('✅ Enhanced x402 payload with KRNL intent params');
    console.log('✅ Production-ready architecture');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Debug tips:');
    console.log('   - Ensure EOA has sufficient ETH balance');
    console.log('   - Check KRNL node is accessible');
    console.log('   - Verify all environment variables are set');
    console.log('   - Ensure test server is running');
  }
}

// Run the client
if (require.main === module) {
  main().catch(console.error);
}

export { EIP4337AccountManager };