import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet } from 'lucide-react';

const Login = () => {
  const { ready, login } = usePrivy();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="shadow-xl">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-4xl font-bold">Real Estate Investment</CardTitle>
            <CardDescription className="text-base">
              Connect your wallet to start investing
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Button
              onClick={login}
              disabled={!ready}
              className="w-full"
              size="lg"
            >
              <Wallet className="mr-2 h-5 w-5" />
              {!ready ? 'Loading...' : 'Connect Wallet'}
            </Button>
          </CardContent>
          
          <CardFooter className="flex flex-col space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              By connecting, you agree to our{' '}
              <a href="#" className="text-primary hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-primary hover:underline">
                Privacy Policy
              </a>
            </p>
          </CardFooter>
        </Card>

        <div className="mt-8 text-center">
          <div className="flex items-center justify-center space-x-4 text-sm text-muted-foreground">
            <span>Powered by</span>
            <span className="font-semibold">Privy</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;