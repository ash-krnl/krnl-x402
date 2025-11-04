import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { getRequiredChainId, switchNetwork } from '../utils';

export const useWalletBalance = () => {
  const [balance, setBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chainInfo, setChainInfo] = useState<any>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const { ready } = usePrivy();
  const { wallets } = useWallets();
  
  // Find ONLY embedded wallet - strictly filter for Privy embedded wallets
  const embeddedWallet = wallets.find(wallet => 
    wallet.connectorType === 'embedded' && 
    wallet.walletClientType === 'privy'
  ) || null;
  
  const fetchBalance = useCallback(async () => {
    if (!ready || !embeddedWallet?.address) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const provider = await embeddedWallet.getEthereumProvider();
      
      // Get current chain ID from provider
      const currentChainId = await provider.request({
        method: 'eth_chainId'
      });
      
      const currentChainIdDecimal = parseInt(currentChainId, 16);
      const requiredChainId = getRequiredChainId();
      
      // Check if we need to switch networks
      if (currentChainIdDecimal !== requiredChainId) {
        setIsSwitching(true);
        
        const switched = await switchNetwork(embeddedWallet, requiredChainId);
        if (!switched) {
          throw new Error(`Failed to switch to required network (Chain ID: ${requiredChainId})`);
        }
        
        setIsSwitching(false);
      }
      
      // Get balance (after potential network switch)
      const balanceWei = await provider.request({
        method: 'eth_getBalance',
        params: [embeddedWallet.address, 'latest']
      });
      
      // Convert from hex to decimal and then to ETH
      const balanceInWei = parseInt(balanceWei, 16);
      const balanceInEth = (balanceInWei / 1e18).toFixed(6);
      setBalance(balanceInEth);
      
      // Parse wallet's chain_id from Privy format (eip155:1)
      let walletChainId = embeddedWallet.chainId;
      if (typeof walletChainId === 'string' && walletChainId.startsWith('eip155:')) {
        walletChainId = parseInt(walletChainId.split(':')[1], 10).toString();
      }
      
      // Get final chain ID after all operations
      const finalChainId = await provider.request({
        method: 'eth_chainId'
      });
      
      // Store chain info
      const finalChainIdDecimal = parseInt(finalChainId, 16);
      setChainInfo({
        providerChainId: finalChainId,
        providerChainIdDecimal: finalChainIdDecimal,
        walletChainId: embeddedWallet.chainId,
        walletChainIdDecimal: walletChainId,
        requiredChainId: requiredChainId
      });
      
    } catch (err) {
      console.error('Error fetching wallet data:', err);
      setError((err as Error).message);
      setBalance('0');
      setChainInfo(null);
    } finally {
      setIsLoading(false);
      setIsSwitching(false);
    }
  }, [ready, embeddedWallet]);
  
  useEffect(() => {
    // Only fetch once when wallet becomes available
    if (embeddedWallet?.address) {
      fetchBalance();
    }
  }, [embeddedWallet?.address, fetchBalance]);
  
  return { 
    balance, 
    isLoading: isLoading || isSwitching, 
    error, 
    wallet: embeddedWallet, 
    chainInfo,
    isSwitching,
    refetch: fetchBalance 
  };
};