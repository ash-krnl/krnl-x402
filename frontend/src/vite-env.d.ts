/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string
  readonly VITE_PRIVY_APP_SECRET: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_DELEGATED_ACCOUNT_ADDRESS: string
  readonly VITE_TARGET_CONTRACT_OWNER: string
  readonly VITE_DELEGATE_OWNER: string
  readonly VITE_PAYMENT_CONTRACT_ADDRESS: string
  readonly VITE_MOCK_USDC_ADDRESS: string
  readonly VITE_ATTESTOR_IMAGE: string
  readonly VITE_VERIFY_URL: string
  readonly VITE_RPC_URL: string
  readonly VITE_MIN_EXCHANGE_RATE: string
  readonly VITE_MAX_EXCHANGE_RATE: string
  readonly VITE_MIN_FEE: string
  readonly VITE_MAX_FEE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_DELEGATED_ACCOUNT_ADDRESS: string;
  readonly VITE_PRIVY_APP_SECRET?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    Go: new () => Go;
    makeUnsignTx: (params: string) => WasmResult;
    makeSignHash: (params: string) => { signHash: string };
    compileUnsignTxWithSignature: (params: string) => CompileResult;
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}

interface Go {
  importObject: WebAssembly.Imports;
  run: (instance: WebAssembly.Instance) => void;
}

interface WasmResult {
  error?: string;
  unsignedTx: string;
  signHash: string;
}

interface CompileResult {
  error?: string;
  signedTx: string;
  txHash: string;
}