import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, RefreshCw, Loader2, CheckCircle, XCircle, Settings, Copy } from 'lucide-react';
import { formatAddress, copyToClipboard, logger } from '@/utils';

interface SmartAccountAuthCardProps {
  isAuthorized: boolean;
  smartAccountEnabled: boolean;
  smartContractAddress?: string;
  isLoading: boolean;
  error?: string | null;
  onRefreshStatus: () => Promise<void>;
  onEnableSmartAccount: () => Promise<void>;
  embeddedWalletAddress?: string;
  isAuthenticated?: boolean;
  isReady?: boolean;
  walletsReady?: boolean;
}

export const SmartAccountAuthCard = memo(({
  isAuthorized,
  smartAccountEnabled,
  smartContractAddress,
  isLoading,
  error,
  onRefreshStatus,
  onEnableSmartAccount,
  embeddedWalletAddress,
  isAuthenticated = false,
  isReady = false,
  walletsReady = false,
}: SmartAccountAuthCardProps) => {
  const isValidSmartContract = smartContractAddress &&
    smartContractAddress !== '0x0000000000000000000000000000000000000000' &&
    smartContractAddress !== '0x';

  const handleCopyAddress = async () => {
    if (!smartContractAddress) return;

    const result = await copyToClipboard(smartContractAddress);
    if (!result.success) {
      logger.error('Failed to copy smart contract address:', result.error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Smart Contract Authorization</CardTitle>
          </div>
          <Button
            onClick={onRefreshStatus}
            variant="ghost"
            size="icon"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          Manage EIP-7702 delegation and smart contract approvals for enhanced functionality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {/* Authorization Status */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">KRNL Smart Account Authorized</span>
            <div className="flex items-center space-x-2">
              {isLoading ? (
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
                  onClick={handleCopyAddress}
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
        {embeddedWalletAddress && isValidSmartContract && (
          <div className="space-y-3 pt-4">
            <Button
              onClick={onEnableSmartAccount}
              disabled={isLoading || isAuthorized || !isAuthenticated || !isReady || !walletsReady}
              variant={isAuthorized ? "outline" : "default"}
              className="w-full flex items-center justify-center"
            >
              {isLoading ? (
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
            {error && (
              <div className="text-center text-sm text-red-600 bg-red-50 p-2 rounded">
                Error: {error}
              </div>
            )}

            {/* Info Text */}
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <div>Uses EIP-7702 delegation for secure smart contract interactions</div>
              <div className="text-green-600">Powered by Privy Embedded Wallet</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

SmartAccountAuthCard.displayName = 'SmartAccountAuthCard';