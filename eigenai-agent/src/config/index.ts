import dotenv from 'dotenv';
import { type Hex, type Address } from 'viem';
import { Config } from '../types/index.js';

dotenv.config();

export const config: Config = {
  serverUrl: process.env.SERVER_URL || 'https://determinal-api.eigenarcade.com',
  privateKey: (process.env.PRIVATE_KEY as Hex) || ("0x" + "" as Hex),
  accountAddress: process.env.ACCOUNT_ADDRESS || "",
  rpcUrl: process.env.RPC_URL,
  factoryAddress: process.env.FACTORY_ADDRESS as Address | undefined,
  appSecret: process.env.APP_SECRET,
  targetContractAddress: process.env.TARGET_CONTRACT_ADDRESS as Address | undefined,
  targetContractOwner: process.env.TARGET_CONTRACT_OWNER as Address | undefined,
  usdcContract: process.env.USDC_CONTRACT as Address | undefined,
  recipientAddress: process.env.RECIPIENT_ADDRESS as Address | undefined,
  krnlNodeUrl: process.env.KRNL_NODE_URL,
  onlybrainsServerUrl: process.env.ONLYBRAINS_SERVER_URL || 'http://localhost:4000'
};