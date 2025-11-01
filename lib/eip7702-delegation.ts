import { createWalletClient, createPublicClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { eip7702Actions } from 'viem/experimental';

/**
 * EIP-7702 Delegation Helper
 * Automatically delegates an EOA to KRNL's Smart Contract Account
 */

interface DelegationConfig {
  privateKey: Hex;
  rpcUrl: string;
  krnlNodeUrl?: string;
  delegateAddress?: Address; // Optional: use from env instead of fetching
}

interface DelegationResult {
  success: boolean;
  alreadyDelegated?: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Check if an address is already delegated to KRNL
 * 
 * EIP-7702 sets code to: 0xef0100 || delegateAddress (20 bytes)
 * Example: 0xef0100bdba7f921f8c8aff014749fc17324e832291bfb0
 */
async function isDelegated(
  address: Address,
  rpcUrl: string,
  delegateAddress: Address
): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });

    // Get the account's code
    const code = await publicClient.getCode({ address });
    
    if (!code || code === '0x') {
      return false; // No code = not delegated
    }
    
    // Check for EIP-7702 delegation marker
    // Format: 0xef0100 (3 bytes) + delegateAddress (20 bytes) = 23 bytes total (46 hex chars + 0x)
    const EIP7702_PREFIX = '0xef0100';
    
    if (!code.toLowerCase().startsWith(EIP7702_PREFIX)) {
      return false; // Not an EIP-7702 delegation
    }
    
    // Extract the delegated contract address (skip 0xef0100)
    const delegatedTo = '0x' + code.slice(8); // Skip '0xef0100', keep remaining 20 bytes
    
    // Check if delegated to the expected KRNL contract
    const isDelegatedToKRNL = delegatedTo.toLowerCase() === delegateAddress.toLowerCase();
    
    if (isDelegatedToKRNL) {
      console.log(`   ✅ Account is delegated to: ${delegatedTo}`);
    } else {
      console.log(`   ⚠️  Account is delegated to: ${delegatedTo} (not KRNL)`);
    }
    
    return isDelegatedToKRNL;
  } catch (error) {
    console.error('Error checking delegation status:', error);
    return false;
  }
}

/**
 * Get KRNL node delegate address
 */
async function getKRNLDelegateAddress(krnlNodeUrl: string): Promise<Address | null> {
  try {
    const response = await fetch(krnlNodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'krnl_getNodeConfig',
        params: [],
        id: Date.now(),
      }),
    });

    const data: any = await response.json();
    return data.result?.workflow?.node_address || null;
  } catch (error) {
    console.error('Error getting KRNL delegate address:', error);
    return null;
  }
}

/**
 * Perform EIP-7702 delegation to KRNL
 */
async function delegateToKRNL(config: DelegationConfig): Promise<DelegationResult> {
  try {
    console.log('🔐 Starting EIP-7702 delegation process...');

    // Create account from private key
    const account = privateKeyToAccount(config.privateKey);
    console.log(`   Wallet: ${account.address}`);

    // Get KRNL delegate address from config or fetch from node
    let delegateAddress: Address | null = config.delegateAddress || null;
    
    if (!delegateAddress && config.krnlNodeUrl) {
      delegateAddress = await getKRNLDelegateAddress(config.krnlNodeUrl);
      if (!delegateAddress) {
        return {
          success: false,
          error: 'Failed to get KRNL delegate address from node',
        };
      }
      console.log(`   KRNL Delegate (from node): ${delegateAddress}`);
    } else if (delegateAddress) {
      console.log(`   KRNL Delegate (from env): ${delegateAddress}`);
    } else {
      return {
        success: false,
        error: 'No delegate address provided and no KRNL node URL to fetch from',
      };
    }

    // Check if already delegated
    const alreadyDelegated = await isDelegated(account.address, config.rpcUrl, delegateAddress);
    if (alreadyDelegated) {
      console.log('✅ Wallet is already delegated to KRNL');
      return {
        success: true,
        alreadyDelegated: true,
      };
    }

    console.log('📝 Wallet not delegated to KRNL');
    console.log('⚡ Performing automatic EIP-7702 delegation...');

    // Create wallet client with EIP-7702 support (experimental)
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(config.rpcUrl),
    }).extend(eip7702Actions) as any; // Type assertion for experimental EIP-7702 feature

    // Sign authorization for the delegate contract
    console.log(`   Signing authorization for delegate: ${delegateAddress}`);
    const authorization = await walletClient.signAuthorization({
      contractAddress: delegateAddress,
      executor: 'self', // ✅ Indicates self-execution, Viem handles nonce adjustment
    });

    console.log('   Authorization signed successfully');
    console.log(`   Sending delegation transaction...`);

    // Send EIP-7702 transaction to set code
    // The transaction sets the EOA's code to point to the delegate contract
    const hash = await walletClient.sendTransaction({
      authorizationList: [authorization],
      to: account.address, // Send to self to activate delegation
      value: 0n,
      data: '0x', // Empty data
    });

    console.log(`   Transaction sent: ${hash}`);
    console.log('   Waiting for confirmation...');

    // Wait for confirmation
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(config.rpcUrl),
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    if (receipt.status === 'success') {
      console.log('✅ Delegation successful!');
      console.log(`   Transaction: ${hash}`);
      return {
        success: true,
        alreadyDelegated: false,
        transactionHash: hash,
      };
    } else {
      console.error('❌ Delegation transaction failed');
      return {
        success: false,
        error: 'Delegation transaction reverted',
      };
    }
  } catch (error) {
    console.error('❌ Delegation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Ensure wallet is delegated to KRNL (checks first, delegates if needed)
 */
export async function ensureKRNLDelegation(config: DelegationConfig): Promise<DelegationResult> {
  console.log('\n🔍 Checking EIP-7702 delegation status...');
  
  const result = await delegateToKRNL(config);
  
  if (result.success) {
    if (result.alreadyDelegated) {
      console.log('✅ Wallet delegation verified\n');
    } else {
      console.log('✅ Wallet successfully delegated to KRNL\n');
    }
  } else {
    console.error('❌ Delegation failed:', result.error);
    console.error('⚠️  KRNL workflows will not work without delegation\n');
  }
  
  return result;
}
