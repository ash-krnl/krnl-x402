import { useState, useCallback } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { ethers, BrowserProvider, parseUnits } from 'ethers';
import { CONTRACT_ADDRESSES, DEFAULT_CHAIN_ID } from '@/const';
import { logger } from '@/utils';

const MOCK_USDC_ABI = [
  'function mint(address to, uint256 amount) external',
  'function decimals() view returns (uint8)',
];

export const useMintUSDC = () => {
  const { wallets } = useWallets();
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  const mintUSDC = useCallback(async (amount: number = 1000000) => {
    const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

    if (!embeddedWallet) {
      setMintError('No embedded wallet found');
      return { success: false, error: 'No embedded wallet found' };
    }

    if (!CONTRACT_ADDRESSES.MOCK_USDC) {
      setMintError('Mock USDC address not configured');
      return { success: false, error: 'Mock USDC address not configured' };
    }

    setIsMinting(true);
    setMintError(null);

    try {
      // Get the Ethereum provider
      const provider = await embeddedWallet.getEthereumProvider();

      // Get current chain ID
      const currentChainId = await provider.request({
        method: 'eth_chainId'
      });
      const currentChainIdDecimal = parseInt(currentChainId, 16);

      // Switch to Sepolia if not already on it
      if (currentChainIdDecimal !== DEFAULT_CHAIN_ID) {
        await embeddedWallet.switchChain(DEFAULT_CHAIN_ID);
      }

      // Create ethers provider and signer
      const ethersProvider = new BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();
      const address = await signer.getAddress();

      const usdcContract = new ethers.Contract(
        CONTRACT_ADDRESSES.MOCK_USDC,
        MOCK_USDC_ABI,
        signer
      );

      // Get decimals (should be 6 for USDC)
      const decimals = await usdcContract.decimals();
      const amountWithDecimals = parseUnits(amount.toString(), decimals);

      // Mint USDC to the wallet
      const tx = await usdcContract.mint(address, amountWithDecimals);
      logger.log('Minting USDC, tx hash:', tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      logger.log('USDC minted successfully:', receipt);

      setIsMinting(false);
      return {
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to mint USDC';
      logger.error('Error minting USDC:', error);
      setMintError(errorMessage);
      setIsMinting(false);
      return { success: false, error: errorMessage };
    }
  }, [wallets]);

  return {
    mintUSDC,
    isMinting,
    mintError,
  };
};