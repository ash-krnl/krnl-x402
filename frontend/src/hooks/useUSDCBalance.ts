import { useState, useEffect, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { ethers, BrowserProvider, formatUnits } from 'ethers';
import { CONTRACT_ADDRESSES, DEFAULT_CHAIN_ID } from '@/const';
import { logger } from '@/utils';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export const useUSDCBalance = () => {
  const { wallets } = useWallets();
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUSDCBalance = useCallback(async () => {
    const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

    if (!embeddedWallet || !CONTRACT_ADDRESSES.MOCK_USDC) {
      setUsdcBalance('0');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get the Ethereum provider
      const provider = await embeddedWallet.getEthereumProvider();

      // Get current chain ID
      const currentChainId = await provider.request({
        method: 'eth_chainId'
      });
      const currentChainIdDecimal = parseInt(currentChainId, 16);

      // Only fetch USDC balance on Sepolia
      if (currentChainIdDecimal !== DEFAULT_CHAIN_ID) {
        setUsdcBalance('0');
        setIsLoading(false);
        return;
      }

      // Create ethers provider and signer
      const ethersProvider = new BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();
      const address = await signer.getAddress();

      const usdcContract = new ethers.Contract(
        CONTRACT_ADDRESSES.MOCK_USDC,
        ERC20_ABI,
        ethersProvider
      );

      const [balance, decimals] = await Promise.all([
        usdcContract.balanceOf(address),
        usdcContract.decimals()
      ]);

      const formattedBalance = formatUnits(balance, decimals);
      setUsdcBalance(formattedBalance);

      logger.log('USDC balance:', formattedBalance);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch USDC balance';
      logger.error('Error fetching USDC balance:', err);
      setError(errorMessage);
      setUsdcBalance('0');
    } finally {
      setIsLoading(false);
    }
  }, [wallets]);

  useEffect(() => {
    fetchUSDCBalance();
  }, [fetchUSDCBalance]);

  return {
    usdcBalance,
    isLoading,
    error,
    refetch: fetchUSDCBalance,
  };
};