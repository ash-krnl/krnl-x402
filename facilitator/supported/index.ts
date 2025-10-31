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
        network: 'base-sepolia',
      },
      {
        x402Version: 1,
        scheme: 'exact',
        network: 'base',
      },
    ],
  };

  return response;
}
