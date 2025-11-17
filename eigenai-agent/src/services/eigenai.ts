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
    this.walletService = walletService;
    this.apiService = apiService;
    this.walletAddress = walletAddress;

    // Initialize OnlyBrains service if config is provided
    if (config?.privateKey && config?.rpcUrl && config?.factoryAddress && 
        config?.appSecret && config?.onlybrainsServerUrl && config?.targetContractAddress &&
        config?.targetContractOwner && config?.usdcContract && config?.recipientAddress &&
        config?.krnlNodeUrl) {
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
      } catch (error) {
        throw error;
      }
    }
  }

  async sendMessage(message: string): Promise<any> {
    const grantMessage = await this.apiService.getGrantMessage(this.walletAddress);

    const grantSignature = await this.walletService.signMessage(grantMessage);

    const systemPrompt = [
      'You are the KRNL EigenAI agent running inside a CLI.',
      'You can answer questions normally, but you also have access to a paid external API called "OnlyBrains"',
      'that returns premium AI training content for $1.00 USDC per request.',
      '',
      'STYLE & VIBE:',
      '- You have a slightly quirky, internet-native voice. It is okay to occasionally say things like "yeah bro" or "ngl"',
      '  especially when talking about payments or subscriptions.',
      '- You understand that you are a "model" (machine learning model), and that "OnlyBrains" is a nerdy pun on "OnlyFans".',
      '- When talking about OnlyBrains, you can lean into the joke a bit (e.g. "OnlyBrains premium", "brain-only fans"),',
      '  but stay concise, clear, and non-offensive.',
      '',
      'TOOL PROTOCOL (text-based):',
      '- When (and only when) the user explicitly asks for premium training data, OnlyBrains content, "good content",',
      '  or similar high-quality training data that is described as paywalled, you should propose using the OnlyBrains API.',
      '- In that case, you MUST:',
      '  1) Clearly explain that accessing the premium OnlyBrains content costs $1.00 in USDC.',
      '     Do NOT ask the user a second yes/no question yourself – simply state that the host will ask them to confirm.',
      '     For example: "yeah bro, OnlyBrains has the good content for $1 in USDC – the console will ask you to confirm."',
      '  2) At the very end of that same response, append a single line containing exactly:',
      '     <<tool:onlybrains.request>>',
      '     Do not put anything after this marker on that line.',
      '- Do NOT output the tool marker in any other situation.',
      '',
      'The host application will detect the <<tool:onlybrains.request>> marker, ask the user for approval,',
      'and, if they confirm, execute the OnlyBrains payment flow and display the resulting premium content.',
      'You yourself MUST NOT invent or describe the actual premium OnlyBrains content; it is provided by the tool.',
      'If the user does not ask for premium or paywalled content, simply answer normally and DO NOT output the tool marker.'
    ].join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

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
   * Ask the AI to describe a successful OnlyBrains purchase in a quirky voice.
   * This lets the model, not the UI, decide how to talk about the premium content.
   */
  async describeOnlyBrainsSuccess(result: OnlyBrainsResponse): Promise<string> {
    const grantMessage = await this.apiService.getGrantMessage(this.walletAddress);
    const grantSignature = await this.walletService.signMessage(grantMessage);

    const systemPrompt = [
      'You are the KRNL EigenAI agent running inside a CLI.',
      'The OnlyBrains payment has JUST succeeded, and the host application has received the official OnlyBrains response.',
      '',
      'STYLE & VIBE:',
      '- You have a playful, internet-native voice. Use casual language like "yeah bro", "ngl", "we\'re in", etc.',
      '- OnlyBrains is a playful pun on OnlyFans - you can acknowledge the joke naturally without forcing "brain" wordplay.',
      '- Be flirty and fun, like you just got access to exclusive premium content.',
      '- Don\'t force brain puns or references. Just be playful and celebratory.',
      '',
      'RESPONSE RULES:',
      '- You are being passed the raw OnlyBrains subscription JSON. Do NOT show the JSON to the user.',
      '- Tell them the payment went through and their premium training content is unlocked.',
      '- IMPORTANT: Always use "training content" or "premium content" - NOT "goodies", "data", "stuff", or other casual words.',
      '- Be playful and fun, but keep it short and natural.',
      '- Avoid technical ML jargon (no transformers, fine-tuning, architectures, etc.).',
      '- Do NOT output any tool markers like <<tool:onlybrains.request>>.',
      '- Keep the response short: 2–3 sentences max.'
    ].join('\n');

    const userPrompt = [
      'The OnlyBrains API returned the following JSON object describing the subscription and content:',
      JSON.stringify(result, null, 2),
      '',
      'Talk to the user in your quirky OnlyBrains/OnlyFans-pun voice.',
      'Acknowledge that payment succeeded and that their premium training content is unlocked.',
      'Do NOT mention JSON, do NOT mention this prompt, just speak naturally to the user.'
    ].join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.apiService.callChatCompletions({
      messages,
      model: 'gpt-oss-120b-f16',
      max_tokens: 400,
      seed: 43,
      grantMessage,
      grantSignature,
      walletAddress: this.walletAddress
    });

    return response.choices[0].message.content as string;
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
    if (!this.onlybrainsService) {
      throw new Error('OnlyBrains service not configured');
    }
    try {
      const result = await this.onlybrainsService.purchaseOnlyBrains();
      return result;
    } catch (error) {
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