# EigenAI Agent - OnlyBrains Payment CLI

Intelligent CLI agent powered by **EigenAI** for conversational AI interactions with seamless x402 payments via **KRNL Protocol**.

## 🎯 Overview

This agent demonstrates how to build an AI-powered application that:
- Uses **EigenAI's decentralized inference network** for natural language processing
- Handles **x402 micropayments** for premium content (OnlyBrains)
- Leverages **KRNL Protocol** for atomic verify+settle workflows
- Implements **EIP-4337 smart accounts** for gasless UX
- Provides **real-time workflow visualization** with live status updates

## ✨ Features

- 🤖 **Conversational AI** - Chat naturally with EigenAI to discover and access content
- 💳 **Smart Payment Detection** - AI automatically detects OnlyBrains payment requests
- ⚡ **Streaming Responses** - Smooth typewriter effect for AI messages
- 📊 **Live Workflow Tracking** - Visual KRNL workflow status with step-by-step progress
- 🔐 **EIP-4337 Integration** - Smart account wallets with gasless transactions
- 💰 **Pre-flight Balance Checks** - Validates USDC balance before payment attempts
- 🎨 **Beautiful CLI UI** - Built with Ink React for responsive terminal experience

## 🌟 Why EIP-4337 Smart Accounts?

### Agent Pays Own Gas

Unlike traditional facilitators where the facilitator must hold ETH and pay gas:
- ✅ **Agent's smart account holds ETH** - Self-sponsored transactions
- ✅ **No facilitator trust required** - Agent controls its own gas budget
- ✅ **Transparent gas costs** - Agent knows exactly what it's spending
- ✅ **Multi-chain flexibility** - Same account address works on all EVM chains

### Gasless UX with Paymasters

For production use, integrate paymasters for seamless UX:
- ✅ **Server sponsors gas** - Your backend pays gas on behalf of agents
- ✅ **No ETH needed by agent** - Smart account only needs USDC for payments
- ✅ **Pay gas in ERC-20** - Use USDC/USDT to pay for gas fees
- ✅ **Decoupled from facilitator** - Gas sponsorship independent of payment flow

### Multi-chain Out of the Box

One smart account works everywhere:
```
Deploy on Base Sepolia    → 0x1234...abcd
Deploy on Optimism Sepolia → 0x1234...abcd (same address!)
Deploy on Arbitrum Sepolia → 0x1234...abcd (same address!)
```

**Benefits:**
- Same account factory works on all EVM chains
- Single KRNL workflow template deploys everywhere
- No per-chain configuration or key management

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+
- **EigenAI API Access** - Sign up at [eigencloud.xyz](https://eigencloud.xyz)
- **Wallet Private Key** - For signing transactions (EOA)
- **Test USDC** - On Base Sepolia for payments
- **Facilitator** - Running KRNL-enhanced facilitator (see main README)

### Installation

```bash
cd eigenai-agent
npm install
cp .env.example .env
```

### Configuration

Edit `.env` with your settings:

```bash
# EigenAI Configuration
EIGENAI_API_URL=https://api.eigencloud.xyz
EIGENAI_API_KEY=your_eigenai_key

# Wallet Configuration (EOA for signing)
PRIVATE_KEY=0xyour_private_key_here

# OnlyBrains / x402 Configuration
ONLYBRAINS_SERVER_URL=http://localhost:4000  # Your OnlyBrains server
FACILITATOR_URL=https://your-ngrok-url.ngrok-free.app

# EIP-4337 Configuration
ACCOUNT_FACTORY_ADDRESS=0xYourFactoryAddress
APP_SECRET=your_app_secret_for_salt

# Contract Addresses (Base Sepolia)
TARGET_CONTRACT=0xYourTargetContractAddress
TARGET_CONTRACT_OWNER=0xOwnerAddress
USDC_CONTRACT=0x036CbD53842c5426634e7929541eC2318f3dCF7e
RECIPIENT_ADDRESS=0xRecipientAddress

# KRNL Configuration
KRNL_NODE_URL=https://node.krnl.xyz

# RPC Configuration
RPC_URL=https://sepolia.base.org
```

### Run the Agent

```bash
npm run dev
```

## 💬 Usage Example

```
━━━ KRNL Agent Powered by EigenAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

user: hey, what can you help me with?

system: Hey! I can help you explore OnlyBrains - premium training 
content for AI models. Want to learn more?

user: tell me about onlybrains

system: OnlyBrains is premium training content for just $1.00 USDC. 
Think of it like OnlyFans but for AI - exclusive, high-quality 
content. Want to check it out?

Console prompt: Approve OnlyBrains payment ($1.00 USDC)? Reply "yes" or "no".

user: yes

╭─────────────────────────────────────────────╮
│ ◢ KRNL WORKFLOW STATUS ⏳                   │
│                                             │
│  ⚡ Initializing KRNL workflow...          │
│  📋 Step: x402-verify-payment              │
│  ✓ Payment signature verified (exit_code: 0)│
│  🔢 Step: x402-encode-payment-params       │
│  ✓ Payment params encoded (exit_code: 0)  │
│  🔐 Step: prepare-authdata                 │
│  ✓ Authorization data prepared (exit_code: 0)│
│  📝 Step: target-calldata                  │
│  ✓ Target calldata generated (exit_code: 0)│
│  🔧 Step: sca-calldata                     │
│  ✓ Smart account calldata prepared (exit_code: 0)│
│  📡 Broadcasting to Base Sepolia...        │
│  ✓ Transaction confirmed on-chain          │
│  🎉 Payment settled in 8.45 seconds        │
╰─────────────────────────────────────────────╯

system: Payment's done, bro, we now have access to the "good" 
content 😉
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EigenAI Agent                          │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Chat UI     │  │ EigenAI      │  │ OnlyBrains       │  │
│  │ (Ink React) │◄─┤ Service      │◄─┤ Payment Service  │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
│         │                │                     │            │
└─────────┼────────────────┼─────────────────────┼────────────┘
          │                │                     │
          ▼                ▼                     ▼
   ┌──────────┐   ┌──────────────┐   ┌─────────────────────┐
   │ Terminal │   │ EigenAI API  │   │ KRNL Facilitator    │
   │ (stdout) │   │ (Inference)  │   │ (verify+settle)     │
   └──────────┘   └──────────────┘   └─────────────────────┘
                                                │
                                                ▼
                                      ┌──────────────────────┐
                                      │ KRNL Protocol Node   │
                                      │ (Atomic Workflows)   │
                                      └──────────────────────┘
                                                │
                                                ▼
                                      ┌──────────────────────┐
                                      │ Base Sepolia         │
                                      │ (Settlement)         │
                                      └──────────────────────┘
```

## 📁 Project Structure

```
eigenai-agent/
├── src/
│   ├── index.tsx                    # Main entry point
│   ├── components/
│   │   ├── ChatInterface.tsx        # Main chat UI component
│   │   └── StreamingText.tsx        # Typewriter effect component
│   ├── services/
│   │   ├── eigenai.ts              # EigenAI API integration
│   │   ├── onlybrains.ts           # OnlyBrains payment logic
│   │   ├── wallet.ts               # Wallet/signing service
│   │   └── api.ts                  # HTTP client
│   └── types/
│       └── index.ts                # TypeScript interfaces
├── package.json
├── tsconfig.json
└── .env.example
```

## 🔑 Key Components

### EigenAI Service (`src/services/eigenai.ts`)

Handles AI interactions with EigenAI's decentralized inference network:
- Natural language chat completions
- OnlyBrains payment request detection
- Context-aware responses with personality

### OnlyBrains Service (`src/services/onlybrains.ts`)

Manages x402 payments with KRNL workflows:
- Smart account initialization (EIP-4337)
- Transaction intent signing
- USDC authorization (EIP-3009)
- Balance checks before payment
- x402-fetch integration for HTTP402 flow

### Chat Interface (`src/components/ChatInterface.tsx`)

Terminal UI built with Ink React:
- Streaming text with typewriter effect
- Payment prompt dialogue boxes
- Live KRNL workflow status panel
- Smooth scrolling and input handling

## 🔐 Security Considerations

### Private Key Management
- Store private keys securely in `.env` (never commit!)
- Use separate keys for testnet vs production
- Consider using hardware wallets for production

### Smart Account Security
- Smart accounts are deterministically generated using EOA + app secret
- EOA signs all transaction intents
- USDC authorizations are signed with EIP-712

### Balance Checks
- Pre-flight validation prevents failed transactions
- Checks smart account USDC balance before creating signatures
- Clear error messages for insufficient funds

## 🛠️ Development

### Running in Development Mode

```bash
npm run dev  # Uses tsx for hot reload
```

### Building for Production

```bash
npm run build  # Compiles TypeScript
npm start      # Runs compiled version
```

### Testing

```bash
# Test with small amounts on Base Sepolia
# Ensure you have:
# 1. Sepolia ETH for gas
# 2. Sepolia USDC in your smart account
# 3. Facilitator running with ngrok
```

## 🐛 Troubleshooting

### "Insufficient USDC balance" Error
- **Cause**: Smart account doesn't have enough USDC
- **Solution**: Send USDC to your smart account address (check logs for address)

### "OnlyBrains service not configured" Error
- **Cause**: Missing environment variables
- **Solution**: Check all required env vars are set in `.env`

### Streaming text appears broken
- **Cause**: Terminal doesn't support ANSI escape codes
- **Solution**: Use a modern terminal (iTerm2, Windows Terminal, etc.)

### KRNL workflow timeouts
- **Cause**: Facilitator unreachable or KRNL node issues
- **Solution**: 
  - Verify ngrok is running and facilitator is accessible
  - Check KRNL node status at https://node.krnl.xyz
  - Ensure proper gas settings for EIP-4337

## 📚 Learn More

### EigenAI Documentation
- **Overview**: https://docs.eigencloud.xyz/products/eigenai/concepts/eigenai-overview
- **API Reference**: https://docs.eigencloud.xyz/api-reference
- **Getting Started**: https://docs.eigencloud.xyz/getting-started

### KRNL Protocol
- **Docs**: https://docs.krnl.xyz
- **What is KRNL**: Decentralized protocol for verifiable off-chain computation
- **Use Cases**: Oracle feeds, AI inference, cross-chain messaging, API integrations

### x402 Protocol
- **Website**: https://x402.org
- **Spec**: HTTP-based micropayment protocol for web3
- **EIP-3009**: USDC's `transferWithAuthorization` function

### EIP-4337 (Account Abstraction)
- **Spec**: https://eips.ethereum.org/EIPS/eip-4337
- **Benefits**: Gasless transactions, social recovery, batched operations
- **Smart Accounts**: Deterministic addresses, programmable validation

## 🤝 Contributing

This is a reference implementation. Feel free to:
- Fork and customize for your use case
- Report bugs or suggest improvements
- Build new AI-powered payment experiences

## 📄 License

MIT License - see [LICENSE](../LICENSE) for details.

## 🔗 Related Projects

- **Main Facilitator**: [../README.md](../README.md)
- **KRNL SDK**: https://github.com/krnl-labs/krnl-sdk
- **x402 TypeScript**: https://github.com/x402-protocol/x402

---

Built with ❤️ using EigenAI, KRNL Protocol, and x402
