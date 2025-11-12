import { FastifyRequest, FastifyReply } from 'fastify';

interface SupportedPaymentKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, any>;
}

interface SupportedPaymentKindsResponse {
  kinds: SupportedPaymentKind[];
}

/**
 * Returns the supported payment kinds for the x402 protocol
 *
 * @param request - The incoming request
 * @param reply - The response object
 * @returns A JSON response containing the list of supported payment kinds
 */
export async function getSupportedPaymentKinds(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SupportedPaymentKindsResponse> {
  const response: SupportedPaymentKindsResponse = {
    kinds: [
      {
        x402Version: 1,
        scheme: 'exact',
        network: 'ethereum-sepolia',
        extra: {
          name: 'USDC',
          version: '2',
          factoryAddress: '0xc940d3c6eB25A2b8380c78C7325B658c18317036', // EIP-4337 Smart Account Factory
        },
      },
      {
        x402Version: 1,
        scheme: 'exact',
        network: 'base-sepolia',
      },
      {
        x402Version: 1,
        scheme: 'exact',
        network: 'base',
      },
      {
        x402Version: 1,
        scheme: 'exact',
        network: 'polygon-amoy',
        extra: {
          name: 'USDC',
          version: '2',
        },
      },
    ],
  };

  return response;
}
