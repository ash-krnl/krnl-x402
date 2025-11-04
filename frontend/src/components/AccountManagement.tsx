import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, ExternalLink, RefreshCw, Wallet, Shield, CheckCircle, XCircle, Loader2, Coins, Settings } from 'lucide-react';
import { formatAddress, getChainName, formatBalance, getChainCurrency, getExplorerUrl, copyToClipboard } from '@/utils';
import type { PrivyEmbeddedWallet } from '@krnl-dev/sdk-react-7702';

interface AccountManagementProps {
  embeddedWallet: PrivyEmbeddedWallet | null;
  balance: string;
  balanceLoading: boolean;
  chainInfo: any;
  isSwitching: boolean;
  isRefreshing: boolean;
  refetch: () => Promise<void>;
  smartContractAddress: string;
  isAuthorized: boolean;
  smartAccountEnabled: boolean;
  authLoading: boolean;
  authError: string | null;
  enableSmartAccount: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  isAuthenticated: boolean;
  isReady: boolean;
  walletsReady: boolean;
  usdcBalance: string;
  isLoadingUSDC: boolean;
  refetchUSDC: () => Promise<void>;
  mintUSDC: () => Promise<any>;
  isMintingUSDC: boolean;
  switchToSepolia: () => Promise<void>;
  isSwitchingToSepolia: boolean;
  copied: boolean;
  setCopied: (value: boolean) => void;
  copiedSmart: boolean;
  setCopiedSmart: (value: boolean) => void;
  setIsRefreshing: (value: boolean) => void;
}

export const AccountManagement = ({
  embeddedWallet,
  balance,
  balanceLoading,
  chainInfo,
  isSwitching,
  isRefreshing,
  refetch,
  smartContractAddress,
  isAuthorized,
  smartAccountEnabled,
  authLoading,
  authError,
  enableSmartAccount,
  refreshStatus,
  isAuthenticated,
  isReady,
  walletsReady,
  usdcBalance,
  isLoadingUSDC,
  refetchUSDC,
  mintUSDC,
  isMintingUSDC,
  switchToSepolia,
  isSwitchingToSepolia,
  copied,
  setCopied,
  copiedSmart,
  setCopiedSmart,
  setIsRefreshing
}: AccountManagementProps) => {
  // Derived state
  const chainName = getChainName(chainInfo?.providerChainIdDecimal);
  const currency = getChainCurrency(chainInfo?.providerChainIdDecimal);
  const isValidSmartContract = Boolean(smartContractAddress && smartContractAddress !== '0x');

  // Handler functions
  const refreshBalance = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refetch, setIsRefreshing]);

  const handleCopyAddress = useCallback(async () => {
    if (!embeddedWallet?.address) return;
    const result = await copyToClipboard(embeddedWallet.address);
    if (result.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [embeddedWallet?.address, setCopied]);

  const handleCopySmartAddress = useCallback(async () => {
    if (!smartContractAddress) return;
    const result = await copyToClipboard(smartContractAddress);
    if (result.success) {
      setCopiedSmart(true);
      setTimeout(() => setCopiedSmart(false), 2000);
    }
  }, [smartContractAddress, setCopiedSmart]);

  const handleViewExplorer = useCallback(() => {
    if (!embeddedWallet?.address || !chainInfo?.providerChainIdDecimal) return;
    const url = getExplorerUrl(embeddedWallet.address, chainInfo.providerChainIdDecimal);
    window.open(url, '_blank');
  }, [embeddedWallet?.address, chainInfo]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Management</CardTitle>
        <CardDescription>Manage your wallet and smart account settings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Embedded Wallet Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wallet className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Embedded Wallet</h3>
              </div>
              <Button
                onClick={refreshBalance}
                variant="ghost"
                size="icon"
                disabled={balanceLoading || isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${(balanceLoading || isRefreshing) ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="space-y-3">
              {/* Address Row */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Address</span>
                <div className="flex items-center space-x-2">
                  {!embeddedWallet?.address ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Creating wallet...</span>
                    </div>
                  ) : (
                    <>
                      <span className="font-mono text-sm">
                        {formatAddress(embeddedWallet.address)}
                      </span>
                      <Button
                        onClick={handleCopyAddress}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Network Row */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Network</span>
                <div className="flex items-center space-x-2">
                  {(isSwitching || isSwitchingToSepolia) ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-sm">Switching...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{chainName}</span>
                      {chainInfo?.providerChainIdDecimal !== 11155111 && (
                        <Button
                          onClick={switchToSepolia}
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                        >
                          Switch to Sepolia
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Balance Row */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">Balance</span>
                <div className="flex items-center space-x-2">
                  {!embeddedWallet?.address || balanceLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-sm font-medium">
                      {formatBalance(balance)} {currency}
                    </span>
                  )}
                </div>
              </div>

              {/* USDC Balance Row */}
              {chainInfo?.providerChainIdDecimal === 11155111 && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">USDC Balance</span>
                  <div className="flex items-center space-x-2">
                    {!embeddedWallet?.address || isLoadingUSDC ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <span className="text-sm font-medium">
                        {formatBalance(usdcBalance)} USDC
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            {embeddedWallet?.address && (
              <div className="flex space-x-2 pt-2">
                <Button
                  onClick={handleViewExplorer}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <ExternalLink className="mr-2 h-3 w-3" />
                  View on Explorer
                </Button>
                {chainInfo?.providerChainIdDecimal === 11155111 && (
                  <Button
                    onClick={async () => {
                      const result = await mintUSDC();
                      if (result.success) {
                        await Promise.all([refetch(), refetchUSDC()]);
                      }
                      return result;
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isMintingUSDC}
                  >
                    {isMintingUSDC ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Minting...
                      </>
                    ) : (
                      <>
                        <Coins className="mr-2 h-3 w-3" />
                        Mint 1M USDC
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Copy Feedback */}
            {copied && (
              <div className="text-center text-sm text-green-600">
                Address copied to clipboard!
              </div>
            )}
          </div>

          {/* Smart Account Section */}
          <div className="lg:border-l lg:border-border lg:pl-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Smart Account Authorization</h3>
                </div>
                <Button
                  onClick={refreshStatus}
                  variant="ghost"
                  size="icon"
                  disabled={authLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${authLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Manage EIP-7702 delegation and smart contract approvals for enhanced functionality
              </p>

              <div className="space-y-3">
                {/* Authorization Status */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">KRNL Smart Account Authorized</span>
                  <div className="flex items-center space-x-2">
                    {authLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (smartAccountEnabled && isAuthorized) ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-600 font-medium">Authorized</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-red-600 font-medium">Not Authorized</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Smart Contract Address */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">KRNL Smart Account Address</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs">
                      {smartContractAddress ?
                        formatAddress(smartContractAddress, 6) :
                        'Not configured'
                      }
                    </span>
                    {isValidSmartContract && (
                      <Button
                        onClick={handleCopySmartAddress}
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Transaction Broadcasting */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">Transaction Broadcasting</span>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-600 font-medium">Privy Embedded Wallet</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              {embeddedWallet?.address && isValidSmartContract && (
                <div className="space-y-3 pt-4">
                  <Button
                    onClick={async () => { await enableSmartAccount(); }}
                    disabled={authLoading || isAuthorized || !isAuthenticated || !isReady || !walletsReady}
                    variant={isAuthorized ? "outline" : "default"}
                    className="w-full flex items-center justify-center"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Settings className="mr-2 h-4 w-4" />
                        {isAuthorized
                          ? 'Already Authorized'
                          : !isAuthenticated || !isReady || !walletsReady
                            ? 'Authentication Required'
                            : 'Authorize Smart Account'
                        }
                      </>
                    )}
                  </Button>

                  {/* Error Display */}
                  {authError && (
                    <div className="text-center text-sm text-red-600 bg-red-50 p-2 rounded">
                      Error: {authError}
                    </div>
                  )}

                  {/* Info Text */}
                  <div className="text-xs text-muted-foreground text-center space-y-1">
                    <div>Uses EIP-7702 delegation for secure smart contract interactions</div>
                    <div className="text-green-600">Powered by Privy Embedded Wallet</div>
                  </div>
                </div>
              )}

              {/* Copy Feedback */}
              {copiedSmart && (
                <div className="text-center text-sm text-green-600">
                  Smart contract address copied to clipboard!
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};