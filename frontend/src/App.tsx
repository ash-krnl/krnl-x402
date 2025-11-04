import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PrivyProvider from './providers/PrivyProvider';
import { KRNLProvider } from '@krnl-dev/sdk-react-7702';
import { config } from './lib/krnl';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';
import { Toaster } from 'react-hot-toast';

// Lazy load pages for better performance
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="h-12 w-12 animate-spin text-primary" />
  </div>
);

// Main component that handles auth state
const MainApp = () => {
  const { ready, authenticated } = usePrivy();

  if (!ready) {
    return <PageLoader />;
  }

  return authenticated ? <Dashboard /> : <Login />;
};

function App() {
  return (
    <ErrorBoundary>
      <PrivyProvider>
        <KRNLProvider config={config}>
          <Router>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<MainApp />} />
              </Routes>
            </Suspense>
          </Router>
          <Toaster />
        </KRNLProvider>
      </PrivyProvider>
    </ErrorBoundary>
  );
}

export default App