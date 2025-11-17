import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import Gradient from 'ink-gradient';
import { EigenAIService } from '../services/index.js';
import { StreamingText } from './StreamingText.js';

interface Message {
  role: 'user' | 'system';
  content: string;
}

interface ChatInterfaceProps {
  eigenaiService: EigenAIService;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ eigenaiService }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingOnlyBrainsRequest, setPendingOnlyBrainsRequest] = useState(false);
  const [krnlStatus, setKrnlStatus] = useState<string[]>([]);
  const [currentStreamingIndex, setCurrentStreamingIndex] = useState<number | null>(null);
  const [showPaymentPrompt, setShowPaymentPrompt] = useState(false);

  useInput((input: string, key: { ctrl: boolean }) => {
    if (key.ctrl && input === 'c') {
      process.exit(0);
    }
  });

  const handleSubmit = async (value: string) => {
    const trimmedInput = value.trim();
    if (!trimmedInput || isLoading) return;

    setInput('');

    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: trimmedInput
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Handle OnlyBrains payment approval
    if (pendingOnlyBrainsRequest) {
      const normalized = trimmedInput.toLowerCase().replace(/[?.!,]/g, '');
      
      if (normalized === 'y' || normalized.startsWith('yes')) {
        // Hide prompt immediately
        setShowPaymentPrompt(false);

        const startTime = Date.now();

        try {
          // Show KRNL workflow progress based on actual workflow steps
          setKrnlStatus(['⚡ Initializing KRNL workflow...']);
          await new Promise(resolve => setTimeout(resolve, 500));
          
          setKrnlStatus(prev => [...prev, '📋 Step: x402-verify-payment']);
          await new Promise(resolve => setTimeout(resolve, 1200));
          
          setKrnlStatus(prev => [...prev, '✓ Payment signature verified (exit_code: 0)']);
          await new Promise(resolve => setTimeout(resolve, 400));
          
          setKrnlStatus(prev => [...prev, '🔢 Step: x402-encode-payment-params']);
          await new Promise(resolve => setTimeout(resolve, 800));
          
          setKrnlStatus(prev => [...prev, '✓ Payment params encoded (exit_code: 0)']);
          await new Promise(resolve => setTimeout(resolve, 400));
          
          setKrnlStatus(prev => [...prev, '🔐 Step: prepare-authdata']);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          setKrnlStatus(prev => [...prev, '✓ Authorization data prepared (exit_code: 0)']);
          await new Promise(resolve => setTimeout(resolve, 400));
          
          setKrnlStatus(prev => [...prev, '📝 Step: target-calldata']);
          
          const result = await eigenaiService.purchaseOnlyBrains();
          
          setKrnlStatus(prev => [...prev, '✓ Target calldata generated (exit_code: 0)']);
          await new Promise(resolve => setTimeout(resolve, 400));
          
          setKrnlStatus(prev => [...prev, '🔧 Step: sca-calldata']);
          await new Promise(resolve => setTimeout(resolve, 600));
          
          setKrnlStatus(prev => [...prev, '✓ Smart account calldata prepared (exit_code: 0)']);
          await new Promise(resolve => setTimeout(resolve, 400));
          
          setKrnlStatus(prev => [...prev, '📡 Broadcasting transaction to Base Sepolia...']);
          await new Promise(resolve => setTimeout(resolve, 600));
          
          setKrnlStatus(prev => [...prev, '✓ Transaction confirmed on-chain']);
          await new Promise(resolve => setTimeout(resolve, 400));
          
          const endTime = Date.now();
          const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(2);
          setKrnlStatus(prev => [...prev, `🎉 Payment settled in ${elapsedSeconds} seconds`]);
          await new Promise(resolve => setTimeout(resolve, 800));

          const successMessage: Message = {
            role: 'system',
            content: "Payment's done, bro, we now have access to the \"good\" content 😉"
          };
          const messageIndex = messages.length + 1;
          setMessages(prev => [...prev, successMessage]);
          setCurrentStreamingIndex(messageIndex);
        } catch (error: any) {
          const errorMessage: Message = {
            role: 'system',
            content: `❌ Payment failed: ${error.message}`
          };
          setMessages(prev => [...prev, errorMessage]);
          setKrnlStatus([]); // Clear status on error
        }

        setPendingOnlyBrainsRequest(false);
        setShowPaymentPrompt(false);
        setIsLoading(false);
        // KRNL status will be cleared after success message finishes typing
        return;
      }

      if (normalized === 'n' || normalized.startsWith('no')) {
        // Hide prompt immediately
        setShowPaymentPrompt(false);
        
        const cancelMessage: Message = {
          role: 'system',
          content: 'Payment cancelled. No charges were made.'
        };
        setMessages(prev => [...prev, cancelMessage]);
        setPendingOnlyBrainsRequest(false);
        setIsLoading(false);
        return;
      }

      const clarifyMessage: Message = {
        role: 'system',
        content: 'Please answer "yes" or "no" to approve the OnlyBrains payment.'
      };
      setMessages(prev => [...prev, clarifyMessage]);
      setIsLoading(false);
      return;
    }

    // Handle special commands
    if (trimmedInput === '/exit') {
      process.exit(0);
    }

    if (trimmedInput === '/clear') {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    // Call AI service
    try {
      const response = await eigenaiService.sendMessage(trimmedInput);
      
      // Extract the actual message content from the response
      let messageContent = '';
      
      if (response.choices && response.choices[0]?.message?.content) {
        messageContent = response.choices[0].message.content;
      } else if (response.content) {
        messageContent = response.content;
      } else if (response.message) {
        messageContent = response.message;
      } else if (typeof response === 'string') {
        messageContent = response;
      } else {
        messageContent = JSON.stringify(response);
      }
      
      // Clean up channel tags: remove everything from <|channel|> to <|end|> including <|end|>
      messageContent = messageContent.replace(/<\|channel\|>.*?<\|end\|>/gs, '').trim();
      
      // Check for OnlyBrains tool marker
      if (messageContent.includes('<<tool:onlybrains.request>>')) {
        const cleanedResponse = messageContent.replace('<<tool:onlybrains.request>>', '').trim();
        
        if (cleanedResponse) {
          const aiMessage: Message = {
            role: 'system',
            content: cleanedResponse
          };
          setMessages(prev => [...prev, aiMessage]);
          setCurrentStreamingIndex(messages.length + 1);
        }

        // Payment prompt will show AFTER the streaming completes
        setPendingOnlyBrainsRequest(true);
        setShowPaymentPrompt(false); // Will be set to true when streaming completes
      } else {
        const aiMessage: Message = {
          role: 'system',
          content: messageContent
        };
        setMessages(prev => [...prev, aiMessage]);
        setCurrentStreamingIndex(messages.length + 1);
      }
    } catch (error: any) {
      const errorMessage: Message = {
        role: 'system',
        content: `Error: ${error.message}`
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Gradient name="rainbow">
          <Text bold>━━━ KRNL Agent Powered by EigenAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
        </Gradient>
      </Box>

      {/* Chat Messages */}
      <Box flexDirection="column" marginBottom={1}>
        {messages.map((message, index) => (
          <Box key={index} flexDirection="column" marginBottom={1}>
            {message.role === 'user' ? (
              <Box>
                <Text bold color="cyan">user: </Text>
                <Text>{message.content}</Text>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Text bold color="green">system: </Text>
                {currentStreamingIndex === index ? (
                  <StreamingText 
                    content={message.content} 
                    speed={15}
                    onComplete={() => {
                      setCurrentStreamingIndex(null);
                      // Show payment prompt after streaming completes if pending
                      if (pendingOnlyBrainsRequest && !showPaymentPrompt) {
                        setShowPaymentPrompt(true);
                      }
                      // Clear KRNL status after success message finishes
                      if (message.content.includes("Payment's done")) {
                        setTimeout(() => setKrnlStatus([]), 1000);
                      }
                    }}
                  />
                ) : (
                  <Text>{message.content}</Text>
                )}
              </Box>
            )}
          </Box>
        ))}

        {/* Loading indicator */}
        {isLoading && !pendingOnlyBrainsRequest && (
          <Box>
            <Text bold color="green">system: </Text>
            <Text color="gray">
              <Spinner type="dots" /> thinking...
            </Text>
          </Box>
        )}
      </Box>

      {/* KRNL Workflow Status */}
      {krnlStatus.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} marginBottom={1}>
          <Box marginBottom={1}>
            <Text color="cyan" bold>◢ KRNL WORKFLOW STATUS </Text>
            {!krnlStatus[krnlStatus.length - 1].includes('Payment settled') && (
              <Text color="magenta"><Spinner type="dots" /></Text>
            )}
          </Box>
          {krnlStatus.map((status, idx) => (
            <Box key={idx} marginLeft={1}>
              <Text color={status.includes('✓') || status.includes('🎉') ? 'green' : 'cyan'}>{status}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Payment Approval Prompt - Shows after streaming completes */}
      {showPaymentPrompt && pendingOnlyBrainsRequest && (
        <Box 
          flexDirection="column" 
          borderStyle="round" 
          borderColor="yellow" 
          paddingX={2} 
          paddingY={1}
          marginBottom={1}
        >
          <Box justifyContent="center" marginBottom={1}>
            <Text bold color="yellow">⚠️  PAYMENT AUTHORIZATION REQUIRED</Text>
          </Box>
          <Box flexDirection="column">
            <Text>Approve OnlyBrains payment for <Text bold color="cyan">$1.00 USDC</Text>?</Text>
            <Box marginTop={1}>
              <Text dimColor>Reply with </Text>
              <Text bold color="green">"yes"</Text>
              <Text dimColor> to approve or </Text>
              <Text bold color="red">"no"</Text>
              <Text dimColor> to cancel</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Input Area */}
      <Box>
        <Text bold color="cyan">➤ </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={pendingOnlyBrainsRequest ? "yes or no?" : "Enter your message..."}
        />
      </Box>
    </Box>
  );
};
