import { type Hex, type Address } from 'viem';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model: string;
  max_tokens: number;
  seed: number;
  grantMessage: string;
  grantSignature: string;
  walletAddress: string;
}

export interface Config {
  serverUrl: string;
  privateKey: Hex;
  accountAddress: string;
  rpcUrl?: string;
  factoryAddress?: Address;
  appSecret?: string;
  targetContractAddress?: Address;
  targetContractOwner?: Address;
  usdcContract?: Address;
  recipientAddress?: Address;
  krnlNodeUrl?: string;
  onlybrainsServerUrl?: string;
}

export interface OnlyBrainsResponse {
  subscription: {
    status: string;
    tier: string;
    expiresAt: string;
    accessGranted: string;
  };
  content: {
    title: string;
    description: string;
    datasets: string[];
    note: string;
  };
  message: string;
}