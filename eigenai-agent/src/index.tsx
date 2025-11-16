#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { config } from './config/index.js';
import { WalletService, ApiService, EigenAIService } from './services/index.js';
import { ChatInterface } from './components/index.js';

async function main() {
  try {
    const walletService = new WalletService(config.privateKey);
    const apiService = new ApiService(config.serverUrl);
    const eigenaiService = new EigenAIService(
      walletService, 
      apiService, 
      config.accountAddress,
      {
        privateKey: config.privateKey,
        rpcUrl: config.rpcUrl,
        factoryAddress: config.factoryAddress,
        appSecret: config.appSecret,
        targetContractAddress: config.targetContractAddress,
        targetContractOwner: config.targetContractOwner,
        usdcContract: config.usdcContract,
        recipientAddress: config.recipientAddress,
        krnlNodeUrl: config.krnlNodeUrl,
        onlybrainsServerUrl: config.onlybrainsServerUrl
      }
    );

    // Render the React-based CLI interface
    render(<ChatInterface eigenaiService={eigenaiService} />);

  } catch (error) {
    console.error('🚨 SYSTEM FAILURE:', error);
    process.exit(1);
  }
}

main();