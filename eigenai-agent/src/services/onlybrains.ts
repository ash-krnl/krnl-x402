import {
  type Hex,
  type Address,
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  encodePacked,
  toHex,
  encodeAbiParameters,
  parseAbiParameters
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import _fetch from 'node-fetch';
import * as X402FetchModule from '../../../x402/typescript/packages/x402-fetch/src/index';
import { OnlyBrainsResponse } from '../types/index.js';

// Resolve wrapFetchWithPayment across ESM/CJS interop and CommonJS compilation
const x402Exports = X402FetchModule as any;
console.log('🟣 [OnlyBrainsService] x402-fetch exports keys:', Object.keys(x402Exports));
const wrapFetchWithPayment =
  x402Exports.wrapFetchWithPayment ||
  (x402Exports.default && x402Exports.default.wrapFetchWithPayment);

// Inline copy of AccountFactory4337ABI to avoid ESM/CJS export issues
// Source: sdk-react-4337/src/abis/AccountFactory4337.ts
const AccountFactory4337ABI = [
  {
    type: 'constructor',
    inputs: [
      {
        name: '_entryPoint',
        type: 'address',
        internalType: 'contract IEntryPoint'
      }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'accountExists',
    inputs: [
      {
        name: 'accountAddress',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'bool',
        internalType: 'bool'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'createDelegatedAccount',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address'
      },
      {
        name: 'salt',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: 'account',
        type: 'address',
        internalType: 'contract DelegatedAccount4337'
      }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'createDelegatedAccountBatch',
    inputs: [
      {
        name: 'owners',
        type: 'address[]',
        internalType: 'address[]'
      },
      {
        name: 'salts',
        type: 'bytes32[]',
        internalType: 'bytes32[]'
      }
    ],
    outputs: [
      {
        name: 'accounts',
        type: 'address[]',
        internalType: 'contract DelegatedAccount4337[]'
      }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'entryPoint',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IEntryPoint'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'generateSalt',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address'
      }
    ],
    outputs: [
      {
        name: '',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getDelegatedAccountAddress',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        internalType: 'address'
      },
      {
        name: 'salt',
        type: 'bytes32',
        internalType: 'bytes32'
      }
    ],
    outputs: [
      {
        name: 'accountAddress',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getEntryPoint',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'address'
      }
    ],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'DelegatedAccountCreated',
    inputs: [
      {
        name: 'account',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address'
      },
      {
        name: 'salt',
        type: 'bytes32',
        indexed: false,
        internalType: 'bytes32'
      }
    ],
    anonymous: false
  },
  {
    type: 'error',
    name: 'Create2EmptyBytecode',
    inputs: []
  },
  {
    type: 'error',
    name: 'FailedDeployment',
    inputs: []
  },
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [
      {
        name: 'balance',
        type: 'uint256',
        internalType: 'uint256'
      },
      {
        name: 'needed',
        type: 'uint256',
        internalType: 'uint256'
      }
    ]
  }
] as const;

// Inline copy of getCreateAccountCallData to avoid import issues
// Source: sdk-react-4337/src/utils/createSmartAccount.ts
function getCreateAccountCallData(params: { ownerAddress: Address; appSecret: string }): {
  functionName: string;
  args: [Address, `0x${string}`];
  saltValue: `0x${string}`;
} {
  const saltInput = `${params.ownerAddress}${params.appSecret}`;
  const saltValue = keccak256(toHex(saltInput));

  return {
    functionName: 'createDelegatedAccount',
    args: [params.ownerAddress, saltValue],
    saltValue
  };
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
 * OnlyBrains Service - Handles x402 payments for premium AI training content
 * Follows the EIP-4337 smart account pattern from test/client-eoa-eip4337.ts
 */
export class OnlyBrainsService {
  public eoaAccount: ReturnType<typeof privateKeyToAccount>;
  public walletClient: ReturnType<typeof createWalletClient>;
  public publicClient: ReturnType<typeof createPublicClient>;
  public smartAccountAddress: Address | null = null;
  public isSmartAccountDeployed = false;

  constructor(
    private privateKey: Hex,
    private rpcUrl: string,
    private factoryAddress: Address,
    private appSecret: string,
    private serverUrl: string,
    private targetContract: Address,
    private targetContractOwner: Address,
    private usdcContract: Address,
    private recipientAddress: Address,
    private krnlNodeUrl: string
  ) {
    console.log('🟣 [OnlyBrainsService] Constructor called with:');
    console.log('  privateKey:', privateKey ? `${privateKey.slice(0, 10)}...` : 'undefined');
    console.log('  rpcUrl:', rpcUrl);
    console.log('  factoryAddress:', factoryAddress);
    console.log('  appSecret:', appSecret);
    console.log('  serverUrl:', serverUrl);
    console.log('  targetContract:', targetContract);
    console.log('  targetContractOwner:', targetContractOwner);
    console.log('  usdcContract:', usdcContract);
    console.log('  recipientAddress:', recipientAddress);
    console.log('  krnlNodeUrl:', krnlNodeUrl);

    try {
      // Create EOA from private key
      console.log('🟣 [OnlyBrainsService] Creating EOA from private key...');
      this.eoaAccount = privateKeyToAccount(this.privateKey);
      console.log('🟣 [OnlyBrainsService] EOA created:', this.eoaAccount.address);

      // Create wallet client with EOA
      console.log('🟣 [OnlyBrainsService] Creating wallet client...');
      this.walletClient = createWalletClient({
        account: this.eoaAccount,
        chain: sepolia,
        transport: http(this.rpcUrl)
      });
      console.log('🟣 [OnlyBrainsService] Wallet client created');

      // Create public client
      console.log('🟣 [OnlyBrainsService] Creating public client...');
      this.publicClient = createPublicClient({
        chain: sepolia,
        transport: http(this.rpcUrl)
      });
      console.log('🟣 [OnlyBrainsService] Public client created');
      console.log('🟣 [OnlyBrainsService] Constructor completed successfully');
    } catch (error) {
      console.error('🔴 [OnlyBrainsService] Constructor error:', error);
      throw error;
    }
  }

  /**
   * Get smart account address using factory + EOA + app secret
   */
  async getSmartAccountAddress(): Promise<Address> {
    console.log('🟣 [OnlyBrainsService] getSmartAccountAddress called');

    const saltInput = `${this.eoaAccount.address}${this.appSecret}`;
    console.log('🟣 [OnlyBrainsService] saltInput:', saltInput);

    const saltHex = toHex(saltInput);
    console.log('🟣 [OnlyBrainsService] saltHex:', saltHex);

    const saltValue = keccak256(saltHex);
    console.log('🟣 [OnlyBrainsService] saltValue:', saltValue);

    console.log('🟣 [OnlyBrainsService] factoryAddress:', this.factoryAddress);
    console.log('🟣 [OnlyBrainsService] ABI type:', typeof AccountFactory4337ABI);
    console.log(
      '🟣 [OnlyBrainsService] ABI isArray/length:',
      Array.isArray(AccountFactory4337ABI),
      Array.isArray(AccountFactory4337ABI) ? AccountFactory4337ABI.length : 'n/a'
    );
    if (Array.isArray(AccountFactory4337ABI)) {
      console.log('🟣 [OnlyBrainsService] ABI[0]:', AccountFactory4337ABI[0]);
    }

    try {
      const accountAddress = await this.publicClient.readContract({
        address: this.factoryAddress,
        abi: AccountFactory4337ABI as any,
        functionName: 'getDelegatedAccountAddress',
        args: [this.eoaAccount.address, saltValue]
      });

      console.log('🟣 [OnlyBrainsService] smart account address from factory:', accountAddress);
      return accountAddress as Address;
    } catch (error) {
      console.error('🔴 [OnlyBrainsService] readContract error in getSmartAccountAddress:', error);
      throw error;
    }
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
    this.smartAccountAddress = await this.getSmartAccountAddress();
    this.isSmartAccountDeployed = await this.checkSmartAccountDeployment(this.smartAccountAddress);

    if (!this.isSmartAccountDeployed) {
      await this.deploySmartAccount();
    }
  }

  /**
   * Deploy smart account using factory (following SDK pattern)
   */
  async deploySmartAccount(): Promise<void> {
    if (!this.smartAccountAddress) {
      throw new Error('Smart account address not initialized');
    }

    const { functionName, args } = getCreateAccountCallData({
      ownerAddress: this.eoaAccount.address,
      appSecret: this.appSecret
    });

    // Use any to bypass complex ABI type constraints from viem
    const hash = await (this.walletClient as any).writeContract({
      address: this.factoryAddress,
      abi: AccountFactory4337ABI,
      functionName: functionName,
      args: args,
    });

    await this.publicClient.waitForTransactionReceipt({ hash });
    this.isSmartAccountDeployed = true;
  }

  /**
   * Sign USDC transferWithAuthorization using EIP-712 hash + EIP-191 signature
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
    // Step 1: Compute EIP-712 hash manually
    const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
      toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
    );

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

    const eip712Hash = keccak256(
      encodePacked(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        ['0x19' as Hex, '0x01' as Hex, usdcDomainSeparator, structHash]
      )
    );

    // Step 2: Sign the raw hash with EIP-191
    const signature = await this.walletClient.signMessage({
      account: this.eoaAccount,
      message: { raw: eip712Hash }
    });

    return signature;
  }

  /**
   * Sign EIP-191 KRNL transaction intent
   */
  async signTransactionIntent(intentParams: TransactionIntentParams): Promise<Hex> {
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
      account: this.eoaAccount,
      message: { raw: intentHash }
    });

    return signature;
  }

  /**
   * Request OnlyBrains premium content with x402 payment
   * Returns pricing info for user approval before payment
   */
  async requestOnlyBrains(): Promise<{ price: string; endpoint: string }> {
    return {
      price: '$1.00',
      endpoint: `${this.serverUrl}/onlybrains`
    };
  }

  /**
   * Execute OnlyBrains payment and retrieve content
   * Follows exact pattern from client-eoa-eip4337.ts
   */
  async purchaseOnlyBrains(): Promise<OnlyBrainsResponse> {
    console.log('🔷 [OnlyBrains] Starting purchase flow...');
    
    // Initialize smart account if needed
    if (!this.smartAccountAddress) {
      console.log('🔷 [OnlyBrains] Initializing smart account...');
      await this.initializeSmartAccount();
    }

    // Assert smart account is initialized
    if (!this.smartAccountAddress) {
      throw new Error('Smart account initialization failed');
    }

    const smartAccountAddr = this.smartAccountAddress;
    console.log('🔷 [OnlyBrains] Smart account address:', smartAccountAddr);

    // 1. Get KRNL node configuration
    console.log('🔷 [OnlyBrains] Getting KRNL node config...');
    const nodeConfig = await this.getKRNLNodeConfig();
    console.log('🔷 [OnlyBrains] Node config:', nodeConfig);

    // 2. Create transaction intent parameters
    console.log('🔷 [OnlyBrains] Getting contract nonce...');
    const nonce = await this.getContractNonce(this.targetContract, smartAccountAddr);
    console.log('🔷 [OnlyBrains] Nonce:', nonce);
    
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour
    console.log('🔷 [OnlyBrains] Deadline:', deadline);
    
    console.log('🔷 [OnlyBrains] Getting function selector...');
    const functionSelector = this.getFunctionSelector();
    console.log('🔷 [OnlyBrains] Function selector:', functionSelector);

    console.log('🔷 [OnlyBrains] Creating intent ID...');
    const intentId = keccak256(
      encodePacked(
        ['address', 'uint256', 'uint256'],
        [smartAccountAddr, nonce, deadline]
      )
    ) as Hex;
    console.log('🔷 [OnlyBrains] Intent ID:', intentId);

    const intentParams: TransactionIntentParams = {
      target: this.targetContract,
      value: BigInt(0),
      id: intentId,
      nodeAddress: nodeConfig.nodeAddress as Address,
      delegate: this.targetContractOwner,
      targetFunction: functionSelector,
      nonce,
      deadline
    };
    console.log('🔷 [OnlyBrains] Intent params:', intentParams);

    // 3. Sign transaction intent with EOA
    console.log('🔷 [OnlyBrains] Signing transaction intent...');
    const intentSignature = await this.signTransactionIntent(intentParams);
    console.log('🔷 [OnlyBrains] Intent signature:', intentSignature);

    // 4. Get USDC domain separator
    console.log('🔷 [OnlyBrains] Getting USDC domain separator...');
    const USDC_ABI = [{
      name: 'DOMAIN_SEPARATOR',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'bytes32' }],
    }] as const;

    const usdcDomainSeparator = await this.publicClient.readContract({
      address: this.usdcContract,
      abi: USDC_ABI,
      functionName: 'DOMAIN_SEPARATOR'
    }) as Hex;
    console.log('🔷 [OnlyBrains] USDC domain separator:', usdcDomainSeparator);

    // 5. Create USDC authorization (using smart account as 'from')
    console.log('🔷 [OnlyBrains] Creating USDC authorization...');
    const usdcAuthorization = {
      from: smartAccountAddr,
      to: this.recipientAddress,
      value: BigInt(1000000), // 1.00 USDC (6 decimals)
      validAfter: BigInt(0),
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
      nonce: ('0x' + Math.random().toString(16).slice(2).padStart(64, '0')) as Hex,
    };
    console.log('🔷 [OnlyBrains] USDC authorization:', usdcAuthorization);

    // 6. Sign USDC authorization with EOA
    console.log('🔷 [OnlyBrains] Signing USDC authorization...');
    const usdcSignature = await this.signUSDCAuthorization(usdcAuthorization, usdcDomainSeparator);
    console.log('🔷 [OnlyBrains] USDC signature:', usdcSignature);

    // 7. Attach KRNL parameters and smart account address to wallet client
    console.log('🔷 [OnlyBrains] Attaching parameters to wallet client...');
    (this.walletClient as any).intentSignature = intentSignature;
    (this.walletClient as any).transactionIntent = intentParams;
    (this.walletClient as any).usdcSignature = usdcSignature;
    (this.walletClient as any).usdcAuthorization = usdcAuthorization;
    (this.walletClient as any).smartAccountAddress = smartAccountAddr;
    console.log('🔷 [OnlyBrains] Parameters attached');

    // 8. Use wrapFetchWithPayment - this handles the 402 flow automatically
    console.log('🔷 [OnlyBrains] Creating wrapped fetch...');
    const wrappedFetch = wrapFetchWithPayment(
      _fetch as any,
      this.walletClient,
      BigInt(1.1 * 10 ** 6) // 1.1 USDC max
    );
    console.log('🔷 [OnlyBrains] Wrapped fetch created');

    console.log('🔷 [OnlyBrains] Making payment request to:', `${this.serverUrl}/onlybrains`);
    const response = await wrappedFetch(
      `${this.serverUrl}/onlybrains`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        }
      }
    );
    console.log('🔷 [OnlyBrains] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Payment failed: ${response.status} - ${errorText}`);
    }

    return await response.json() as OnlyBrainsResponse;
  }

  /**
   * Get KRNL node configuration
   */
  private async getKRNLNodeConfig(): Promise<KRNLNodeConfig> {
    try {
      const response = await fetch(this.krnlNodeUrl, {
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
        throw new Error(`Failed to fetch node config: ${response.status}`);
      }

      const data = await response.json() as any;

      if (data.result?.workflow?.node_address) {
        return {
          nodeAddress: data.result.workflow.node_address,
          executorImages: data.result.workflow.executor_images || []
        };
      }

      if (data.result?.nodeAddress) {
        return data.result;
      }

      throw new Error('Unexpected KRNL node response format');
    } catch (error) {
      // Fallback
      return {
        nodeAddress: '0xb18e8F975b8AF9717d74b753f8ba357c0d77Eb06',
        executorImages: ['image://docker.io/ash20pk20/attestor-krnl-x402:latest']
      };
    }
  }

  /**
   * Get function selector for executePayment
   */
  private getFunctionSelector(): Hex {
    const functionSignature = 'executePayment((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))';
    const hash = keccak256(toHex(functionSignature));
    return hash.slice(0, 10) as Hex;
  }

  /**
   * Get contract nonce for intent generation
   */
  private async getContractNonce(
    targetContractAddress: Address,
    senderAddress: Address
  ): Promise<bigint> {
    const NONCES_ABI = [{
      name: 'nonces',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: 'nonce', type: 'uint256' }],
    }] as const;

    try {
      const nonce = await this.publicClient.readContract({
        address: targetContractAddress,
        abi: NONCES_ABI,
        functionName: 'nonces',
        args: [senderAddress],
      });
      return nonce as bigint;
    } catch (error) {
      return BigInt(Math.floor(Date.now() / 1000));
    }
  }

  getSmartAccount(): Address | null {
    return this.smartAccountAddress;
  }
}
