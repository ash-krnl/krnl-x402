import axios, { AxiosInstance } from 'axios';

export interface KRNLNodeConfig {
  nodeUrl: string;
  rpcUrl: string;
  bundlerUrl?: string;
  paymasterUrl?: string;
}

export interface WorkflowStep {
  name: string;
  image: string;
  attestor: string;
  next?: string;
  inputs: Record<string, any>;
  outputs?: Array<{
    name: string;
    value: string;
    type?: string;
    required?: boolean;
    export?: boolean;
  }>;
  config?: Record<string, any>;
}

export interface WorkflowDSL {
  chain_id: number;
  sender: string;
  delegate: string;
  attestor: string;
  target: {
    contract: string;
    function: string;
    authData_result: string;
    parameters: Array<{
      name: string;
      type: string;
      value: string;
    }>;
  };
  sponsor_execution_fee: boolean;
  value: string;
  intent: {
    id: string;
    signature: string;
    deadline: string;
  };
  rpc_url: string;
  bundler_url?: string;
  paymaster_url?: string;
  gas_limit: string;
  max_fee_per_gas: string;
  max_priority_fee_per_gas: string;
  workflow: {
    name: string;
    version: string;
    steps: WorkflowStep[];
  };
}

export interface KRNLExecutionResult {
  success: boolean;
  workflowId?: string;
  transactionHash?: string;
  result?: any;
  error?: string;
  steps?: Array<{
    name: string;
    status: 'completed' | 'failed' | 'pending';
    output?: any;
  }>;
}

export interface WorkflowStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  workflowId: string;
  result?: any;
  error?: string;
  transactionHash?: string;
  steps?: Array<{
    name: string;
    status: 'completed' | 'failed' | 'pending' | 'running';
    output?: any;
  }>;
}

/**
 * KRNL Node JSON-RPC Client
 * Handles communication with KRNL node for atomic workflow execution
 */
export class KRNLClient {
  private client: AxiosInstance;
  private config: KRNLNodeConfig;

  constructor(config: KRNLNodeConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.nodeUrl,
      timeout: 60000, // 60s timeout for workflow execution
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Execute a workflow on KRNL node via JSON-RPC
   * Returns immediately with workflow ID for async polling
   */
  async executeWorkflow(workflowDSL: WorkflowDSL): Promise<KRNLExecutionResult> {
    try {
      console.log(`📤 Sending workflow to KRNL node: ${this.config.nodeUrl}`);
      console.log(`📋 Workflow DSL:`, JSON.stringify(workflowDSL, null, 2));
      
      const response = await this.client.post('', {
        jsonrpc: '2.0',
        method: 'krnl_executeWorkflow',
        params: [workflowDSL],
        id: Date.now(),
      });

      console.log(`📥 KRNL response:`, JSON.stringify(response.data, null, 2));

      if (response.data.error) {
        console.error(`❌ KRNL returned error:`, response.data.error);
        return {
          success: false,
          error: response.data.error.message || JSON.stringify(response.data.error),
        };
      }

      // Extract intentId and requestId from response
      const intentId = response.data.result?.intentId;
      const requestId = response.data.result?.requestId;
      const accepted = response.data.result?.admissionResult?.accepted;

      if (!accepted) {
        const reason = response.data.result?.admissionResult?.reason || 'Workflow rejected';
        console.error(`❌ KRNL rejected workflow:`, reason);
        return {
          success: false,
          error: reason,
        };
      }

      console.log(`✅ Workflow accepted - intentId: ${intentId}, requestId: ${requestId}`);

      return {
        success: true,
        workflowId: intentId, // Use intentId for polling
        result: response.data.result,
        transactionHash: response.data.result?.transactionHash,
        steps: response.data.result?.steps,
      };
    } catch (error) {
      console.error(`❌ Exception calling KRNL node:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';
      return {
        success: false,
        error: `KRNL node execution failed: ${errorMessage}\n${errorStack}`,
      };
    }
  }

  /**
   * Get node configuration
   */
  async getNodeConfig(): Promise<any> {
    try {
      const response = await this.client.post('', {
        jsonrpc: '2.0',
        method: 'krnl_getConfig',
        params: [],
        id: Date.now(),
      });

      return response.data.result;
    } catch (error) {
      throw new Error(`Failed to get KRNL node config: ${error}`);
    }
  }

  /**
   * Check workflow status using krnl_workflowStatus
   * Status codes:
   * - 1: In progress
   * - 2: Completed (result field contains transaction hash)
   */
  async getWorkflowStatus(intentId: string): Promise<WorkflowStatus> {
    try {
      const response = await this.client.post('', {
        jsonrpc: '2.0',
        method: 'krnl_workflowStatus',
        params: [intentId],
        id: Date.now(),
      });

      const result = response.data.result;
      const code = result.code;
      
      // Map KRNL status codes to our internal status
      let status: 'pending' | 'running' | 'completed' | 'failed';
      let transactionHash: string | undefined;
      let errorMessage: string | undefined;
      
      if (code === 1) {
        status = 'running';
      } else if (code === 2) {
        status = 'completed';
        transactionHash = result.result; // Transaction hash when completed
      } else if (code === 3 || code < 0) {
        status = 'failed';
        // Extract error details from result
        errorMessage = result.error || result.message || result.reason || 'Unknown error';
        
        // Log full result for debugging
        console.error(`❌ KRNL workflow failed (code: ${code})`);
        console.error(`   Intent ID: ${intentId}`);
        console.error(`   Error: ${errorMessage}`);
        console.error(`   Full result:`, JSON.stringify(result, null, 2));
      } else {
        status = 'pending';
      }
      
      console.log(`📊 Workflow status - intentId: ${intentId}, code: ${code}, status: ${status}`);
      if (transactionHash) {
        console.log(`   Transaction hash: ${transactionHash}`);
      }

      return {
        status,
        workflowId: intentId,
        result: result,
        transactionHash,
        steps: result.steps,
        error: errorMessage || result.error,
      };
    } catch (error) {
      console.error(`❌ Exception getting workflow status:`, error);
      throw new Error(`Failed to get workflow status: ${error}`);
    }
  }

  /**
   * Poll workflow status until completion or timeout
   * Polls krnl_workflowStatus until code === 2 (completed)
   */
  async pollWorkflowUntilComplete(
    intentId: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 2000
  ): Promise<WorkflowStatus> {
    const startTime = Date.now();
    console.log(`🔄 Starting to poll workflow intentId: ${intentId}`);

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getWorkflowStatus(intentId);

      if (status.status === 'completed') {
        console.log(`✅ Workflow completed - txHash: ${status.transactionHash}`);
        return status;
      }

      if (status.status === 'failed') {
        console.error(`❌ Workflow failed:`, status.error);
        throw new Error(status.error || 'Workflow failed');
      }

      console.log(`⏳ Workflow ${status.status}, waiting ${pollIntervalMs}ms before next poll...`);
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Workflow polling timeout after ${maxWaitMs}ms`);
  }
}

/**
 * Create a KRNL client instance
 */
export function createKRNLClient(config: KRNLNodeConfig): KRNLClient {
  return new KRNLClient(config);
}
