# Architecture Overview

This document describes how the KRNL-enhanced x402 facilitator, KRNL node, EIP-4337 smart accounts, the test resource server, and the EigenAI agent work together.

## High-Level Components

- **Fastify Facilitator Server** (`index.ts`)
- **Facilitator Handlers** (`facilitator/`)
- **KRNL Integration Layer** (`middleware/`, `lib/`)
- **x402 SDK Integration** (`x402/` packages)
- **Test Resource Server (Seller)** (`test/server.ts`)
- **EIP-4337 Test Client** (`test/client-eoa-eip4337.ts`)
- **EigenAI Agent Demo** (`eigenai-agent/`)

These components implement an x402 payment flow where verification and settlement are executed atomically via a KRNL workflow, and where clients can be either a scripted EIP-4337 client or an EigenAI-powered CLI agent.

---

## Facilitator Server

### Fastify Entry Point (`index.ts`)

The main HTTP server is a Fastify app:

- Loads environment via `dotenv.config()`.
- Creates a Fastify instance with logging enabled.
- Registers endpoints:
  - `GET /health` – basic health check.
  - `POST /facilitator/verify` – verify payment and start KRNL workflow.
  - `GET /facilitator/verify` – verify endpoint docs.
  - `POST /facilitator/settle` – wait for KRNL workflow completion and return tx hash.
  - `GET /facilitator/settle` – settle endpoint docs.
  - `GET /facilitator/supported` – list supported payment kinds.
  - Aliases for x402 compatibility: `/verify`, `/settle`, `/supported`.

Fastify is the only HTTP server in this repo for the facilitator; everything else is library code or client/demo code.

### Verify Endpoint (`facilitator/verify`)

- **Entry**: `postVerifyPayment` in `facilitator/verify/handlers.ts`.
- **Request body**:
  - `paymentPayload: PaymentPayload`
  - `paymentRequirements: PaymentRequirements`
- **Behavior**:
  - Validates that the requested network is supported for KRNL using `isKRNLNetworkSupported`.
  - Detects **internal** calls from KRNL via `x-krnl-internal: true` header:
    - Internal calls: only verify the payment using `verifyPaymentForKRNL` (no workflow creation).
    - External calls: start a KRNL workflow via `krnlX402Middleware`.
  - Returns a `VerifyResponse` with `isValid`, `invalidReason`, and `payer`.

### Settle Endpoint (`facilitator/settle`)

- **Entry**: `postSettlePayment` in `facilitator/settle/handlers.ts`.
- **Request body**:
  - `paymentPayload: PaymentPayload`
  - `paymentRequirements: PaymentRequirements`
- **Key steps**:
  - Extracts the `paymentNonce` from `paymentPayload.payload.authorization.nonce`.
  - Looks up the corresponding workflow in the in-memory store (`getWorkflowByNonce`).
  - Behavior by workflow state:
    - **No workflow**: 404 error – client must call `/verify` first.
    - **completed**: returns cached `SettleResponse` immediately.
    - **failed**: returns error with `errorReason` and optional `payer`.
    - **pending/running**: uses `KRNLClient.pollWorkflowUntilComplete` to wait up to ~30s, then returns a `SettleResponse` (or an error if still not completed).

### Supported Networks Endpoint (`facilitator/supported`)

- **Entry**: `getSupportedPaymentKinds` in `facilitator/supported/index.ts`.
- Returns a static list of supported x402 payment kinds with:
  - `x402Version`, `scheme`, `network`, and optional `extra` (e.g. USDC name/version, EIP-4337 factory address).

---

## KRNL Integration Layer

### KRNL Middleware (`middleware/krnl-x402.ts`)

The `krnlX402Middleware` function is the core of the KRNL integration:

- **Input**:
  - HTTP request with `paymentPayload` and `paymentRequirements`.
  - `KRNLX402Config` built from environment variables via `createKRNLX402Config()`.
- **Responsibilities**:
  - Extract `sender` and `paymentNonce` from the EVM `authorization` in the payload.
  - Deduplicate workflows per `paymentNonce` using `getWorkflowByNonce`.
  - Pre-track the workflow in the in-memory store via `trackWorkflow` (with a placeholder workflow ID) to avoid races.
  - Build a KRNL workflow DSL using `buildX402VerifySettleWorkflow` (see below).
  - Execute the workflow via `KRNLClient.executeWorkflow`, which returns an `intentId` used as `workflowId`.
  - Update workflow tracking with the real `workflowId`.
  - Start **background polling** of the workflow via `startBackgroundPolling`, which calls `pollWorkflowUntilComplete` in a non-blocking loop.
  - In the same request, **optimistically** poll KRNL for the `x402-verify-payment` step to return `VerifyResponse` as soon as the verify step is available.

The middleware returns quickly (typically < 100ms for verify), while settlement continues in the background.

### KRNL Client (`lib/krnl-client.ts`)

`KRNLClient` is a JSON-RPC client for the KRNL node:

- **Methods**:
  - `executeWorkflow(workflowDSL)` – calls `krnl_executeWorkflow`, returns `{ success, workflowId (intentId), steps, transactionHash? }`.
  - `getWorkflowStatus(intentId)` – calls `krnl_workflowStatus` and maps KRNL status codes to `{ status: 'pending'|'running'|'completed'|'failed', transactionHash?, steps?, error? }`.
  - `pollWorkflowUntilComplete(intentId, maxWaitMs, pollIntervalMs)` – repeatedly calls `getWorkflowStatus` until completed or timeout.

### Workflow Builder (`lib/workflow-builder.ts`)

`buildX402VerifySettleWorkflow` constructs the KRNL workflow DSL from:

- `paymentPayload` (EIP-3009 USDC authorization + KRNL intent fields).
- `paymentRequirements` (network, asset, and metadata).
- Configuration: `attestorImage`, `facilitatorUrl`, `rpcUrl`, optional `bundlerUrl` and `paymasterUrl`.

Key behavior:

- Loads `facilitator/workflow-template.json` and replaces placeholders such as:
  - `ENV.SENDER_ADDRESS`, `ENV.ATTESTOR_IMAGE`, `ENV.TARGET_CONTRACT`.
  - KRNL transaction intent fields: `TRANSACTION_INTENT_DELEGATE`, `TRANSACTION_INTENT_ID`, `TRANSACTION_INTENT_DEADLINE`, `USER_SIGNATURE`.
  - Payment fields: `PAYMENT_FROM`, `PAYMENT_NONCE`, `PAYMENT_SIGNATURE`, `PAYMENT_TO`, `PAYMENT_VALID_AFTER`, `PAYMENT_VALID_BEFORE`, `PAYMENT_VALUE`.
  - Requirement fields: `PAYMENT_ASSET`, `PAYMENT_DESCRIPTION`, `PAYMENT_RESOURCE`.
- Validates that the client provided all required KRNL intent fields (`intentId`, `intentSignature`, `intentDeadline`, `intentDelegate`, `intentTarget`).

The resulting DSL tells KRNL how to:

1. Call the facilitator `/verify` endpoint from within the workflow.
2. Encode settlement calldata for the target contract.
3. Build an EIP-4337 `UserOperation` for final settlement.

### Workflow Store (`lib/workflow-store.ts`)

A simple in-memory tracking store keyed by `paymentNonce`:

- `trackWorkflow(paymentNonce, workflowId)` – create tracking entry.
- `getWorkflowByNonce(paymentNonce)` – read tracking entry.
- `updateWorkflowStatus(paymentNonce, status, workflowStatus?, settleResult?)` – update status and cached settle response.
- `startBackgroundPolling(paymentNonce, workflowId, pollFn)` – starts an async polling loop and updates the store when the workflow finishes.

In production you would replace this in-memory map with Redis or another shared store.

### Payment Verification (`facilitator/verify/krnl-verify.ts`)

`verifyPaymentForKRNL` performs on-chain validation of the USDC EIP-3009 authorization:

- Validates scheme and network against `NETWORK_CONFIG`.
- Builds a `viem` public client using the configured RPC URL.
- Manually computes the EIP-712 hash for `TransferWithAuthorization`.
- Uses EIP-1271 for smart contract wallets, or standard signature verification for EOAs.
- Checks recipient, time window (`validAfter`/`validBefore`), USDC balance, and authorization amount vs `maxAmountRequired`.
- Returns a `VerifyResponse` with detailed `invalidReason` codes.

KRNL calls this verifier internally as part of the workflow when executing the `x402-verify-payment` step.

---

## x402 SDK Integration

The facilitator does not implement x402 wire protocol manually. Instead it reuses the x402 SDK from the `x402/` submodule:

- `x402-express` – used by the **test resource server** to expose paywalled endpoints (`/premium`, `/onlybrains`).
- `x402-fetch` – used by the **EIP-4337 client** and the **EigenAI agent** to automatically handle 402 responses and payment flows.

The facilitator implements the x402 seller API surface (`/verify`, `/settle`, `/supported`) but delegates protocol details to the SDK.

---

## Test Resource Server (`test/server.ts`)

This is a seller-style Express server that exposes paywalled resources and uses the facilitator for payments:

- Uses `paymentMiddleware` from `x402-express` to:
  - Intercept requests.
  - Trigger x402 payment flows via the **facilitator URL**.
  - Enforce pricing per endpoint.
- Configures two protected routes:
  - `GET /premium` – 0.01 USDC to access premium content.
  - `POST /onlybrains` – 1.00 USDC (or 4.00 USDC in some comments) to access OnlyBrains-style premium AI content.
- Uses environment variables:
  - `RECIPIENT_ADDRESS` – receiver of USDC payments.
  - `FACILITATOR_URL` – URL of this KRNL x402 facilitator.
  - `KRNL_NODE_URL` – KRNL node endpoint (proxied via `/x402/config`).

The test server is how you verify end-to-end flows: client → seller → facilitator → KRNL → chain.

---

## EIP-4337 Test Client (`test/client-eoa-eip4337.ts`)

This script is an end-to-end TypeScript client demonstrating EIP-4337 smart accounts + x402 + KRNL:

- Manages an EOA and its EIP-4337 smart account (delegated account) via `AccountFactory4337`.
- Computes a KRNL transaction intent and signs it (EIP-191 over a structured hash).
- Computes and signs a USDC EIP-3009 authorization using EIP-712 + EIP-191.
- Attaches KRNL intent and USDC authorization to the wallet client.
- Wraps `fetch` with `wrapFetchWithPayment` from `x402-fetch` and calls the test server `/premium` endpoint.

The script shows how a non-EigenAI client can drive the full payment + settlement flow directly.

---

## EigenAI Agent Demo (`eigenai-agent/`)

The `eigenai-agent` folder contains a CLI agent that acts as an intelligent x402 client:

- **WalletService** (`src/services/wallet.ts`)
  - Wraps a viem account created from a private key.
  - Signs grant messages for EigenAI and other payloads.
- **ApiService** (`src/services/api.ts`)
  - Talks to an EigenAI-compatible server:
    - `GET /message` – retrieves a grant message to be signed.
    - `POST /api/chat/completions` – calls the EigenAI chat completions API.
- **EigenAIService** (`src/services/eigenai.ts`)
  - Orchestrates chat completions with system prompts that describe the OnlyBrains tool protocol.
  - Detects when a user is requesting premium content and signals that the OnlyBrains flow should be executed.
- **OnlyBrainsService** (`src/services/onlybrains.ts`)
  - Implements the same EIP-4337 + x402 + KRNL pattern as `test/client-eoa-eip4337.ts`.
  - Builds KRNL transaction intent and USDC authorization.
  - Wraps `fetch` with `wrapFetchWithPayment` and calls the test server `/onlybrains` endpoint.

In the overall architecture, the EigenAI agent is a **rich client** that decides *when* to call the premium API, but the payment and settlement pipeline is identical to the EIP-4337 test client.

---

## End-to-End Flows

### 1. Basic Premium Content Flow (Scripted Client)

1. Developer runs the facilitator (`npm run dev`).
2. Developer runs the test resource server (`npm run test:server`).
3. The EIP-4337 client (`test/client-eoa-eip4337.ts`) calls the test server `/premium` using `wrapFetchWithPayment`.
4. `x402-express` returns HTTP 402 with payment requirements.
5. `x402-fetch` constructs a payment payload containing:
   - EIP-3009 USDC authorization
   - KRNL intent fields (intent ID, signature, delegate, target, deadline)
6. `x402-fetch` sends `POST /facilitator/verify` to the Fastify facilitator.
7. Facilitator → `krnlX402Middleware` → KRNL node, starting an atomic workflow.
8. KRNL executes the steps (`x402-verify-payment`, `x402-encode-payment-params`, `prepare-authdata`, `target-calldata`, `sca-calldata`) and submits an EIP-4337 `UserOperation`.
9. Client eventually calls `POST /facilitator/settle` (via x402 flow) to get the transaction hash.
10. Test server returns the premium content payload to the client.

### 2. EigenAI Agent + OnlyBrains Flow

1. Developer runs the facilitator and the test resource server.
2. Developer runs the EigenAI agent (`npm run test:client` from repo root, which runs `npm run dev` inside `eigenai-agent`).
3. User chats with the agent in the CLI.
4. When the user asks for premium/OnlyBrains content, EigenAI outputs a tool marker.
5. The CLI host interprets the marker and calls `OnlyBrainsService.purchaseOnlyBrains()`.
6. `OnlyBrainsService` executes the same EIP-4337 + x402 + KRNL payment flow against the test server `/onlybrains` endpoint.
7. After successful settlement, the agent receives the OnlyBrains response and describes it back to the user.

---

## Where to Extend

- **New verification rules**
  - Extend `verifyPaymentForKRNL` to enforce additional checks.
  - Update `workflow-template.json` if new steps are required.
- **New networks or assets**
  - Add entries to `NETWORK_CONFIG` in `facilitator/verify/krnl-verify.ts`.
  - Add new supported kinds in `facilitator/supported/index.ts`.
- **Alternative clients**
  - Use `x402-fetch` to integrate with other backends.
  - Mirror the EIP-4337 pattern from `test/client-eoa-eip4337.ts` or `OnlyBrainsService`.

For usage-level details and API shapes, see the root `README.md` and `API_REFERENCE.md` (if present).
