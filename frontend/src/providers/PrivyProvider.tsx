import { PrivyProvider as Provider } from '@privy-io/react-auth';
import { ReactNode } from 'react';

interface PrivyProviderProps {
  children: ReactNode;
}

const PrivyProvider = ({ children }: PrivyProviderProps) => {
  return (
    <Provider
      appId={import.meta.env.VITE_PRIVY_APP_ID || ''}
      config={{
        appearance: {
          theme: 'light',
          accentColor: '#676FFF',
          logo: 'https://your-logo-url.com/logo.png',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          }
        },
        defaultChain: {
          id: 11155111, // Sepolia
          name: 'Sepolia',
          network: 'sepolia',
          nativeCurrency: {
            decimals: 18,
            name: 'Sepolia Ether',
            symbol: 'ETH',
          },
          rpcUrls: {
            default: { http: ['https://sepolia.infura.io/v3/'] },
            public: { http: ['https://sepolia.infura.io/v3/'] },
          },
          blockExplorers: {
            default: { name: 'Sepolia Etherscan', url: 'https://sepolia.etherscan.io' },
          },
        },
        walletConnectCloudProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
        loginMethods: ['wallet', 'email', 'sms'],
        supportedChains: [
          {
            id: 11155111, // Sepolia
            name: 'Sepolia',
            network: 'sepolia',
            nativeCurrency: {
              decimals: 18,
              name: 'Sepolia Ether',
              symbol: 'ETH',
            },
            rpcUrls: {
              default: { http: ['https://sepolia.infura.io/v3/'] },
              public: { http: ['https://sepolia.infura.io/v3/'] },
            },
            blockExplorers: {
              default: { name: 'Sepolia Etherscan', url: 'https://sepolia.etherscan.io' },
            },
          },
        ],
      }}
    >
      {children}
    </Provider>
  );
};

export default PrivyProvider;