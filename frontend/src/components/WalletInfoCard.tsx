import React, { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Copy, ExternalLink, RefreshCw, Loader2, Coins } from 'lucide-react';
import { formatAddress, formatBalance, getChainCurrency, getExplorerUrl, copyToClipboard, logger } from '@/utils';

interface WalletInfoCardProps {
  address?: string;
  balance?: string;
  chainId?: number;
  chainName: string;
  isLoading: boolean;
  isSwitching: boolean;
  isRefreshing: boolean;
  isSwitchingToSepolia: boolean;
  onRefresh: () => Promise<void>;
  onSwitchToSepolia: () => Promise<void>;
  onSwitchToMainnet?: () => Promise<void>;
  onMintUSDC?: () => Promise<any>;
  isMintingUSDC?: boolean;
  usdcBalance?: string;
  isLoadingUSDC?: boolean;
}

export const WalletInfoCard = memo(({
  address,
  balance,
  chainId,
  chainName,
  isLoading,
  isSwitching,
  isRefreshing,
  isSwitchingToSepolia,
  onRefresh,
  onSwitchToSepolia,
  onSwitchToMainnet,
  onMintUSDC,
  isMintingUSDC,
  usdcBalance,
  isLoadingUSDC,
}: WalletInfoCardProps) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyAddress = useCallback(async () => {
    if (!address) return;

    const result = await copyToClipboard(address);
    if (result.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      logger.error('Failed to copy address:', result.error);
    }
  }, [address]);

  const handleViewExplorer = useCallback(() => {
    if (!address || !chainId) return;
    window.open(getExplorerUrl(address, chainId), '_blank');
  }, [address, chainId]);

  const currency = getChainCurrency(chainId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle>Embedded Wallet</CardTitle>
          </div>
          <Button
            onClick={onRefresh}
            variant="ghost"
            size="icon"
            disabled={isLoading || isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${(isLoading || isRefreshing) ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {/* Address Row */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Address</span>
            <div className="flex items-center space-x-2">
              {!address ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Creating wallet...</span>
                </div>
              ) : (
                <>
                  <span className="font-mono text-sm">
                    {formatAddress(address)}
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
                  {chainId === 11155111 ? (
                    // On Sepolia, show button to switch to Mainnet
                    onSwitchToMainnet && (
                      <Button
                        onClick={onSwitchToMainnet}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                      >
                        Switch to Mainnet
                      </Button>
                    )
                  ) : (
                    // On other chains, show button to switch to Sepolia
                    <Button
                      onClick={onSwitchToSepolia}
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
              {!address || isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="text-sm font-medium">
                  {formatBalance(balance)} {currency}
                </span>
              )}
            </div>
          </div>

          {/* USDC Balance Row */}
          {chainId === 11155111 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">USDC Balance</span>
              <div className="flex items-center space-x-2">
                {!address || isLoadingUSDC ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="text-sm font-medium">
                    {formatBalance(usdcBalance)} USDC
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Wallet Type Row */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Wallet Type</span>
            <span className="text-sm font-medium">Privy Embedded</span>
          </div>
        </div>

        {/* Action Buttons */}
        {address && (
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
            {onMintUSDC && chainId === 11155111 && (
              <Button
                onClick={onMintUSDC}
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
      </CardContent>
    </Card>
  );
});

WalletInfoCard.displayName = 'WalletInfoCard';