# KRNL-Enhanced X402 Facilitator Server

High-performance x402 payment facilitator with **atomic verify+settle** powered by KRNL Protocol.

## 🎯 What Makes This Different?

**Traditional x402 Flow:**
1. Client sends payment → Facilitator **verifies** signature
2. Server delivers resource
3. Facilitator **settles** on-chain (separate transaction)
4. Two separate operations, non-atomic

**KRNL-Enhanced Flow:**
1. Client sends payment → Facilitator **starts KRNL workflow** (returns immediately)
2. Server delivers resource (no waiting)
3. KRNL workflow **verifies + settles atomically** in background
4. Facilitator **awaits workflow result** when `/settle` is called
5. Single atomic on-chain transaction ⚡

**Benefits:**
- ✅ **Non-blocking** - Verify returns immediately, no latency
- ✅ **Atomic execution** - Verification and settlement are one indivisible operation
- ✅ **Trustless** - Cryptographically verified by KRNL attestors
- ✅ **Cheaper** - Optimized gas costs via EIP-4337 bundling

## Features

- ⚡ **Ultra-fast**: Built on Fastify, non-blocking async architecture
- 🔐 **Atomic Settlement**: KRNL-powered atomic verify+settle via workflows
- 🔄 **Background Polling**: Mimics KRNL React SDK's internal polling mechanism
- 🌐 **Multi-chain**: Supports EVM networks including Ethereum Sepolia, Base Sepolia, Optimism Sepolia, Arbitrum Sepolia
- 🔒 **Secure**: Validates payment payloads and requirements
- 🛡️ **KRNL-Only**: No fallback logic - pure KRNL workflow execution
- 📊 **Production-ready**: Redis-ready workflow tracking, health checks

## Quick Start

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0

# RPC endpoint for your target network (e.g., Sepolia / Base Sepolia)
RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY

# KRNL Node configuration (KRNL-only)
KRNL_NODE_URL=https://node.krnl.xyz

#EIP-4337 infrastructure
BUNDLER_URL=https://api.pimlico.io/v2/sepolia/rpc?apikey=YOUR_KEY
PAYMASTER_URL=https://api.pimlico.io/v2/sepolia/rpc?apikey=YOUR_KEY

# KRNL workflow configuration
ATTESTOR_IMAGE=ghcr.io/krnl-labs/attestor:latest
FACILITATOR_URL=http://localhost:3000

# X402Target contract for atomic settlement (deployed via contracts/)
TARGET_CONTRACT_ADDRESS=0xYourDeployedTargetContract

# Optional: Redis for distributed workflow tracking (production)
# REDIS_URL=redis://localhost:6379

# Note: Solana is currently disabled in this project; no SOLANA_* variables are required.
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm run serve
```

## API Endpoints

### POST /facilitator/verify

KRNL-only. Starts an atomic verify+settle workflow and returns immediately. Background polling tracks workflow progress.

**Request Body:**
```json
{
  "paymentPayload": { ... },
  "paymentRequirements": { ... }
}
```

**Response (returns immediately):**
```json
{
  "isValid": true,
  "payer": "0x..."
}
```
Note: Settlement happens asynchronously. The `/settle` endpoint can wait for and return the final result when needed.

### GET /facilitator/verify

Get API documentation for the verify endpoint.

### POST /facilitator/settle

Settle x402 payments on-chain.

Behavior:
1. If KRNL workflow completed: returns cached result immediately
2. If KRNL workflow running: waits up to 30s for completion
3. If KRNL workflow failed or timed out: returns error

**Request Body:**
```json
{
  "paymentPayload": { ... },
  "paymentRequirements": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "transaction": "0x...",
  "network": "base-sepolia",
  "payer": "0x..."
}
```

### GET /facilitator/settle

Get API documentation for the settle endpoint.

### GET /facilitator/supported

Get supported payment kinds and networks.

**Response:**
```json
{
  "kinds": [
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base-sepolia"
    }
  ]
}
```

### GET /health

Health check endpoint.

## 🏗️ Architecture

### KRNL Async Workflow Execution

When a `/verify` request comes in:

```typescript
// 1. Middleware intercepts request
POST /facilitator/verify
{
  "paymentPayload": { /* EIP-3009 authorization */ },
  "paymentRequirements": { /* payment details */ }
}

// 2. Builds KRNL workflow DSL JSON
{
  "workflow": {
    "name": "x402-payment-settlement",
    "steps": [
      { "name": "x402-verify-payment", "image": "ghcr.io/krnl-labs/executor-http" },
      { "name": "x402-encode-payment-params", "image": "ghcr.io/krnl-labs/executor-encoder-evm" }
    ]
  },
  "chain_id": <derived from network>,
  "sender": "{{ENV.SENDER_ADDRESS}}",
  "delegate": "{{TRANSACTION_INTENT_DELEGATE}}"
}

// 3. Starts workflow via JSON-RPC
POST https://node.krnl.xyz
{
  "jsonrpc": "2.0",
  "method": "krnl_executeWorkflow",
  "params": [workflowDSL]
}

// 4. KRNL node returns workflow ID IMMEDIATELY
{
  "jsonrpc": "2.0",
  "result": {
    "workflowId": "wf_abc123...",
    "status": "pending"
  }
}

// 5. Facilitator tracks workflow and returns to SDK
// - Stores: paymentNonce → workflowId mapping
// - Starts background polling (every 2s)
// - Returns: { "isValid": true, "payer": "0x..." }

// 6. Background thread polls workflow status
POST https://node.krnl.xyz
{
  "jsonrpc": "2.0",
  "method": "krnl_getWorkflowStatus",
  "params": ["wf_abc123..."]
}

// 7. When workflow completes (5-30s later)
{
  "status": "completed",
  "transactionHash": "0x...",
  "result": { /* verification + settlement data */ }
}

// 8. When /settle is called:
// - If workflow completed: return cached tx hash
// - If still running: wait up to 30s
// - If failed: return error
```

### 

## How It Works: Async KRNL Flow

### Standard x402 Flow (Fallback)
```
Client → Server → POST /verify → Check signature ✓ → Return { isValid: true }
                                                      ↓
Server serves resource to client
                                                      ↓
Client uses resource
                                                      ↓
Server → POST /settle → Submit on-chain tx → Return { success, transactionHash }
```

### KRNL-Enhanced Atomic Flow (This Project)
```
Client → Server → POST /verify → Start KRNL workflow ⚡
                                  ├─ Returns { isValid: true } immediately
                                  └─ Background: polls workflow status every 2s
                                                      ↓
Server serves resource to client
                                                      ↓
Client uses resource
                                                      ↓
Server → POST /settle → Check workflow status:
                        ├─ Completed? Return cached tx hash ✓
                        ├─ Running? Wait up to 30s for completion
                        └─ Failed/timeout? Fall back to standard settle
```

### Key Differences

| Aspect | Standard x402 | KRNL Atomic |
|--------|---------------|-------------|
| **Verify endpoint** | Checks signature only | Starts workflow, returns immediately |
| **Settlement** | Separate `/settle` call | Happens in background during workflow |
| **Timing** | Settlement after resource delivery | Settlement in parallel with resource use |
| **Idempotency** | Cache-based | Workflow tracking |
| **Resilience** | N/A | Falls back to standard if KRNL unavailable |

### SDK Integration

The x402 SDK calls your facilitator:

```ts
// x402.useFacilitator() makes these calls
const { isValid } = await verify(payload, requirements);  // → POST /facilitator/verify
// ... serve resource ...
const { transaction } = await settle(payload, requirements);  // → POST /facilitator/settle
```

Your facilitator uses KRNL-only:
- `/verify`: Always starts a KRNL workflow and returns `{ isValid: true }` immediately
- `/settle`: Waits or returns cached result from the KRNL workflow

**Solana**: Disabled in this project for now. Only EVM networks are advertised in `/supported`.

## 📁 Project Structure

```
krnl-x402/
├── index.ts                      # Main server entry
├── facilitator/
│   ├── verify/
│   │   ├── index.ts             # Verify routes
│   │   └── handlers.ts          # Verify logic with KRNL middleware
│   ├── settle/
│   │   ├── index.ts             # Settle routes  
│   │   └── handlers.ts          # Settle with workflow status checking
│   └── supported/
│       └── index.ts             # Supported networks
├── middleware/
│   └── krnl-x402.ts             # KRNL async workflow starter
├── lib/
│   ├── krnl-client.ts           # JSON-RPC client + polling logic
│   ├── workflow-builder.ts      # KRNL DSL JSON builder
│   └── workflow-store.ts        # Payment nonce → workflow tracking
├── package.json
├── README.md
└── INTEGRATION_SUMMARY.md        # Detailed architecture docs
```

## Performance & Scaling

### Current (Development)
- In-memory workflow tracking (`Map`)
- Single server instance
- Direct polling to KRNL node

### Production Recommendations
1. **Replace Map with Redis**:
   ```typescript
   // lib/workflow-store.ts
   await redis.setex(`workflow:${nonce}`, 3600, JSON.stringify(tracking));
   ```

2. **Horizontal scaling**:
   - Redis allows multiple facilitator instances
   - Each instance can poll independently
   - Shared workflow state

3. **Monitoring**:
   - Track workflow completion rates
   - Monitor polling performance
   - Alert on high fallback rates

4. **Optimizations**:
   - Fastify's optimized JSON serialization
   - Non-blocking async architecture
   - Background polling doesn't block requests
   - EIP-4337 bundled transactions

## Troubleshooting

### KRNL Workflow Times Out
**Symptom**: `/settle` falls back to standard settle after 30s wait

**Solutions**:
- Check KRNL node status
- Verify RPC_URL is responsive
- Check bundler/paymaster configuration
- Review KRNL node logs

### Workflow Not Found in /settle
**Symptom**: "No KRNL workflow tracked" log message

**Causes**:
- Server restarted (in-memory Map cleared)
- Different server instance (need Redis)
- Payment nonce extraction failed

**Solutions**:
- Deploy Redis for persistent tracking
- Check EVM payload format
- Review verify logs for workflow ID

### Background Polling Not Working
**Symptom**: Workflow status stays "pending"

**Check**:
- KRNL_NODE_URL is accessible
- `krnl_getWorkflowStatus` RPC method works
- Check server logs for polling errors
- Verify workflow ID is correct

## Development Tips

### Test KRNL Flow
```bash
# 1. Enable KRNL and start server
KRNL_ENABLED=true npm run dev

# 2. Send verify request (returns immediately)
curl -X POST http://localhost:3000/facilitator/verify \
  -H "Content-Type: application/json" \
  -d @test-payment.json

# Response: { "isValid": true, "payer": "0x..." }

# 3. Check logs for workflow ID
# Output: "📝 Tracking workflow wf_abc123 for nonce 0x..."

# 4. Wait 10 seconds for workflow to complete

# 5. Send settle request
curl -X POST http://localhost:3000/facilitator/settle \
  -H "Content-Type: application/json" \
  -d @test-payment.json

# Response: { "success": true, "transaction": "0x..." }
```



### Monitor Workflow Status
```typescript
// Add to your code
import { getWorkflowByNonce } from './lib/workflow-store';

const workflow = getWorkflowByNonce(paymentNonce);
console.log('Workflow status:', workflow?.status);
console.log('Started at:', new Date(workflow?.startedAt || 0));
```

## License

MIT

## Contributing

Contributions welcome! Please read [INTEGRATION_SUMMARY.md](./INTEGRATION_SUMMARY.md) for architecture details.

## Questions?

- **KRNL Protocol**: https://krnl.xyz
- **x402 Standard**: https://github.com/x402-protocol/x402
- **Issues**: Please open a GitHub issue
