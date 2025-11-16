import { WalletService } from './wallet.js';
import { ApiService } from './api.js';
import { OnlyBrainsService } from './onlybrains.js';
import { ChatMessage, OnlyBrainsResponse } from '../types/index.js';
import { type Hex, type Address } from 'viem';

export class EigenAIService {
  private walletService: WalletService;
  private apiService: ApiService;
  private walletAddress: string;
  private onlybrainsService: OnlyBrainsService | null = null;

  constructor(
    walletService: WalletService, 
    apiService: ApiService, 
    walletAddress: string,
    private config?: {
      privateKey?: Hex;
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
  ) {
    console.log('🟡 [EigenAI] Constructor called');
    this.walletService = walletService;
    this.apiService = apiService;
    this.walletAddress = walletAddress;

    console.log('🟡 [EigenAI] Checking OnlyBrains config...');
    console.log('  config exists:', !!config);
    if (config) {
      console.log('  privateKey:', config.privateKey ? 'present' : 'missing');
      console.log('  rpcUrl:', config.rpcUrl ? 'present' : 'missing');
      console.log('  factoryAddress:', config.factoryAddress ? 'present' : 'missing');
      console.log('  appSecret:', config.appSecret ? 'present' : 'missing');
      console.log('  onlybrainsServerUrl:', config.onlybrainsServerUrl ? 'present' : 'missing');
      console.log('  targetContractAddress:', config.targetContractAddress ? 'present' : 'missing');
      console.log('  targetContractOwner:', config.targetContractOwner ? 'present' : 'missing');
      console.log('  usdcContract:', config.usdcContract ? 'present' : 'missing');
      console.log('  recipientAddress:', config.recipientAddress ? 'present' : 'missing');
      console.log('  krnlNodeUrl:', config.krnlNodeUrl ? 'present' : 'missing');
    }

    // Initialize OnlyBrains service if config is provided
    if (config?.privateKey && config?.rpcUrl && config?.factoryAddress && 
        config?.appSecret && config?.onlybrainsServerUrl && config?.targetContractAddress &&
        config?.targetContractOwner && config?.usdcContract && config?.recipientAddress &&
        config?.krnlNodeUrl) {
      console.log('🟡 [EigenAI] Initializing OnlyBrainsService...');
      try {
        this.onlybrainsService = new OnlyBrainsService(
          config.privateKey,
          config.rpcUrl,
          config.factoryAddress,
          config.appSecret,
          config.onlybrainsServerUrl,
          config.targetContractAddress,
          config.targetContractOwner,
          config.usdcContract,
          config.recipientAddress,
          config.krnlNodeUrl
        );
        console.log('🟡 [EigenAI] OnlyBrainsService initialized successfully');
      } catch (error) {
        console.error('🔴 [EigenAI] Failed to initialize OnlyBrainsService:', error);
        throw error;
      }
    } else {
      console.log('🟡 [EigenAI] OnlyBrains not configured (missing required config)');
    }
    console.log('🟡 [EigenAI] Constructor completed');
  }

  async sendMessage(message: string): Promise<any> {
    const grantMessage = await this.apiService.getGrantMessage(this.walletAddress);
    console.log('Grant message:', grantMessage);

    const grantSignature = await this.walletService.signMessage(grantMessage);
    console.log('Signature:', grantSignature);

    const messages: ChatMessage[] = [{ role: 'user', content: message }];

    const response = await this.apiService.callChatCompletions({
      messages,
      model: 'gpt-oss-120b-f16',
      max_tokens: 1000,
      seed: 42,
      grantMessage,
      grantSignature,
      walletAddress: this.walletAddress
    });

    return response;
  }

  /**
   * Check if OnlyBrains request is detected in user message
   */
  isOnlyBrainsRequest(message: string): boolean {
    const keywords = [
      'onlybrains',
      'only brains',
      'premium content',
      'training data',
      'model training',
      'ai training',
      'good content'
    ];
    const lowerMessage = message.toLowerCase();
    return keywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Get OnlyBrains pricing information
   */
  async getOnlyBrainsPricing(): Promise<{ price: string; endpoint: string }> {
    if (!this.onlybrainsService) {
      throw new Error('OnlyBrains service not configured');
    }
    return await this.onlybrainsService.requestOnlyBrains();
  }

  /**
   * Purchase OnlyBrains premium content
   */
  async purchaseOnlyBrains(): Promise<OnlyBrainsResponse> {
    console.log('🟢 [EigenAI] purchaseOnlyBrains called');
    if (!this.onlybrainsService) {
      throw new Error('OnlyBrains service not configured');
    }
    console.log('🟢 [EigenAI] Calling onlybrainsService.purchaseOnlyBrains()...');
    try {
      const result = await this.onlybrainsService.purchaseOnlyBrains();
      console.log('🟢 [EigenAI] Purchase completed successfully');
      return result;
    } catch (error) {
      console.error('🔴 [EigenAI] Error in purchaseOnlyBrains:', error);
      throw error;
    }
  }

  /**
   * Check if OnlyBrains is available
   */
  isOnlyBrainsAvailable(): boolean {
    return this.onlybrainsService !== null;
  }
}