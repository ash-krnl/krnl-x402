import { encodePacked, keccak256 } from 'viem';
import { CHAIN_CONFIG, DEFAULT_CHAIN_ID } from './const';

// ==================== FORMATTERS ====================

export const formatAddress = (address: string | undefined, chars = 6): string => {
  if (!address) return 'No address';
  if (address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars + 2)}`;
};

export const formatBalance = (balance: string | number | undefined, decimals = 4): string => {
  if (balance === undefined || balance === null) return '0';

  const num = typeof balance === 'string' ? parseFloat(balance) : balance;
  if (isNaN(num)) return '0';

  if (num > 0 && num < 0.0001) {
    return num.toExponential(2);
  }

  return num.toFixed(decimals).replace(/\.?0+$/, '');
};

export const getChainName = (chainId: number | undefined): string => {
  if (!chainId) return 'Unknown Network';

  const chain = Object.values(CHAIN_CONFIG).find(c => c.id === chainId);
  return chain?.name || `Chain ${chainId}`;
};

export const getChainCurrency = (chainId: number | undefined): string => {
  if (!chainId) return 'ETH';

  const chain = Object.values(CHAIN_CONFIG).find(c => c.id === chainId);
  return chain?.currency || 'ETH';
};

export const getExplorerUrl = (address: string, chainId: number): string => {
  const chain = Object.values(CHAIN_CONFIG).find(c => c.id === chainId);
  const baseUrl = chain?.explorerUrl || CHAIN_CONFIG.SEPOLIA.explorerUrl;
  return `${baseUrl}/address/${address}`;
};

export const getTxExplorerUrl = (txHash: string, chainId: number): string => {
  const chain = Object.values(CHAIN_CONFIG).find(c => c.id === chainId);
  const baseUrl = chain?.explorerUrl || CHAIN_CONFIG.SEPOLIA.explorerUrl;
  return `${baseUrl}/tx/${txHash}`;
};

// ==================== CLIPBOARD ====================

export interface CopyToClipboardResult {
  success: boolean;
  error?: Error;
}

export const copyToClipboard = async (textToCopy: string): Promise<CopyToClipboardResult> => {
  try {
    await navigator.clipboard.writeText(textToCopy);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error('Failed to copy text')
    };
  }
};

// ==================== LOGGER ====================

const isDevelopment = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args);
    }
  },

  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[LOG]', ...args);
    }
  },

  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info('[INFO]', ...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args);
    }
  },

  error: (...args: unknown[]) => {
    if (isDevelopment) {
      console.error('[ERROR]', ...args);
    }
  },
};

// ==================== CHAINS ====================

export const getRequiredChainId = (): number => {
  return DEFAULT_CHAIN_ID;
};

interface PrivyWallet {
  switchChain: (chainId: number) => Promise<void>;
  address: string;
  chainId: string;
  connectorType: string;
}

export const switchNetwork = async (wallet: PrivyWallet, targetChainId: number): Promise<boolean> => {
  try {
    await wallet.switchChain(targetChainId);
    return true;
  } catch (error) {
    logger.error('Failed to switch network:', error);
    return false;
  }
};

// ==================== TRANSACTION INTENT ====================

export interface TransactionIntent {
  destinations: `0x${string}`[];
  values: bigint[];
  nonce: bigint;
  deadline: bigint;
  id: `0x${string}`;
}

export function generateIntentId(
  walletAddress: string,
  nonce: number,
  deadline: number
): `0x${string}` {
  const packed = encodePacked(
    ['address', 'uint256', 'uint256'],
    [walletAddress as `0x${string}`, BigInt(nonce), BigInt(deadline)]
  );
  return keccak256(packed);
}

export function createTransactionIntent(
  destinations: string[],
  values: bigint[],
  walletAddress: string,
  nonce: number
): TransactionIntent {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const intentId = generateIntentId(walletAddress, nonce, Number(deadline));

  return {
    destinations: destinations as `0x${string}`[],
    values,
    nonce: BigInt(nonce),
    deadline,
    id: intentId
  };
}

// ==================== WASM INITIALIZATION ====================
// WASM initialization moved to SDK