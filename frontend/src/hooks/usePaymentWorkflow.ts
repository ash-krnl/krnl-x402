import { useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import toast from 'react-hot-toast';
import {
  encodePacked,
  keccak256,
  createPublicClient,
  createWalletClient,
  http,
  custom,
  getContract,
  maxUint256,
  type Hex,
  type Address
} from 'viem';
import { polygonAmoy } from 'viem/chains';
import { useKRNL, useNodeConfig, type TransactionIntentParams, type PrivyEmbeddedWallet, type WorkflowObject } from '@krnl-dev/sdk-react-7702';
import testScenarioData from '../test-scenario.json';
import PaymentContractABI from '../contracts/PaymentContract.abi.json';
import ERC20ABI from '../contracts/ERC20.abi.json';
import { RPC_URL, TARGET_CONTRACT_OWNER, PAYMENT_CONTRACT_ADDRESS, MOCK_USDC_ADDRESS, ATTESTOR_IMAGE, DEFAULT_CHAIN_ID, VERIFY_URL } from '../const';
import type { ABIInput, ABIFunction } from '../types';


export const usePaymentWorkflow = () => {
  const { wallets } = useWallets();
  const {
    signTransactionIntent,
    executeWorkflowFromTemplate,
    resetSteps,
    error: sdkError,
    statusCode,
    steps,
    currentStep
  } = useKRNL();
  const { getConfig } = useNodeConfig();
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);


  const getEmbeddedWallet = (): PrivyEmbeddedWallet => {
    const embeddedWallet = wallets.find(w => w.connectorType === 'embedded' && w.walletClientType === 'privy');
    if (!embeddedWallet?.address) throw new Error('No embedded wallet found');
    return embeddedWallet;
  };

  const handleUSDCApproval = async (embeddedWallet: PrivyEmbeddedWallet) => {
    if (!MOCK_USDC_ADDRESS || !PAYMENT_CONTRACT_ADDRESS) {
      throw new Error('Missing contract addresses');
    }

    const publicClient = createPublicClient({
      chain: polygonAmoy,
      transport: http(RPC_URL)
    });

    const usdcContract = getContract({
      address: MOCK_USDC_ADDRESS as `0x${string}`,
      abi: ERC20ABI,
      client: publicClient
    });

    const currentAllowance = await usdcContract.read.allowance([
      embeddedWallet.address as `0x${string}`,
      PAYMENT_CONTRACT_ADDRESS as `0x${string}`
    ]) as bigint;

    if (currentAllowance === 0n) {
      const provider = await embeddedWallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account: embeddedWallet.address as `0x${string}`,
        chain: polygonAmoy,
        transport: custom(provider)
      });

      const { request } = await publicClient.simulateContract({
        address: MOCK_USDC_ADDRESS as `0x${string}`,
        abi: ERC20ABI,
        functionName: 'approve',
        args: [PAYMENT_CONTRACT_ADDRESS as `0x${string}`, maxUint256],
        account: embeddedWallet.address as `0x${string}`
      });

      await walletClient.writeContract(request);
    }
  };

  const getContractNonce = async (embeddedWallet: PrivyEmbeddedWallet): Promise<bigint> => {
    const client = createPublicClient({
      chain: polygonAmoy,
      transport: http(RPC_URL)
    });

    const contract = getContract({
      address: PAYMENT_CONTRACT_ADDRESS as `0x${string}`,
      abi: PaymentContractABI,
      client
    });

    return await contract.read.nonces([embeddedWallet.address]) as bigint;
  };

  const buildTypeString = (input: ABIInput): string => {
    if (input.type === 'tuple') {
      const components = input.components?.map((comp) => buildTypeString(comp)).join(',') || '';
      return `(${components})`;
    } else if (input.type === 'tuple[]') {
      const components = input.components?.map((comp) => buildTypeString(comp)).join(',') || '';
      return `(${components})[]`;
    } else {
      return input.type;
    }
  };

  const getFunctionSelector = (): string => {
    const targetFunctionName = 'executePayment';

    const targetFunctionSelector = (PaymentContractABI as ABIFunction[]).find(
      (item) => item.type === 'function' && item.name === targetFunctionName
    );
    if (!targetFunctionSelector) {
      throw new Error(`Function ${targetFunctionName} not found in ABI`);
    }

    const functionSig = `${targetFunctionName}(${targetFunctionSelector.inputs.map((input) => buildTypeString(input)).join(',')})`;
    const functionSelectorBytes = keccak256(encodePacked(['string'], [functionSig])).slice(0, 10);

    if (functionSelectorBytes.length !== 10) {
      throw new Error(`Invalid function selector length: ${functionSelectorBytes.length}`);
    }

    return functionSelectorBytes;
  };

  const createTransactionIntent = (embeddedWallet: PrivyEmbeddedWallet, nonce: bigint, nodeAddress: string): TransactionIntentParams => {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const functionSelector = getFunctionSelector();

    const intentId = keccak256(encodePacked(
      ['address', 'uint256', 'uint256'],
      [embeddedWallet.address as `0x${string}`, nonce, BigInt(deadline)]
    )) as `0x${string}`;

    return {
      target: PAYMENT_CONTRACT_ADDRESS as `0x${string}`,
      value: BigInt(0),
      id: intentId,
      nodeAddress: nodeAddress as `0x${string}`,
      delegate: TARGET_CONTRACT_OWNER as `0x${string}`,
      targetFunction: functionSelector as `0x${string}`,
      nonce,
      deadline: BigInt(deadline)
    };
  };

  const createTemplateReplacements = (
    embeddedWallet: PrivyEmbeddedWallet,
    transactionIntent: TransactionIntentParams,
    signature: string,
    paymentDetails?: {
      from?: string;
      to?: string;
      value?: string;
      nonce?: string;
      signature?: string;
      validAfter?: string;
      validBefore?: string;
      description?: string;
      resource?: string;
    }
  ): Record<string, string> => {
    return {
      '{{ENV.SENDER_ADDRESS}}': embeddedWallet.address,
      '{{ENV.TARGET_CONTRACT}}': PAYMENT_CONTRACT_ADDRESS || '',
      '{{ENV.ATTESTOR_IMAGE}}': ATTESTOR_IMAGE || '',
      '{{USER_SIGNATURE}}': signature,
      '{{TRANSACTION_INTENT_VALUE}}': transactionIntent.value.toString(),
      '{{TRANSACTION_INTENT_ID}}': transactionIntent.id,
      '{{TRANSACTION_INTENT_DELEGATE}}': transactionIntent.delegate,
      '{{TRANSACTION_INTENT_DEADLINE}}': transactionIntent.deadline.toString(),
      '{{VERIFY_URL}}': VERIFY_URL || '',
      '{{PAYMENT_FROM}}': paymentDetails?.from || '',
      '{{PAYMENT_TO}}': paymentDetails?.to || '',
      '{{PAYMENT_VALUE}}': paymentDetails?.value || '',
      '{{PAYMENT_NONCE}}': paymentDetails?.nonce || '',
      '{{PAYMENT_SIGNATURE}}': paymentDetails?.signature || '',
      '{{PAYMENT_VALID_AFTER}}': paymentDetails?.validAfter || '',
      '{{PAYMENT_VALID_BEFORE}}': paymentDetails?.validBefore || '',
      '{{PAYMENT_ASSET}}': MOCK_USDC_ADDRESS || '',
      '{{PAYMENT_DESCRIPTION}}': paymentDetails?.description || '',
      '{{PAYMENT_RESOURCE}}': paymentDetails?.resource || '',
    };
  };


  /**
   * Generate a random nonce for payment authorization
   */
  const createPaymentNonce = (): Hex => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return `0x${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as Hex;
  };

  /**
   * Sign payment authorization using EIP-712 (EIP-3009 TransferWithAuthorization)
   * This matches the USDC transferWithAuthorization signature format
   */
  const signPaymentAuthorization = async (
    embeddedWallet: PrivyEmbeddedWallet,
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    },
    asset: Address
  ): Promise<Hex> => {
    const provider = await embeddedWallet.getEthereumProvider();
    const walletClient = createWalletClient({
      account: embeddedWallet.address as Address,
      chain: polygonAmoy,
      transport: custom(provider)
    });

    // EIP-712 domain for USDC (EIP-3009)
    // Must match the USDC contract's domain
    const domain = {
      name: 'USDC',
      version: '2',
      chainId: DEFAULT_CHAIN_ID,
      verifyingContract: asset,
    } as const;

    // EIP-3009 TransferWithAuthorization type
    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    } as const;

    const signature = await walletClient.signTypedData({
      domain,
      types,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce,
      },
    });

    return signature;
  };

  const executePaymentWorkflow = async (
    paymentDetails?: {
      to: string;
      value: string;
      description: string;
      resource: string;
    }
  ) => {
    // Prevent concurrent executions
    if (isExecuting) {
      console.warn('⚠️  Workflow execution already in progress, ignoring duplicate request');
      return;
    }

    setIsExecuting(true);
    setError(null);
    resetSteps();

    try {
      const embeddedWallet = getEmbeddedWallet();
      await embeddedWallet.switchChain?.(80002);

      // Generate payment authorization details
      const paymentNonce = createPaymentNonce();
      const currentTime = Math.floor(Date.now() / 1000);
      const validAfter = (currentTime - 600).toString(); // 10 minutes before
      const validBefore = (currentTime + 660).toString(); // 11 minutes after (max timeout)

      const paymentAuthorization = {
        from: embeddedWallet.address as Address,
        to: paymentDetails?.to as Address || embeddedWallet.address as Address,
        value: paymentDetails?.value || '0',
        validAfter,
        validBefore,
        nonce: paymentNonce,
      };

      // Sign the payment authorization
      console.log('📝 Signing payment authorization...');
      const paymentSignature = await signPaymentAuthorization(
        embeddedWallet,
        paymentAuthorization,
        MOCK_USDC_ADDRESS as Address
      );
      console.log('✍️  Payment signature:', paymentSignature.slice(0, 10) + '...');

      await handleUSDCApproval(embeddedWallet);

      const nodeConfig = await getConfig();
      if (!nodeConfig.workflow.node_address) {
        throw new Error('Node address not available from KRNL node configuration.');
      }

      const nonce = await getContractNonce(embeddedWallet);
      const transactionIntent = createTransactionIntent(embeddedWallet, nonce, nodeConfig.workflow.node_address);
      const signature = await signTransactionIntent(transactionIntent);

      const replacements = createTemplateReplacements(
        embeddedWallet,
        transactionIntent,
        signature,
        {
          ...paymentDetails,
          from: paymentAuthorization.from,
          nonce: paymentAuthorization.nonce,
          signature: paymentSignature,
          validAfter: paymentAuthorization.validAfter,
          validBefore: paymentAuthorization.validBefore,
        }
      );

      await executeWorkflowFromTemplate(testScenarioData as WorkflowObject, replacements);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Workflow execution failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsExecuting(false);
    }
  };

  return {
    executeWorkflow: executePaymentWorkflow,
    resetSteps,
    error: error || sdkError,
    statusCode,
    steps,
    currentStep
  };
};
