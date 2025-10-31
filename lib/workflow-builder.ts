import type { WorkflowDSL, WorkflowStep } from './krnl-client';
import type { PaymentPayload, PaymentRequirements } from 'x402/types';

// Helper to safely stringify with circular reference handling
function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    return String(obj);
  }
}

export interface X402WorkflowParams {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
  sender: string;
  delegate: string;
  chainId: number;
  facilitatorUrl: string;
  targetContract?: string;
  attestorImage: string;
  rpcUrl: string;
  bundlerUrl?: string;
  paymasterUrl?: string;
}

/**
 * Build KRNL workflow DSL for atomic x402 verify + settle
 * 
 * This creates a workflow that:
 * 1. Calls /verify endpoint to validate payment
 * 2. If valid, atomically settles on-chain
 * 3. Returns combined result
 */
export function buildX402VerifySettleWorkflow(params: X402WorkflowParams): WorkflowDSL {
  const {
    paymentPayload,
    paymentRequirements,
    sender,
    delegate,
    chainId,
    facilitatorUrl,
    targetContract,
    attestorImage,
    rpcUrl,
    bundlerUrl,
    paymasterUrl,
  } = params;

  // Step 1: Call verify endpoint
  const verifyStep: WorkflowStep = {
    name: 'x402-verify-payment',
    image: 'ghcr.io/krnl-labs/executor-http@sha256:07ef35b261014304a0163502a7f1dec5395c5cac1fc381dc1f79b052389ab0d5',
    attestor: attestorImage,
    next: 'x402-check-validity',
    inputs: {
      url: `${facilitatorUrl}/facilitator/verify`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        paymentPayload,
        paymentRequirements,
      },
      timeout: 30,
    },
    outputs: [
      {
        name: 'isValid',
        value: 'response.body.isValid',
        type: 'boolean',
        required: true,
        export: true,
      },
      {
        name: 'payer',
        value: 'response.body.payer',
        type: 'string',
        required: false,
        export: true,
      },
      {
        name: 'invalidReason',
        value: 'response.body.invalidReason',
        type: 'string',
        required: false,
        export: true,
      },
    ],
  };

  // Step 2: Conditional check - only proceed if valid
  const checkValidityStep: WorkflowStep = {
    name: 'x402-check-validity',
    image: 'ghcr.io/krnl-labs/executor-conditional@sha256:placeholder', // Use actual conditional executor
    attestor: attestorImage,
    next: 'x402-settle-payment',
    inputs: {
      condition: '${x402-verify-payment.isValid} == true',
      onTrue: 'x402-settle-payment',
      onFalse: 'x402-return-invalid',
    },
    outputs: [
      {
        name: 'result',
        value: 'result',
        required: true,
        export: true,
      },
    ],
  };

  // Step 3: Settle payment on-chain (only if valid)
  const settleStep: WorkflowStep = {
    name: 'x402-settle-payment',
    image: 'ghcr.io/krnl-labs/executor-evm-transaction@sha256:placeholder', // Use actual EVM executor
    attestor: attestorImage,
    next: 'x402-confirm-settlement',
    inputs: {
      network: paymentRequirements.network,
      paymentPayload: JSON.stringify(paymentPayload),
      paymentRequirements: JSON.stringify(paymentRequirements),
      privateKey: '${_SECRETS.PRIVATE_KEY}', // From KRNL secrets
    },
    outputs: [
      {
        name: 'transactionHash',
        value: 'transaction.hash',
        type: 'string',
        required: true,
        export: true,
      },
      {
        name: 'success',
        value: 'transaction.success',
        type: 'boolean',
        required: true,
        export: true,
      },
    ],
  };

  // Step 4: Confirm settlement
  const confirmSettlementStep: WorkflowStep = {
    name: 'x402-confirm-settlement',
    image: 'ghcr.io/krnl-labs/executor-http@sha256:07ef35b261014304a0163502a7f1dec5395c5cac1fc381dc1f79b052389ab0d5',
    attestor: attestorImage,
    inputs: {
      url: `${facilitatorUrl}/facilitator/settlement-status`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        transactionHash: '${x402-settle-payment.transactionHash}',
        network: paymentRequirements.network,
      },
      timeout: 30,
    },
    outputs: [
      {
        name: 'confirmed',
        value: 'response.body.confirmed',
        type: 'boolean',
        required: true,
        export: true,
      },
      {
        name: 'blockNumber',
        value: 'response.body.blockNumber',
        type: 'number',
        required: false,
        export: true,
      },
    ],
  };

  // Build the complete workflow DSL
  const workflow: WorkflowDSL = {
    chain_id: chainId,
    sender,
    delegate,
    attestor: attestorImage,
    target: {
      contract: targetContract || '0x0000000000000000000000000000000000000000',
      function: 'x402VerifyAndSettle(bytes,bytes)',
      authData_result: '${x402-settle-payment.result}',
      parameters: [],
    },
    sponsor_execution_fee: true,
    value: '0',
    intent: {
      id: '0x0000000000000000000000000000000000000000000000000000000000000000', // Will be set by caller
      signature: '0x', // Will be set by caller
      deadline: Math.floor(Date.now() / 1000 + 3600).toString(),
    },
    rpc_url: rpcUrl,
    bundler_url: bundlerUrl,
    paymaster_url: paymasterUrl,
    gas_limit: '500000',
    max_fee_per_gas: '20000000000',
    max_priority_fee_per_gas: '2000000000',
    workflow: {
      name: 'x402-verify-settle-atomic',
      version: 'v1.0.0',
      steps: [verifyStep, checkValidityStep, settleStep, confirmSettlementStep],
    },
  };

  return workflow;
}

/**
 * Simplified workflow that just does verify + settle without complex conditional logic
 * Uses the facilitator's internal verify and settle logic
 */
export function buildSimpleX402Workflow(params: X402WorkflowParams): WorkflowDSL {
  const {
    paymentPayload,
    paymentRequirements,
    sender,
    delegate,
    chainId,
    attestorImage,
    rpcUrl,
    bundlerUrl,
    paymasterUrl,
  } = params;

  // Single atomic step that handles both verify and settle
  const verifyAndSettleStep: WorkflowStep = {
    name: 'x402-atomic-verify-settle',
    image: 'ghcr.io/krnl-labs/executor-x402@sha256:placeholder', // Custom x402 executor
    attestor: attestorImage,
    inputs: {
      paymentPayload: JSON.stringify(paymentPayload),
      paymentRequirements: JSON.stringify(paymentRequirements),
      network: paymentRequirements.network,
      privateKey: '${_SECRETS.PRIVATE_KEY}',
      solanaPrivateKey: '${_SECRETS.SOLANA_PRIVATE_KEY}',
    },
    outputs: [
      {
        name: 'isValid',
        value: 'result.isValid',
        type: 'boolean',
        required: true,
        export: true,
      },
      {
        name: 'transactionHash',
        value: 'result.transactionHash',
        type: 'string',
        required: false,
        export: true,
      },
      {
        name: 'settled',
        value: 'result.settled',
        type: 'boolean',
        required: true,
        export: true,
      },
    ],
  };

  const workflow: WorkflowDSL = {
    chain_id: chainId,
    sender,
    delegate,
    attestor: attestorImage,
    target: {
      contract: '0x0000000000000000000000000000000000000000',
      function: 'x402Complete(bytes)',
      authData_result: '${x402-atomic-verify-settle.result}',
      parameters: [],
    },
    sponsor_execution_fee: true,
    value: '0',
    intent: {
      id: '0x0000000000000000000000000000000000000000000000000000000000000000',
      signature: '0x',
      deadline: Math.floor(Date.now() / 1000 + 3600).toString(),
    },
    rpc_url: rpcUrl,
    bundler_url: bundlerUrl,
    paymaster_url: paymasterUrl,
    gas_limit: '500000',
    max_fee_per_gas: '20000000000',
    max_priority_fee_per_gas: '2000000000',
    workflow: {
      name: 'x402-atomic-operation',
      version: 'v1.0.0',
      steps: [verifyAndSettleStep],
    },
  };

  return workflow;
}
