import { createPublicClient, http, type Address, type Chain, getAddress, keccak256, encodeAbiParameters, parseAbiParameters, encodePacked, toHex } from 'viem';
import { sepolia, baseSepolia, optimismSepolia, arbitrumSepolia, polygonAmoy } from 'viem/chains';
import type { PaymentPayload, PaymentRequirements, VerifyResponse } from '../../x402/typescript/packages/x402/src/types/index';

/**
 * Custom verify implementation for KRNL workflows
 * 
 * This implements the x402 SDK verify logic but with support for testnet networks.
 * Primary testnet: Base Sepolia
 */

// Network to chain mapping with extended support
const NETWORK_CONFIG: Record<string, {
  chain: Chain;
  chainId: number;
  usdcAddress: string;
  usdcName: string;
  usdcVersion: string;
}> = {
  'ethereum-sepolia': {
    chain: sepolia,
    chainId: 11155111,
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC on Ethereum Sepolia
    usdcName: 'USDC',
    usdcVersion: '2',
  },
  'base-sepolia': {
    chain: baseSepolia,
    chainId: 84532,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
    usdcName: 'USDC',
    usdcVersion: '2',
  },
  'optimism-sepolia': {
    chain: optimismSepolia,
    chainId: 11155420,
    usdcAddress: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', // USDC on Optimism Sepolia
    usdcName: 'USD Coin',
    usdcVersion: '2',
  },
  'arbitrum-sepolia': {
    chain: arbitrumSepolia,
    chainId: 421614,
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', // USDC on Arbitrum Sepolia
    usdcName: 'USD Coin',
    usdcVersion: '2',
  },
  'polygon-amoy': {
    chain: polygonAmoy,
    chainId: 80002,
    usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', // USDC on Polygon Amoy
    usdcName: 'USDC',
    usdcVersion: '2',
  },
};

// EIP-712 types for USDC transferWithAuthorization
const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

// ERC20 ABI for balanceOf
const ERC20_BALANCE_ABI = [{
  name: 'balanceOf',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: 'balance', type: 'uint256' }],
}] as const;

// EIP-1271 ABI for smart contract signature validation
const EIP1271_ABI = [{
  name: 'isValidSignature',
  type: 'function',
  stateMutability: 'view',
  inputs: [
    { name: 'hash', type: 'bytes32' },
    { name: 'signature', type: 'bytes' }
  ],
  outputs: [{ name: 'magicValue', type: 'bytes4' }],
}] as const;

const EIP1271_MAGIC_VALUE = '0x1626ba7e';

/**
 * Verify payment for KRNL workflows with extended network support
 */
export async function verifyPaymentForKRNL(
  paymentPayload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
  rpcUrl?: string,
): Promise<VerifyResponse> {
  try {
    // Extract authorization from payload
    const authorization = (paymentPayload.payload as any).authorization;
    const signature = (paymentPayload.payload as any).signature;

    // 1. Verify scheme
    if (paymentPayload.scheme !== 'exact' || paymentRequirements.scheme !== 'exact') {
      return {
        isValid: false,
        invalidReason: 'unsupported_scheme',
        payer: authorization.from,
      };
    }

    // 2. Get network configuration
    const networkKey = paymentRequirements.network.toLowerCase();
    const networkConfig = NETWORK_CONFIG[networkKey];

    if (!networkConfig) {
      console.error(`❌ Unsupported network: ${paymentRequirements.network}`);
      return {
        isValid: false,
        invalidReason: 'invalid_network',
        payer: authorization.from,
      };
    }

    console.log(`🔍 Verifying payment on ${networkConfig.chain.name} (${networkKey})`);

    // 3. Create public client
    const client = createPublicClient({
      chain: networkConfig.chain,
      transport: http(rpcUrl || process.env.RPC_URL),
    });

    // 4. Verify EIP-712 signature (supports both EOA and smart contract wallets via EIP-1271)
    const domain = {
      name: paymentRequirements.extra?.name || networkConfig.usdcName,
      version: paymentRequirements.extra?.version || networkConfig.usdcVersion,
      chainId: networkConfig.chainId,
      verifyingContract: paymentRequirements.asset as Address,
    };

    const message = {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    };

    console.log('[VERIFY] Domain:', JSON.stringify(domain, null, 2));
    console.log('[VERIFY] Message:', JSON.stringify(message, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value, 2
    ));
    console.log('[VERIFY] Signature:', signature);
    console.log('[VERIFY] Signer address:', authorization.from);
    console.log('[VERIFY] Payment requirements extra:', paymentRequirements.extra);

    // Manually compute EIP-712 hash (same as client implementation)
    const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
      toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
    );

    // Get domain separator from USDC contract
    const USDC_DOMAIN_ABI = [{
      name: 'DOMAIN_SEPARATOR',
      type: 'function',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'bytes32' }],
    }] as const;

    const domainSeparator = await client.readContract({
      address: paymentRequirements.asset as Address,
      abi: USDC_DOMAIN_ABI,
      functionName: 'DOMAIN_SEPARATOR'
    });

    // Compute struct hash using abi.encode (not encodePacked)
    const structHash = keccak256(
      encodeAbiParameters(
        parseAbiParameters('bytes32, address, address, uint256, uint256, uint256, bytes32'),
        [
          TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
          authorization.from as Address,
          authorization.to as Address,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce as `0x${string}`
        ]
      )
    );

    // Final EIP-712 hash
    const eip712Hash = keccak256(
      encodePacked(
        ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
        ['0x19' as `0x${string}`, '0x01' as `0x${string}`, domainSeparator as `0x${string}`, structHash]
      )
    );

    console.log('[VERIFY] EIP-712 Hash:', eip712Hash);

    // Check if signer is a contract (smart account) or EOA
    const code = await client.getBytecode({ address: authorization.from as Address });
    const isContract = code !== undefined && code !== '0x';

    let isValidSignature = false;

    if (isContract) {
      // Use EIP-1271 validation for smart contracts
      console.log('[VERIFY] Detected smart contract wallet, using EIP-1271 validation');
      try {
        const magicValue = await client.readContract({
          address: authorization.from as Address,
          abi: EIP1271_ABI,
          functionName: 'isValidSignature',
          args: [eip712Hash, signature as `0x${string}`]
        });

        isValidSignature = magicValue === EIP1271_MAGIC_VALUE;
        console.log(`[VERIFY] EIP-1271 magic value: ${magicValue}, valid: ${isValidSignature}`);
      } catch (error: any) {
        console.error(`[VERIFY] EIP-1271 validation failed: ${error.message}`);
        isValidSignature = false;
      }
    } else {
      // Use standard signature recovery for EOAs
      console.log('[VERIFY] Detected EOA wallet, using standard signature verification');
      try {
        isValidSignature = await client.verifyMessage({
          address: authorization.from as Address,
          message: { raw: eip712Hash },
          signature: signature as `0x${string}`,
        });
        console.log(`[VERIFY] EOA signature valid: ${isValidSignature}`);
      } catch (error: any) {
        console.error(`[VERIFY] EOA signature verification failed: ${error.message}`);
        isValidSignature = false;
      }
    }

    if (!isValidSignature) {
      console.error('❌ Invalid signature');
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_signature',
        payer: authorization.from,
      };
    }

    console.log('✅ Signature verification passed');

    // 5. Verify recipient matches
    if (getAddress(authorization.to) !== getAddress(paymentRequirements.payTo)) {
      console.error('❌ Recipient mismatch');
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_recipient_mismatch',
        payer: authorization.from,
      };
    }

    // 6. Verify time window (validBefore must be at least 6 seconds in future)
    const now = Math.floor(Date.now() / 1000);
    if (BigInt(authorization.validBefore) < BigInt(now + 6)) {
      console.error('❌ Authorization expires too soon');
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_valid_before',
        payer: authorization.from,
      };
    }

    // 7. Verify validAfter is not in future
    if (BigInt(authorization.validAfter) > BigInt(now)) {
      console.error('❌ Authorization not yet valid');
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_valid_after',
        payer: authorization.from,
      };
    }

    // 8. Check user balance (skip if contract doesn't exist)
    try {
      const balance = await client.readContract({
        address: paymentRequirements.asset as Address,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [authorization.from as Address],
      });

      if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
        console.error(`❌ Insufficient funds: ${balance} < ${paymentRequirements.maxAmountRequired}`);
        return {
          isValid: false,
          invalidReason: 'insufficient_funds',
          payer: authorization.from,
        };
      }

      console.log(`✅ USDC balance check passed: ${balance} >= ${paymentRequirements.maxAmountRequired}`);
    } catch (balanceError: any) {
      console.warn(`⚠️  Could not check USDC balance (${balanceError.message}). Skipping balance verification.`);
      console.warn(`   This might be a testnet without deployed USDC contract`);
      // Continue without balance check for testing
    }

    // 9. Verify authorization value >= required amount
    if (BigInt(authorization.value) < BigInt(paymentRequirements.maxAmountRequired)) {
      console.error('❌ Authorization value too low');
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_authorization_value',
        payer: authorization.from,
      };
    }

    // All checks passed!
    console.log(`✅ Payment verified successfully for ${authorization.from}`);
    return {
      isValid: true,
      payer: authorization.from,
    };

  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    return {
      isValid: false,
      invalidReason: 'invalid_network',
      payer: (paymentPayload.payload as any).authorization?.from,
    };
  }
}

/**
 * Get supported networks for KRNL workflows
 */
export function getKRNLSupportedNetworks(): string[] {
  return Object.keys(NETWORK_CONFIG);
}

/**
 * Check if network is supported
 */
export function isKRNLNetworkSupported(network: string): boolean {
  return network.toLowerCase() in NETWORK_CONFIG;
}
