import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Play, Coins } from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentExecutionProps {
  isAuthorized: boolean;
  currentStep: number;
  activeScenario: 'A' | 'B' | null;
  paymentTo: string;
  paymentValue: string;
  paymentDescription: string;
  paymentResource: string;
  validationErrors: {
    paymentTo: string;
    paymentValue: string;
    paymentDescription: string;
    paymentResource: string;
  };
  executeWorkflow: (paymentDetails: {
    to: string;
    value: string;
    description: string;
    resource: string;
  }) => Promise<void>;
  mintUSDC: () => Promise<any>;
  isMintingUSDC: boolean;
  usdcBalance: string;
  isLoadingUSDC: boolean;
  refetchUSDC: () => Promise<void>;
  onPaymentToChange: (value: string) => void;
  onPaymentValueChange: (value: string) => void;
  onPaymentDescriptionChange: (value: string) => void;
  onPaymentResourceChange: (value: string) => void;
  onActiveScenarioChange: (scenario: 'A' | 'B' | null) => void;
  validateInputs: () => boolean;
  balance: string;
}

export const PaymentExecution = ({
  isAuthorized,
  currentStep,
  activeScenario,
  paymentTo,
  paymentValue,
  paymentDescription,
  paymentResource,
  validationErrors,
  executeWorkflow,
  mintUSDC,
  isMintingUSDC,
  usdcBalance,
  isLoadingUSDC,
  refetchUSDC,
  onPaymentToChange,
  onPaymentValueChange,
  onPaymentDescriptionChange,
  onPaymentResourceChange,
  onActiveScenarioChange,
  validateInputs,
  balance
}: PaymentExecutionProps) => {
  const validateRequirements = (): boolean => {
    // Check smart account authorization
    if (!isAuthorized) {
      toast.error('Smart account must be authorized first');
      return false;
    }

    // Check embedded wallet balance > 0.03 ETH
    if (parseFloat(balance) <= 0.03) {
      toast.error('Insufficient balance. You need more than 0.03 ETH to execute workflows.');
      return false;
    }

    return true;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Payment Workflow Execution</CardTitle>
            <CardDescription>Execute X402 payment settlement workflow</CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              onClick={async () => {
                await mintUSDC();
                await refetchUSDC();
              }}
              disabled={isMintingUSDC}
              variant="outline"
              size="sm"
            >
              {isMintingUSDC ? (
                <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Minting...</>
              ) : (
                <><Coins className="mr-2 h-3 w-3" />Mint USDC</>
              )}
            </Button>
            <div className="text-xs text-muted-foreground">
              Balance: {isLoadingUSDC ? '...' : `${usdcBalance} USDC`}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-800">
              💡 <strong>Note:</strong> Payment nonce, timestamps, and signature will be automatically generated and signed with your wallet.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="paymentTo">To Address (Payee)</Label>
              <Input
                id="paymentTo"
                value={paymentTo}
                onChange={(e) => onPaymentToChange(e.target.value)}
                placeholder="0x..."
                disabled={currentStep > 0}
                className={validationErrors.paymentTo ? 'border-red-500' : ''}
              />
              {validationErrors.paymentTo && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.paymentTo}</p>
              )}
            </div>
            <div>
              <Label htmlFor="paymentValue">Payment Amount (in smallest unit)</Label>
              <Input
                id="paymentValue"
                value={paymentValue}
                onChange={(e) => onPaymentValueChange(e.target.value)}
                placeholder="e.g., 10000 (0.01 USDC)"
                disabled={currentStep > 0}
                className={validationErrors.paymentValue ? 'border-red-500' : ''}
              />
              {validationErrors.paymentValue && (
                <p className="text-sm text-red-500 mt-1">{validationErrors.paymentValue}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="paymentDescription">Payment Description</Label>
            <Input
              id="paymentDescription"
              value={paymentDescription}
              onChange={(e) => onPaymentDescriptionChange(e.target.value)}
              placeholder="e.g., Premium content access"
              disabled={currentStep > 0}
              className={validationErrors.paymentDescription ? 'border-red-500' : ''}
            />
            {validationErrors.paymentDescription && (
              <p className="text-sm text-red-500 mt-1">{validationErrors.paymentDescription}</p>
            )}
          </div>

          <div>
            <Label htmlFor="paymentResource">Resource URL</Label>
            <Input
              id="paymentResource"
              value={paymentResource}
              onChange={(e) => onPaymentResourceChange(e.target.value)}
              placeholder="e.g., http://localhost:4000/premium"
              disabled={currentStep > 0}
              className={validationErrors.paymentResource ? 'border-red-500' : ''}
            />
            {validationErrors.paymentResource && (
              <p className="text-sm text-red-500 mt-1">{validationErrors.paymentResource}</p>
            )}
          </div>

          <Button
            onClick={async () => {
              if (validateRequirements() && validateInputs()) {
                onActiveScenarioChange('A');
                await executeWorkflow({
                  to: paymentTo,
                  value: paymentValue,
                  description: paymentDescription,
                  resource: paymentResource,
                });
              }
            }}
            disabled={currentStep > 0}
            className="w-full"
          >
            {currentStep > 0 && activeScenario === 'A' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing Payment...</>
            ) : (
              <><Play className="mr-2 h-4 w-4" />Execute Payment Settlement</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
