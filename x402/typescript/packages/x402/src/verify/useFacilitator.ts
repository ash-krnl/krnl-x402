import { toJsonSafe } from "../shared";
import {
  ListDiscoveryResourcesRequest,
  ListDiscoveryResourcesResponse,
  FacilitatorConfig,
  SupportedPaymentKindsResponse,
} from "../types";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "../types/verify";

const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

export type CreateHeaders = () => Promise<{
  verify: Record<string, string>;
  settle: Record<string, string>;
  supported: Record<string, string>;
  list?: Record<string, string>;
}>;

/**
 * Creates a facilitator client for interacting with the X402 payment facilitator service
 *
 * @param facilitator - The facilitator config to use. If not provided, the default facilitator will be used.
 * @returns An object containing verify and settle functions for interacting with the facilitator
 */
export function useFacilitator(facilitator?: FacilitatorConfig) {
  console.log('🔧 useFacilitator initialized with config:');
  console.log(`   URL: ${facilitator?.url || DEFAULT_FACILITATOR_URL}`);
  console.log(`   Has createAuthHeaders: ${!!facilitator?.createAuthHeaders}`);
  /**
   * Verifies a payment payload with the facilitator service
   *
   * @param payload - The payment payload to verify
   * @param paymentRequirements - The payment requirements to verify against
   * @returns A promise that resolves to the verification response
   */
  async function verify(
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    let headers = {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      "User-Agent": "x402-facilitator-client/1.0",
      "Accept": "application/json",
      "Cache-Control": "no-cache"
    };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.verify };
    }

    const requestBody = {
      x402Version: payload.x402Version,
      paymentPayload: toJsonSafe(payload),
      paymentRequirements: toJsonSafe(paymentRequirements),
    };

    console.log('🔍 Facilitator verify request details:');
    console.log(`   URL: ${url}/verify`);
    console.log(`   Method: POST`);
    console.log(`   Headers:`, JSON.stringify(headers, null, 2));
    console.log(`   Body:`, JSON.stringify(requestBody, null, 2));

    const res = await fetch(`${url}/verify`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log('📥 Facilitator verify response:');
    console.log(`   Status: ${res.status} ${res.statusText}`);
    console.log(`   Headers:`, JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));

    if (res.status !== 200) {
      const responseText = await res.text();
      console.log(`   Response body:`, responseText);
      throw new Error(`Failed to verify payment: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`   Response data:`, JSON.stringify(data, null, 2));
    return data as VerifyResponse;
  }

  /**
   * Settles a payment with the facilitator service
   *
   * @param payload - The payment payload to settle
   * @param paymentRequirements - The payment requirements for the settlement
   * @returns A promise that resolves to the settlement response
   */
  async function settle(
    payload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.settle };
    }

    const res = await fetch(`${url}/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: payload.x402Version,
        paymentPayload: toJsonSafe(payload),
        paymentRequirements: toJsonSafe(paymentRequirements),
      }),
    });

    if (res.status !== 200) {
      const text = res.statusText;
      throw new Error(`Failed to settle payment: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data as SettleResponse;
  }

  /**
   * Gets the supported payment kinds from the facilitator service.
   *
   * @returns A promise that resolves to the supported payment kinds
   */
  async function supported(): Promise<SupportedPaymentKindsResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      headers = { ...headers, ...authHeaders.supported };
    }

    const res = await fetch(`${url}/supported`, {
      method: "GET",
      headers,
    });

    if (res.status !== 200) {
      throw new Error(`Failed to get supported payment kinds: ${res.statusText}`);
    }

    const data = await res.json();
    return data as SupportedPaymentKindsResponse;
  }

  /**
   * Lists the discovery items with the facilitator service
   *
   * @param config - The configuration for the discovery list request
   * @returns A promise that resolves to the discovery list response
   */
  async function list(
    config: ListDiscoveryResourcesRequest = {},
  ): Promise<ListDiscoveryResourcesResponse> {
    const url = facilitator?.url || DEFAULT_FACILITATOR_URL;

    let headers = { "Content-Type": "application/json" };
    if (facilitator?.createAuthHeaders) {
      const authHeaders = await facilitator.createAuthHeaders();
      if (authHeaders.list) {
        headers = { ...headers, ...authHeaders.list };
      }
    }

    const urlParams = new URLSearchParams(
      Object.entries(config)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => [key, value.toString()]),
    );

    const res = await fetch(`${url}/discovery/resources?${urlParams.toString()}`, {
      method: "GET",
      headers,
    });

    if (res.status !== 200) {
      const text = res.statusText;
      throw new Error(`Failed to list discovery: ${res.status} ${text}`);
    }

    const data = await res.json();
    return data as ListDiscoveryResourcesResponse;
  }

  return { verify, settle, supported, list };
}

export const { verify, settle, supported, list } = useFacilitator();
