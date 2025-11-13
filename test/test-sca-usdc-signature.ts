/**
 * Test USDC transferWithAuthorization using EIP-4337 Smart Contract Account
 *
 * This script tests EIP-3009 USDC transfer using an EIP-4337 smart account
 * where the EOA owner signs on behalf of the SCA
 * 
 * EIP-1271 Signature Validation Flow:
 * 1. Manually compute EIP-712 hash for USDC transferWithAuthorization
 * 2. EOA signs the hash with EIP-191 (raw message signature)
 *    - Note: SCA expects raw signatures, not EIP-712 typed data signatures
 * 3. transferWithAuthorization is called with SCA as 'from' address
 * 4. USDC contract detects 'from' is a contract, calls SCA.isValidSignature(hash, signature)
 * 5. SCA validates that the signature came from its owner (EOA)
 * 6. If valid, USDC transfer proceeds
 */

import { config } from 'dotenv';
import {
  type Hex,
  type Address,
  createWalletClient,
  createPublicClient,
  http,
  keccak256,
  toHex,
  formatUnits,
  parseUnits,
  encodePacked,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { AccountFactory4337ABI } from '../sdk-react-4337/src/abis/AccountFactory4337';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Environment configuration
const PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY! as Hex;
const RPC_URL = process.env.RPC_URL!;
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS! as Address;
const APP_SECRET = process.env.APP_SECRET!;
const USDC_CONTRACT = process.env.USDC_CONTRACT! as Address;
const TO_ADDRESS = process.env.RECIPIENT_ADDRESS! as Address;

// Validate required environment variables
if (!PRIVATE_KEY || !RPC_URL || !FACTORY_ADDRESS || !APP_SECRET || !USDC_CONTRACT || !TO_ADDRESS) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// USDC Contract ABI (EIP-3009)
const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'DOMAIN_SEPARATOR',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    name: 'TRANSFER_WITH_AUTHORIZATION_TYPEHASH',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    name: 'authorizationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'authorizer', type: 'address' },
      { name: 'nonce', type: 'bytes32' }
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'signature', type: 'bytes' }
    ],
    outputs: [],
  },
] as const;

async function getSmartAccountAddress(
  publicClient: ReturnType<typeof createPublicClient>,
  eoaAddress: Address
): Promise<Address> {
  const saltInput = `${eoaAddress}${APP_SECRET}`;
  const saltValue = keccak256(toHex(saltInput));

  const accountAddress = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: AccountFactory4337ABI,
    functionName: 'getDelegatedAccountAddress',
    args: [eoaAddress, saltValue]
  });

  return accountAddress as Address;
}

async function checkSmartAccountDeployment(
  publicClient: ReturnType<typeof createPublicClient>,
  accountAddress: Address
): Promise<boolean> {
  try {
    const bytecode = await publicClient.getBytecode({
      address: accountAddress
    });
    return bytecode !== undefined && bytecode !== '0x';
  } catch {
    return false;
  }
}

function generateNonce(): Hex {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex;
}

async function testUSDCWithSmartAccount() {
  console.log('🧪 Testing USDC transferWithAuthorization with EIP-4337 Smart Account');
  console.log('='.repeat(70));

  const eoaAccount = privateKeyToAccount(PRIVATE_KEY);
  console.log(`\n👤 EOA Account: ${eoaAccount.address}`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(RPC_URL)
  });

  const walletClient = createWalletClient({
    account: eoaAccount,
    chain: sepolia,
    transport: http(RPC_URL)
  });

  console.log('\n🔍 Getting Smart Account address...');
  const smartAccountAddress = await getSmartAccountAddress(publicClient, eoaAccount.address);
  console.log(`   Smart Account: ${smartAccountAddress}`);

  const isDeployed = await checkSmartAccountDeployment(publicClient, smartAccountAddress);
  console.log(`   Deployed: ${isDeployed ? '✅' : '❌'}`);

  if (!isDeployed) {
    console.log('\n❌ Smart account not deployed. Please deploy it first.');
    return;
  }

  // Check if SCA supports EIP-1271
  console.log('\n🔍 Checking EIP-1271 support...');
  try {
    const supportsInterface = await publicClient.readContract({
      address: smartAccountAddress,
      abi: [{
        name: 'supportsInterface',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'interfaceId', type: 'bytes4' }],
        outputs: [{ type: 'bool' }]
      }] as const,
      functionName: 'supportsInterface',
      args: ['0x1626ba7e'] // EIP-1271 interface ID
    });
    console.log(`   EIP-1271 Supported: ${supportsInterface ? '✅' : '⚠️  Unknown'}`);
  } catch {
    console.log(`   EIP-1271 Support: ⚠️  Cannot verify (will attempt anyway)`);
  }

  console.log('\n💰 Checking USDC balances...');
  const smartAccountBalance = await publicClient.readContract({
    address: USDC_CONTRACT,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [smartAccountAddress]
  }) as bigint;

  console.log(`   Smart Account USDC: ${formatUnits(smartAccountBalance, 6)} USDC`);

  if (smartAccountBalance === 0n) {
    console.log('\n❌ No USDC balance in smart account. Please fund it first.');
    return;
  }

  console.log('\n🔐 Fetching USDC EIP-712 parameters...');
  const [domainSeparator, typeHash] = await Promise.all([
    publicClient.readContract({
      address: USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: 'DOMAIN_SEPARATOR'
    }),
    publicClient.readContract({
      address: USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: 'TRANSFER_WITH_AUTHORIZATION_TYPEHASH'
    })
  ]);

  console.log(`   Domain Separator: ${domainSeparator}`);
  console.log(`   Type Hash: ${typeHash}`);

  const currentTime = Math.floor(Date.now() / 1000);
  const transferAmount = parseUnits('0.01', 6);
  const nonce = generateNonce();

  const authorization = {
    from: smartAccountAddress, // ← SCA is the USDC holder
    to: TO_ADDRESS,
    value: transferAmount,
    validAfter: BigInt(currentTime - 3600),
    validBefore: BigInt(currentTime + 3600),
    nonce: nonce,
  };

  console.log('\n📝 Authorization Details:');
  console.log(`   From (Smart Account): ${authorization.from}`);
  console.log(`   To: ${authorization.to}`);
  console.log(`   Value: ${formatUnits(authorization.value, 6)} USDC`);
  console.log(`   Valid After: ${authorization.validAfter}`);
  console.log(`   Valid Before: ${authorization.validBefore}`);
  console.log(`   Nonce: ${authorization.nonce}`);

  const nonceUsed = await publicClient.readContract({
    address: USDC_CONTRACT,
    abi: USDC_ABI,
    functionName: 'authorizationState',
    args: [authorization.from, authorization.nonce]
  }) as boolean;

  console.log(`   Nonce Used: ${nonceUsed ? '❌ (will regenerate)' : '✅'}`);

  if (nonceUsed) {
    console.log('⚠️  Nonce already used, generating new one...');
    authorization.nonce = generateNonce();
  }

  console.log('\n✍️  Computing EIP-712 hash and signing with EIP-191...');
  console.log('   Note: SCA expects raw message signatures (EIP-191), not EIP-712 typed data');
  console.log('   EIP-1271: SCA will validate that signature came from its owner');

  try {
    // Step 1: Manually compute EIP-712 hash
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

    const eip712Hash = keccak256(
      encodePacked(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        ['0x19' as Hex, '0x01' as Hex, domainSeparator as Hex, structHash]
      )
    );

    console.log(`   EIP-712 Hash: ${eip712Hash}`);

    // Step 2: Sign the raw hash with EIP-191
    const signature = await walletClient.signMessage({
      message: { raw: eip712Hash }
    });

    console.log(`✅ Signature created: ${signature.slice(0, 20)}...`);
    console.log('   This is an EOA signature, but will be validated by SCA via EIP-1271');

    console.log('\n🚀 Executing USDC transferWithAuthorization...');
    console.log('   USDC will call: smartAccount.isValidSignature(hash, signature)');
    console.log('   Smart account will verify: signature was made by owner (EOA)');

    const hash = await walletClient.writeContract({
      address: USDC_CONTRACT,
      abi: USDC_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        authorization.from,
        authorization.to,
        authorization.value,
        authorization.validAfter,
        authorization.validBefore,
        authorization.nonce,
        signature
      ]
    });

    console.log(`   Transaction Hash: ${hash}`);
    console.log('   ⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   ✅ Transaction confirmed! Block: ${receipt.blockNumber}`);

    console.log('\n💰 Checking updated balances...');
    const [newSmartBalance, recipientBalance] = await Promise.all([
      publicClient.readContract({
        address: USDC_CONTRACT,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [smartAccountAddress]
      }) as Promise<bigint>,
      publicClient.readContract({
        address: USDC_CONTRACT,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [TO_ADDRESS]
      }) as Promise<bigint>
    ]);

    console.log(`   Smart Account: ${formatUnits(newSmartBalance, 6)} USDC`);
    console.log(`   Recipient: ${formatUnits(recipientBalance, 6)} USDC`);

    console.log('\n🎉 SUCCESS! EIP-3009 transferWithAuthorization completed!');
    console.log('='.repeat(70));
    console.log('✅ EOA signed EIP-712 hash with EIP-191 (raw message)');
    console.log('✅ SCA validated signature via EIP-1271');
    console.log('✅ USDC transferred from SCA to recipient');
    console.log('✅ EIP-712 hash + EIP-191 signature + EIP-1271 validation working!');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('invalid signature')) {
      console.log('🔍 Signature validation failed');
    }
  }
}

async function main() {
  try {
    await testUSDCWithSmartAccount();
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
