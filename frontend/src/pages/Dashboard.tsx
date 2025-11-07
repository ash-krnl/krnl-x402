import { usePrivy } from '@privy-io/react-auth';
import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, TestTube2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWalletBalance } from '@/hooks/useWalletBalance';
import { useKRNL } from '@krnl-dev/sdk-react-7702';
import { usePaymentWorkflow } from '@/hooks/usePaymentWorkflow';
import { useMintUSDC } from '@/hooks/useMintUSDC';
import { useUSDCBalance } from '@/hooks/useUSDCBalance';
import { AccountManagement } from '@/components/AccountManagement';
import { PaymentExecution } from '@/components/PaymentExecution';
import { WorkflowTrackingModal } from '@/components/WorkflowTrackingModal';
import { formatAddress, getChainName, switchNetwork } from '@/utils';
import {
  isValidAddress,
  isValidUrl,
  isValidAmount
} from '@/utils/validation';
import toast from 'react-hot-toast';

const Dashboard = () => {
  const { logout } = usePrivy();
  const navigate = useNavigate();
  const { balance, isLoading: balanceLoading, wallet: embeddedWallet, chainInfo, isSwitching, refetch } = useWalletBalance();
  const {
    isAuthorized,
    smartAccountEnabled,
    isLoading: authLoading,
    error: authError,
    enableSmartAccount,
    checkAuth: refreshStatus,
    delegatedContractAddress,
    isAuthenticated,
    isReady,
    walletsReady,
  } = useKRNL();

  const smartContractAddress = delegatedContractAddress || import.meta.env.VITE_DELEGATED_ACCOUNT_ADDRESS as string;
  const { executeWorkflow, resetSteps, error: workflowError, steps, currentStep } = usePaymentWorkflow();
  const { mintUSDC, isMinting: isMintingUSDC } = useMintUSDC();
  const { usdcBalance, isLoading: isLoadingUSDC, refetch: refetchUSDC } = useUSDCBalance();

  // State management
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSwitchingToSepolia, setIsSwitchingToSepolia] = useState(false);
  const [activeScenario, setActiveScenario] = useState<'A' | 'B' | null>(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSmart, setCopiedSmart] = useState(false);

  // Payment form state with default values
  const [paymentTo, setPaymentTo] = useState('0xEfC315AEbEe513b9E6963C997D18C4d79830D6d1');
  const [paymentValue, setPaymentValue] = useState('10000');
  const [paymentDescription, setPaymentDescription] = useState('Get premium content');
  const [paymentResource, setPaymentResource] = useState('http://localhost:4000/premium');

  const [validationErrors, setValidationErrors] = useState({
    paymentTo: '',
    paymentValue: '',
    paymentDescription: '',
    paymentResource: '',
  });

  // Effects
  const chainName = getChainName(chainInfo?.providerChainIdDecimal);

  useEffect(() => {
    if (currentStep > 0 && activeScenario) {
      setIsTrackingModalOpen(true);
    }
  }, [currentStep, activeScenario, steps]);

  const validateInputs = (): boolean => {
    const errors = {
      paymentTo: '',
      paymentValue: '',
      paymentDescription: '',
      paymentResource: '',
    };

    if (!isValidAddress(paymentTo)) {
      errors.paymentTo = 'Invalid Ethereum address';
    }
    if (!isValidAmount(paymentValue)) {
      errors.paymentValue = 'Invalid amount';
    }
    if (!paymentDescription.trim()) {
      errors.paymentDescription = 'Description is required';
    }
    if (!isValidUrl(paymentResource)) {
      errors.paymentResource = 'Invalid URL';
    }

    setValidationErrors(errors);
    return Object.values(errors).every(error => error === '');
  };

  // Handlers
  const switchToSepolia = useCallback(async () => {
    if (isSwitchingToSepolia) return;
    setIsSwitchingToSepolia(true);
    try {
      await switchNetwork(embeddedWallet!, 11155111);
    } finally {
      setIsSwitchingToSepolia(false);
    }
  }, [embeddedWallet, isSwitchingToSepolia]);

  const handleEnableSmartAccount = useCallback(async () => {
    // Check if balance is sufficient (> 0 ETH)
    const currentBalance = parseFloat(balance);
    if (currentBalance <= 0) {
      toast.error('Insufficient balance. You need some ETH to authorize the smart account.');
      return false;
    }

    try {
      return await enableSmartAccount();
    } catch (error) {
      console.error('Failed to enable smart account:', error);
      return false;
    }
  }, [balance, enableSmartAccount]);

  const handleModalClose = (open: boolean) => {
    setIsTrackingModalOpen(open);
    if (!open) {
      setActiveScenario(null);
      resetSteps();
    }
  };

  if (!isReady || !isAuthenticated || !walletsReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">Loading...</div>
          <div className="text-muted-foreground">Initializing your account</div>
        </div>
      </div>
    );
  }

  const isWrongNetwork = chainInfo && chainInfo.providerChainIdDecimal !== 11155111;

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1 className="text-xl font-semibold">X402 Payment Settlement</h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">{formatAddress(embeddedWallet?.address)}</span>
              <Button onClick={() => navigate('/test-client')} variant="outline" size="sm">
                <TestTube2 className="mr-2 h-4 w-4" />Test Client
              </Button>
              <Button onClick={() => logout()} variant="outline" size="sm">
                <LogOut className="mr-2 h-4 w-4" />Disconnect
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Wrong Network Warning */}
        {isWrongNetwork && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Wrong Network</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  You're currently on {chainName}. Please switch to Sepolia to use this application.
                </p>
              </div>
              <Button
                onClick={switchToSepolia}
                disabled={isSwitchingToSepolia}
                size="sm"
                variant="outline"
              >
                {isSwitchingToSepolia ? 'Switching...' : 'Switch to Sepolia'}
              </Button>
            </div>
          </div>
        )}

        {/* Account Management Section */}
        <AccountManagement
          embeddedWallet={embeddedWallet}
          balance={balance}
          balanceLoading={balanceLoading}
          chainInfo={chainInfo}
          isSwitching={isSwitching}
          isRefreshing={isRefreshing}
          refetch={refetch}
          smartContractAddress={smartContractAddress}
          isAuthorized={isAuthorized}
          smartAccountEnabled={smartAccountEnabled}
          authLoading={authLoading}
          authError={authError}
          enableSmartAccount={handleEnableSmartAccount}
          refreshStatus={refreshStatus}
          isAuthenticated={isAuthenticated}
          isReady={isReady}
          walletsReady={walletsReady}
          usdcBalance={usdcBalance}
          isLoadingUSDC={isLoadingUSDC}
          refetchUSDC={refetchUSDC}
          mintUSDC={mintUSDC}
          isMintingUSDC={isMintingUSDC}
          switchToSepolia={switchToSepolia}
          isSwitchingToSepolia={isSwitchingToSepolia}
          copied={copied}
          setCopied={setCopied}
          copiedSmart={copiedSmart}
          setCopiedSmart={setCopiedSmart}
          setIsRefreshing={setIsRefreshing}
        />

        {/* Workflow Execution Section */}
        <PaymentExecution
          isAuthorized={isAuthorized}
          currentStep={currentStep}
          activeScenario={activeScenario}
          paymentTo={paymentTo}
          paymentValue={paymentValue}
          paymentDescription={paymentDescription}
          paymentResource={paymentResource}
          validationErrors={validationErrors}
          executeWorkflow={executeWorkflow}
          mintUSDC={mintUSDC}
          isMintingUSDC={isMintingUSDC}
          usdcBalance={usdcBalance}
          isLoadingUSDC={isLoadingUSDC}
          refetchUSDC={refetchUSDC}
          balance={balance}
          onPaymentToChange={setPaymentTo}
          onPaymentValueChange={setPaymentValue}
          onPaymentDescriptionChange={setPaymentDescription}
          onPaymentResourceChange={setPaymentResource}
          onActiveScenarioChange={setActiveScenario}
          validateInputs={validateInputs}
        />

        {/* Workflow Tracking Modal */}
        <WorkflowTrackingModal
          isOpen={isTrackingModalOpen}
          onClose={handleModalClose}
          activeScenario={activeScenario}
          steps={steps}
          workflowError={workflowError}
          resetSteps={resetSteps}
          currentStep={currentStep}
        />
      </main>
    </div>
  );
};

export default Dashboard;
