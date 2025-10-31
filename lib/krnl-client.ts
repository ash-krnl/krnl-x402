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
      const response = await this.client.post('', {
        jsonrpc: '2.0',
        method: 'krnl_executeWorkflow',
        params: [workflowDSL],
        id: Date.now(),
      });

      if (response.data.error) {
        return {
          success: false,
          error: response.data.error.message || 'KRNL execution failed',
        };
      }

      // Extract workflow ID from response (adjust based on actual KRNL response format)
      const workflowId = response.data.result?.workflowId || response.data.result?.id;

      return {
        success: true,
        workflowId,
        result: response.data.result,
        transactionHash: response.data.result?.transactionHash,
        steps: response.data.result?.steps,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `KRNL node execution failed: ${errorMessage}`,
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
   * Check workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
    try {
      const response = await this.client.post('', {
        jsonrpc: '2.0',
        method: 'krnl_getWorkflowStatus',
        params: [workflowId],
        id: Date.now(),
      });

      const result = response.data.result;
      return {
        status: result.status || 'pending',
        workflowId,
        result: result,
        transactionHash: result.transactionHash,
        steps: result.steps,
        error: result.error,
      };
    } catch (error) {
      throw new Error(`Failed to get workflow status: ${error}`);
    }
  }

  /**
   * Poll workflow status until completion or timeout
   * Mimics the SDK's internal polling behavior
   */
  async pollWorkflowUntilComplete(
    workflowId: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 2000
  ): Promise<WorkflowStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getWorkflowStatus(workflowId);

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Workflow failed');
      }

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
