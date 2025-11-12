import { Chain, getAddress, Hex, LocalAccount, toHex, Transport, keccak256, encodeAbiParameters, parseAbiParameters, encodePacked } from "viem";
import { getNetworkId } from "../../../shared";
import {
  authorizationTypes,
  isAccount,
  isSignerWallet,
  SignerWallet,
} from "../../../types/shared/evm";
import { ExactEvmPayloadAuthorization, PaymentRequirements } from "../../../types/verify";

/**
 * Signs an EIP-3009 authorization for USDC transfer
 *
 * @param walletClient - The wallet client that will sign the authorization
 * @param params - The authorization parameters containing transfer details
 * @param params.from - The address tokens will be transferred from
 * @param params.to - The address tokens will be transferred to
 * @param params.value - The amount of USDC tokens to transfer (in base units)
 * @param params.validAfter - Unix timestamp after which the authorization becomes valid
 * @param params.validBefore - Unix timestamp before which the authorization is valid
 * @param params.nonce - Random 32-byte nonce to prevent replay attacks
 * @param paymentRequirements - The payment requirements containing asset and network information
 * @param paymentRequirements.asset - The address of the USDC contract
 * @param paymentRequirements.network - The network where the USDC contract exists
 * @param paymentRequirements.extra - The extra information containing the name and version of the ERC20 contract
 * @returns The signature for the authorization
 */
export async function signAuthorization<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  { from, to, value, validAfter, validBefore, nonce }: ExactEvmPayloadAuthorization,
  { asset, network, extra }: PaymentRequirements,
): Promise<{ signature: Hex }> {
  const chainId = getNetworkId(network);
  const name = extra?.name;
  const version = extra?.version;

  const data = {
    types: authorizationTypes,
    domain: {
      name,
      version,
      chainId,
      verifyingContract: getAddress(asset),
    },
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: getAddress(from),
      to: getAddress(to),
      value,
      validAfter,
      validBefore,
      nonce: nonce,
    },
  };

  console.log('[SIGN] Domain:', JSON.stringify(data.domain, null, 2));
  console.log('[SIGN] Message:', JSON.stringify(data.message, null, 2));
  console.log('[SIGN] Signer (from):', from);

  // Manually compute EIP-712 hash (for EIP-1271 smart contract wallet compatibility)
  const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
    toHex('TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)')
  );

  // Compute EIP-712 domain separator
  const domainSeparator = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, bytes32, bytes32, uint256, address'),
      [
        keccak256(toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toHex(data.domain.name!)),
        keccak256(toHex(data.domain.version!)),
        BigInt(data.domain.chainId),
        data.domain.verifyingContract!
      ]
    )
  );

  // Compute struct hash using abi.encode (not encodePacked)
  const structHash = keccak256(
    encodeAbiParameters(
      parseAbiParameters('bytes32, address, address, uint256, uint256, uint256, bytes32'),
      [
        TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
        getAddress(from),
        getAddress(to),
        BigInt(value),
        BigInt(validAfter),
        BigInt(validBefore),
        nonce as Hex
      ]
    )
  );

  // Final EIP-712 hash
  const eip712Hash = keccak256(
    encodePacked(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      ['0x19' as Hex, '0x01' as Hex, domainSeparator, structHash]
    )
  );

  console.log('[SIGN] EIP-712 Hash:', eip712Hash);

  // Sign the raw EIP-712 hash with EIP-191 (for EIP-1271 compatibility)
  if (isSignerWallet(walletClient)) {
    const signature = await walletClient.signMessage({
      message: { raw: eip712Hash }
    });
    console.log('[SIGN] Signature (EIP-191):', signature);
    return {
      signature,
    };
  } else if (isAccount(walletClient) && walletClient.signMessage) {
    const signature = await walletClient.signMessage({
      message: { raw: eip712Hash }
    });
    console.log('[SIGN] Signature (EIP-191):', signature);
    return {
      signature,
    };
  } else {
    throw new Error("Invalid wallet client provided does not support signMessage");
  }
}

/**
 * Generates a random 32-byte nonce for use in authorization signatures
 *
 * @returns A random 32-byte nonce as a hex string
 */
export function createNonce(): Hex {
  const cryptoObj =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
      ? globalThis.crypto
      : // Dynamic require is needed to support node.js
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("crypto").webcrypto;
  return toHex(cryptoObj.getRandomValues(new Uint8Array(32)));
}
