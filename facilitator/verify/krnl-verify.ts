import { createPublicClient, http, type Address, type Chain, getAddress } from 'viem';
import { baseSepolia, optimismSepolia, arbitrumSepolia, polygonAmoy } from 'viem/chains';
import type { PaymentPayload, PaymentRequirements, VerifyResponse } from '../../x402/typescript/packages/x402/src/types/index';

/**
 * Custom verify implementation for KRNL workflows
 * 
 * This implements the x402 SDK verify logic but with support for testnet networks.
 */

// Network to chain mapping with extended support
const NETWORK_CONFIG: Record<string, {
  chain: Chain;
  chainId: number;
  usdcAddress: string;
  usdcName: string;
  usdcVersion: string;
}> = {
  'base-sepolia': {
    chain: baseSepolia,
    chainId: 84532,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
    usdcName: 'USD Coin',
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

    // 4. Verify EIP-712 signature
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

    const isValidSignature = await client.verifyTypedData({
      address: authorization.from as Address,
      domain,
      types: AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValidSignature) {
      console.error('❌ Invalid signature');
      return {
        isValid: false,
        invalidReason: 'invalid_exact_evm_payload_signature',
        payer: authorization.from,
      };
    }

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

    // 8. Check user balance
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
