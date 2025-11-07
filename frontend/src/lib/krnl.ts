import { createConfig } from '@krnl-dev/sdk-react-7702';
import { baseSepolia } from 'viem/chains';

// Get environment variables with fallbacks for development
const delegatedContractAddress = import.meta.env.VITE_DELEGATED_ACCOUNT_ADDRESS as string || '0x0000000000000000000000000000000000000000';
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID as string || 'development';
const krnlNodeUrl = import.meta.env.VITE_KRNL_NODE_URL as string || 'https://node.krnl.xyz';
const rpcUrl = import.meta.env.VITE_RPC_URL as string || 'https://sepolia.base.org';

// Create KRNL config with viem chain
export const config = createConfig({
  chain: baseSepolia as any,
  delegatedContractAddress,
  privyAppId,
  krnlNodeUrl,
  rpcUrl
});