import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, Play, Coins } from 'lucide-react';
import { formatAddress } from '@/utils';

interface WorkflowTrackingModalProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  activeScenario: 'A' | 'B' | null;
  steps: any[];
  workflowError: string | null;
  resetSteps: () => void;
  currentStep: number;
}

export const WorkflowTrackingModal = ({
  isOpen,
  onClose,
  activeScenario,
  steps,
  workflowError,
  resetSteps,
  currentStep
}: WorkflowTrackingModalProps) => {
  const handleModalClose = (open: boolean) => {
    onClose(open);
    if (!open) {
      resetSteps();
    }
  };

  const combinedError = workflowError;
  const completedStep = steps.find(step => step.id === 3 && step.status === 'completed');
  const hasTransactionHash = completedStep?.result && typeof completedStep.result === 'object' && 'transactionHash' in completedStep.result;

  return (
    <Dialog open={isOpen} onOpenChange={handleModalClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="text-center">
          <DialogTitle className="flex items-center justify-center gap-2">
            {activeScenario === 'A' ? (
              <>
                <Play className="h-5 w-5 text-blue-600" />
                Property Analysis in Progress
              </>
            ) : (
              <>
                <Coins className="h-5 w-5 text-green-600" />
                Property Purchase in Progress
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            Please wait while we process your {activeScenario === 'A' ? 'property analysis' : 'property purchase'} request
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-6">
            {/* Progress indicator */}
            {steps.length > 0 ? (
              <div className="flex items-center justify-center space-x-2">
                {steps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  {/* Step circle */}
                  <div className={`
                    relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-200
                    ${step.status === 'completed'
                      ? 'bg-green-100 border-green-500'
                      : step.status === 'running'
                        ? 'bg-blue-100 border-blue-500'
                        : step.status === 'error'
                          ? 'bg-red-100 border-red-500'
                          : 'bg-gray-50 border-gray-300'}
                  `}>
                    {step.status === 'running' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    ) : step.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : step.status === 'error' ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <span className="text-xs font-medium text-gray-500">{step.id}</span>
                    )}
                  </div>

                  {/* Connector line (not after last step) */}
                  {index < steps.length - 1 && (
                    <div className={`
                      w-16 h-0.5 mx-2 transition-all duration-200
                      ${steps[index + 1]?.status === 'completed' || steps[index + 1]?.status === 'running'
                        ? 'bg-green-300'
                        : 'bg-gray-200'}
                    `} />
                  )}
                </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">Initializing workflow...</p>
                </div>
              </div>
            )}

            {/* Step details */}
            {steps.length > 0 && (
              <div className="space-y-4">
                {steps.map((step) => (
                <div key={step.id} className={`
                  p-4 rounded-lg border transition-all duration-200
                  ${step.status === 'completed'
                    ? 'bg-green-50 border-green-200'
                    : step.status === 'running'
                      ? 'bg-blue-50 border-blue-200'
                      : step.status === 'error'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'}
                  ${currentStep === step.id ? 'ring-2 ring-blue-500 ring-opacity-20' : ''}
                `}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {step.status === 'running' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        ) : step.status === 'completed' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : step.status === 'error' ? (
                          <XCircle className="h-5 w-5 text-red-600" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
                            <span className="text-xs text-gray-500">{step.id}</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className={`
                          font-semibold text-sm
                          ${step.status === 'completed'
                            ? 'text-green-800'
                            : step.status === 'running'
                              ? 'text-blue-800'
                              : step.status === 'error'
                                ? 'text-red-800'
                                : 'text-gray-600'}
                        `}>
                          {step.title}
                        </h4>
                        <p className={`
                          text-sm mt-1
                          ${step.status === 'completed'
                            ? 'text-green-700'
                            : step.status === 'running'
                              ? 'text-blue-700'
                              : step.status === 'error'
                                ? 'text-red-700'
                                : 'text-gray-500'}
                        `}>
                          {step.error ||
                           (step.result && typeof step.result === 'object' && 'message' in step.result ? step.result.message as string : null) ||
                           (step.status === 'running' ? `${step.title} in progress...` :
                            step.status === 'completed' ? `${step.title} completed successfully` :
                            step.status === 'error' ? `${step.title} failed` :
                            `Waiting for ${step.title.toLowerCase()}`)}
                        </p>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className={`
                      px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wide
                      ${step.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : step.status === 'running'
                          ? 'bg-blue-100 text-blue-800'
                          : step.status === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-600'}
                    `}>
                      {step.status === 'pending' ? 'pending' : step.status}
                    </div>
                  </div>
                </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Display */}
          {combinedError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <h4 className="font-medium text-red-800">Error Occurred</h4>
              </div>
              <div className="space-y-2 mt-1">
                <p className="text-sm text-red-700">{combinedError}</p>
              </div>
            </div>
          )}

          {/* Success Results */}
          {hasTransactionHash && !combinedError && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h4 className="font-medium text-green-800">
                  {activeScenario === 'A' ? 'Analysis Completed!' : 'Purchase Completed!'}
                </h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction Hash:</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${(completedStep.result as any).transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-mono"
                  >
                    {formatAddress((completedStep.result as any).transactionHash)}
                  </a>
                </div>
                {(completedStep.result as any).blockNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Block Number:</span>
                    <span className="font-mono">{(completedStep.result as any).blockNumber}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Close button for completed or failed workflows */}
          {(steps.some(step => step.status === 'completed' && step.id === 3) || combinedError || currentStep === 0) && (
            <div className="flex justify-center pt-2">
              <Button
                onClick={() => {
                  handleModalClose(false);
                }}
                variant="outline"
                className="w-full"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};