import type { SettleResponse } from 'x402/types';
import type { WorkflowStatus } from './krnl-client';

export interface WorkflowTracking {
  workflowId: string;
  paymentNonce: string;
  startedAt: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workflowStatus?: WorkflowStatus;
  settleResult?: SettleResponse;
}

// In-memory store (use Redis in production for distributed systems)
const workflowStore = new Map<string, WorkflowTracking>();

/**
 * Track a new workflow execution
 */
export function trackWorkflow(paymentNonce: string, workflowId: string): void {
  workflowStore.set(paymentNonce, {
    workflowId,
    paymentNonce,
    startedAt: Date.now(),
    status: 'pending',
  });
  console.log(`📝 Tracking workflow ${workflowId} for nonce ${paymentNonce.slice(0, 10)}...`);
}

/**
 * Get workflow tracking info by payment nonce
 */
export function getWorkflowByNonce(paymentNonce: string): WorkflowTracking | undefined {
  return workflowStore.get(paymentNonce);
}

/**
 * Update workflow status
 */
export function updateWorkflowStatus(
  paymentNonce: string,
  status: WorkflowTracking['status'],
  workflowStatus?: WorkflowStatus,
  settleResult?: SettleResponse
): void {
  const workflow = workflowStore.get(paymentNonce);
  if (workflow) {
    workflow.status = status;
    workflow.workflowStatus = workflowStatus;
    workflow.settleResult = settleResult;
    workflowStore.set(paymentNonce, workflow);
    console.log(`📊 Updated workflow status for nonce ${paymentNonce.slice(0, 10)}... → ${status}`);
  }
}

/**
 * Start background polling for a workflow
 * Does not block - runs async and updates store
 */
export function startBackgroundPolling(
  paymentNonce: string,
  workflowId: string,
  pollFn: () => Promise<WorkflowStatus>
): void {
  updateWorkflowStatus(paymentNonce, 'running');
  
  // Don't await - run in background
  pollAndUpdate(paymentNonce, pollFn).catch(err => {
    console.error(`❌ Background polling failed for workflow ${workflowId}:`, err);
    updateWorkflowStatus(paymentNonce, 'failed');
  });
}

/**
 * Internal polling loop
 */
async function pollAndUpdate(
  paymentNonce: string,
  pollFn: () => Promise<WorkflowStatus>
): Promise<void> {
  try {
    // Poll until complete (with internal timeout in pollFn)
    const workflowStatus = await pollFn();
    
    if (workflowStatus.status === 'completed' && workflowStatus.transactionHash) {
      // Convert workflow status to settle response format
      const settleResult: SettleResponse = {
        success: true,
        transaction: workflowStatus.transactionHash,
        network: workflowStatus.result?.network || 'base-sepolia',
        payer: workflowStatus.result?.payer,
      };
      
      updateWorkflowStatus(paymentNonce, 'completed', workflowStatus, settleResult);
      console.log(`✅ Workflow completed with tx: ${workflowStatus.transactionHash}`);
    } else {
      updateWorkflowStatus(paymentNonce, 'failed', workflowStatus);
    }
  } catch (error) {
    console.error('Polling error:', error);
    updateWorkflowStatus(paymentNonce, 'failed');
  }
}

/**
 * Clean up old tracking entries (call periodically)
 */
export function cleanupOldEntries(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [nonce, tracking] of workflowStore.entries()) {
    if (now - tracking.startedAt > maxAgeMs) {
      workflowStore.delete(nonce);
    }
  }
}
