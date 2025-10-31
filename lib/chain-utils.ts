import { Chain } from 'viem';
import { 
  base, 
  baseSepolia, 
  polygon, 
  polygonAmoy,
  avalanche,
  avalancheFuji
} from 'viem/chains';

/**
 * Map network names to viem chain objects
 */
export function getChainFromNetwork(network: string): Chain {
  switch (network) {
    case 'base':
      return base;
    case 'base-sepolia':
      return baseSepolia;
    case 'polygon':
      return polygon;
    case 'polygon-amoy':
      return polygonAmoy;
    case 'avalanche':
      return avalanche;
    case 'avalanche-fuji':
      return avalancheFuji;
    default:
      // Default to base sepolia for testing
      return baseSepolia;
  }
}

/**
 * Get RPC URL for a network
 */
export function getRpcUrl(network: string): string {
  const envKey = `${network.toUpperCase().replace(/-/g, '_')}_RPC_URL`;
  return process.env[envKey] || process.env.RPC_URL || '';
}
