import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import {
  encodePacked,
  keccak256,
  createPublicClient,
  http,
  type Hex,
  type Address
} from 'viem';
import { sepolia } from 'viem/chains';
import { useKRNL, useNodeConfig, type PrivyEmbeddedWallet } from '@krnl-dev/sdk-react-7702';
import { RPC_URL, TARGET_CONTRACT_OWNER, PAYMENT_CONTRACT_ADDRESS } from '../const';

const TEST_SERVER_URL = 'http://localhost:4000';

// NOTE: To enable x402-fetch, run: cd frontend && npm install ../x402/typescript/packages/x402-fetch
// import { wrapFetchWithPayment } from '@krnl-dev/x402-fetch';

interface TransactionIntentParams {
  target: Hex;
  value: bigint;
  id: Hex;
  nodeAddress: Hex;
  delegate: Hex;
  targetFunction: Hex;
  nonce: bigint;
  deadline: bigint;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'error' | 'warning';
  message: string;
  data?: any;
}

export default function TestClient() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signTransactionIntent } = useKRNL();
  const { getConfig } = useNodeConfig();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === 'privy') as PrivyEmbeddedWallet | undefined;

  const addLog = (level: LogEntry['level'], message: string, data?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, level, message, data }]);
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
  };

  const getContractNonce = async (
    targetContractAddress: Address,
    senderAddress: Address
  ): Promise<bigint> => {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL),
    });
    
    const NONCES_ABI = [{
      name: 'nonces',
      type: 'function',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: 'nonce', type: 'uint256' }],
    }] as const;
    
    try {
      const nonce = await client.readContract({
        address: targetContractAddress,
        abi: NONCES_ABI,
        functionName: 'nonces',
        args: [senderAddress],
      });
      return nonce as bigint;
    } catch (error) {
      addLog('warning', 'Failed to read contract nonce, using 0', error);
      return 0n;
    }
  };

  const getFunctionSelector = (): Hex => {
    const functionSignature = 'executePayment((uint256,uint256,bytes32,(bytes32,bytes,bytes)[],bytes,bool,bytes))';
    const hash = keccak256(Buffer.from(functionSignature));
    return hash.slice(0, 10) as Hex;
  };

  const createTransactionIntent = (
    address: Address,
    nonce: bigint,
    targetContract: Address,
    delegate: Address,
    nodeAddress: Address
  ): TransactionIntentParams => {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const functionSelector = getFunctionSelector();
    
    const intentId = keccak256(encodePacked(
      ['address', 'uint256', 'uint256'],
      [address, nonce, BigInt(deadline)]
    )) as Hex;
    
    return {
      target: targetContract,
      value: BigInt(0),
      id: intentId,
      nodeAddress,
      delegate,
      targetFunction: functionSelector,
      nonce,
      deadline: BigInt(deadline)
    };
  };

  const signIntentManually = async (
    wallet: PrivyEmbeddedWallet,
    intentParams: TransactionIntentParams
  ): Promise<Hex> => {
    const targetFunctionBytes = intentParams.targetFunction.slice(0, 10) as Hex;
    
    const intentHash = keccak256(
      encodePacked(
        ['address', 'uint256', 'bytes32', 'address', 'address', 'bytes4', 'uint256', 'uint256'],
        [
          intentParams.target,
          intentParams.value,
          intentParams.id,
          intentParams.nodeAddress,
          intentParams.delegate,
          targetFunctionBytes,
          intentParams.nonce,
          intentParams.deadline
        ]
      )
    );
    
    addLog('info', 'Signing intent hash', { intentHash });
    
    const provider = await wallet.getEthereumProvider();
    const signature = await provider.request({
      method: 'personal_sign',
      params: [intentHash, wallet.address],
    }) as Hex;
    
    return signature;
  };

  const createPaymentAuthorization = async (wallet: PrivyEmbeddedWallet) => {
    const from = wallet.address as Address;
    const to = TARGET_CONTRACT_OWNER as Address; // Merchant/payee
    const value = '10000'; // 0.01 USDC
    const validAfter = Math.floor(Date.now() / 1000) - 60;
    const validBefore = validAfter + 660;
    const nonce = keccak256(encodePacked(['uint256'], [BigInt(Date.now())]));
    
    // Sign EIP-3009 authorization
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: 11155111,
      verifyingContract: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
    };
    
    const types = {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' }
      ]
    };
    
    const message = {
      from,
      to,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce
    };
    
    addLog('info', 'Signing EIP-3009 authorization', { domain, message });
    
    const provider = await wallet.getEthereumProvider();
    const signature = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [
        wallet.address,
        JSON.stringify({ domain, types, primaryType: 'TransferWithAuthorization', message })
      ]
    }) as Hex;
    
    return {
      authorization: {
        from,
        to,
        value,
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce
      },
      signature
    };
  };

  const runTest = async () => {
    if (!embeddedWallet) {
      addLog('error', 'No embedded wallet found');
      return;
    }

    setLoading(true);
    setLogs([]);
    setResult(null);

    try {
      addLog('info', '🚀 Starting x402 test flow...');
      addLog('info', `User wallet: ${embeddedWallet.address}`);
      addLog('info', `Test server: ${TEST_SERVER_URL}`);
      addLog('info', `Target contract: ${PAYMENT_CONTRACT_ADDRESS}`);
      addLog('info', `Delegate: ${TARGET_CONTRACT_OWNER}`);

      // Step 1: Request protected resource (will get 402)
      addLog('info', '📝 Step 1: Requesting protected resource /premium...');
      const initialResponse = await fetch(`${TEST_SERVER_URL}/premium`, {
        method: 'GET',
      });

      addLog('info', `Response status: ${initialResponse.status}`);

      if (initialResponse.status !== 402) {
        throw new Error(`Expected 402, got ${initialResponse.status}`);
      }

      // Step 2: Parse payment requirements from 402 response body
      addLog('success', 'Got 402 Payment Required');
      
      // Log raw response for debugging
      const responseText = await initialResponse.text();
      addLog('info', 'Raw 402 response', responseText);
      
      let responseBody;
      try {
        responseBody = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Failed to parse 402 response as JSON: ${responseText}`);
      }
      
      addLog('info', '402 Response body', responseBody);
      
      const paymentRequirements = responseBody.accepts?.[0];
      
      if (!paymentRequirements) {
        throw new Error(`No payment requirements in 402 response. Body: ${JSON.stringify(responseBody)}`);
      }

      addLog('success', 'Payment requirements', paymentRequirements);

      // Step 3: Get KRNL node config using SDK
      addLog('info', '📝 Step 2: Getting KRNL node configuration...');
      const nodeConfig = await getConfig();
      const nodeAddress = nodeConfig?.workflow?.node_address as Address;
      
      if (!nodeAddress) {
        throw new Error(`Failed to get KRNL node address from config`);
      }
      addLog('success', `Node address: ${nodeAddress}`);

      // Step 4: Get contract nonce for transaction intent
      addLog('info', '📝 Step 3: Getting contract nonce...');
      const nonce = await getContractNonce(
        PAYMENT_CONTRACT_ADDRESS as Address,
        embeddedWallet.address as Address
      );
      addLog('success', `Contract nonce: ${nonce}`);

      // Step 5: Create and sign transaction intent using SDK
      addLog('info', '📝 Step 4: Creating transaction intent...');
      const intentParams = createTransactionIntent(
        embeddedWallet.address as Address,
        nonce,
        PAYMENT_CONTRACT_ADDRESS as Address,
        TARGET_CONTRACT_OWNER as Address,
        nodeAddress
      );
      addLog('success', 'Transaction intent created', intentParams);

      addLog('info', '📝 Step 5: Signing transaction intent with SDK...');
      const intentSignature = await signTransactionIntent(intentParams);
      addLog('success', `Intent signature: ${intentSignature.slice(0, 20)}...`);

      // Step 6: Create and sign payment authorization (EIP-3009)
      addLog('info', '📝 Step 6: Creating EIP-3009 payment authorization...');
      const from = embeddedWallet.address as Address;
      const to = paymentRequirements.payTo as Address;
      const value = paymentRequirements.maxAmountRequired;
      const validAfter = Math.floor(Date.now() / 1000) - 60;
      const validBefore = validAfter + 660;
      const paymentNonce = keccak256(encodePacked(['uint256'], [BigInt(Date.now())]));
      
      const domain = {
        name: paymentRequirements.extra?.name || 'USD Coin',
        version: paymentRequirements.extra?.version || '2',
        chainId: 11155111,
        verifyingContract: paymentRequirements.asset
      };
      
      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' }
        ]
      };
      
      const message = {
        from,
        to,
        value: BigInt(value),
        validAfter: BigInt(validAfter),
        validBefore: BigInt(validBefore),
        nonce: paymentNonce
      };
      
      addLog('info', 'Signing EIP-3009', { domain, message });
      
      const provider = await embeddedWallet.getEthereumProvider();
      const paymentSignature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [
          embeddedWallet.address,
          JSON.stringify({ domain, types, primaryType: 'TransferWithAuthorization', message })
        ]
      }) as Hex;
      
      addLog('success', `Payment signature: ${paymentSignature.slice(0, 20)}...`);

      // Step 7: Retry request with payment header
      addLog('info', '📝 Step 7: Retrying request with X-Payment header...');
      
      const paymentPayload = {
        network: 'sepolia',
        scheme: 'exact',
        x402Version: 1,
        payload: {
          authorization: {
            from,
            to,
            value,
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce: paymentNonce
          },
          signature: paymentSignature,
          // KRNL intent fields (required by facilitator)
          intentSignature,
          intentId: intentParams.id,
          intentDeadline: intentParams.deadline.toString(),
          intentDelegate: intentParams.delegate,
          intentTarget: intentParams.target
        }
      };
      
      addLog('info', 'Payment payload', paymentPayload);
      
      const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      
      const paidResponse = await fetch(`${TEST_SERVER_URL}/premium`, {
        method: 'GET',
        headers: {
          'X-Payment': paymentHeader
        }
      });

      addLog('info', `Response status: ${paidResponse.status}`);
      
      if (!paidResponse.ok) {
        const errorText = await paidResponse.text();
        throw new Error(`Request failed: ${paidResponse.status} - ${errorText}`);
      }

      const data = await paidResponse.json();
      addLog('success', 'Got response data', data);
      
      const paymentResponseHeader = paidResponse.headers.get('X-Payment-Response');
      if (paymentResponseHeader) {
        const paymentResponse = JSON.parse(
          Buffer.from(paymentResponseHeader, 'base64').toString()
        );
        addLog('success', 'Payment response', paymentResponse);
      }

      setResult(data);
      addLog('success', '✅ Test completed successfully!');

    } catch (error: any) {
      addLog('error', `Error: ${error.message}`, error);
      setResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const getLogIcon = (level: LogEntry['level']) => {
    switch (level) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <AlertCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  if (!ready || !authenticated) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <p>Please log in to use the test client.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Card>
        <CardHeader>
          <CardTitle>Test Client - Manual Flow</CardTitle>
          <CardDescription>
            This page mimics the test client's manual construction of signatures and API calls.
            Use this to debug differences between SDK and manual approaches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              onClick={runTest}
              disabled={loading || !embeddedWallet}
              className="w-full"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run Test Flow
            </Button>
          </div>

          {embeddedWallet && (
            <Card>
              <CardContent className="p-4">
                <p><strong>Wallet:</strong> {embeddedWallet.address}</p>
              </CardContent>
            </Card>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Execution Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
                  {logs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded bg-slate-50">
                      {getLogIcon(log.level)}
                      <div className="flex-1">
                        <span className="text-slate-500">[{log.timestamp}]</span>{' '}
                        <span className="font-semibold">{log.message}</span>
                        {log.data && (
                          <pre className="mt-1 text-xs bg-slate-100 p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Final Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-slate-50 p-4 rounded overflow-x-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
