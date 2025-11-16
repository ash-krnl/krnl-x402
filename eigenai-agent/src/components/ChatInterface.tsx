import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { EigenAIService } from '../services/index.js';
import { cleanAIResponse } from '../utils/index.js';
import { TypewriterExtensiveMarkdown } from './TypewriterExtensiveMarkdown.js';
import { ExtensiveMarkdownRenderer } from './ExtensiveMarkdownRenderer.js';
import { TypingDots } from './TypingDots.js';

interface Message {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
}

interface DebugLog {
  timestamp: Date;
  message: string;
  type: 'log' | 'error';
}

interface ChatInterfaceProps {
  eigenaiService: EigenAIService;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ eigenaiService }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInput, setShowInput] = useState(true);
  const [currentTypingMessage, setCurrentTypingMessage] = useState<string>('');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const [showDebugLogs, setShowDebugLogs] = useState(true);

  // Intercept console.log and console.error
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;

    const formatArg = (arg: any) => {
      const type = typeof arg;
      if (type === 'bigint') {
        return arg.toString();
      }
      if (type === 'object' && arg !== null) {
        try {
          return JSON.stringify(
            arg,
            (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
            2
          );
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    };

    console.log = (...args: any[]) => {
      const message = args.map(formatArg).join(' ');
      setDebugLogs(prev => [...prev, { timestamp: new Date(), message, type: 'log' }]);
      originalLog(...args);
    };

    console.error = (...args: any[]) => {
      const message = args.map(formatArg).join(' ');
      setDebugLogs(prev => [...prev, { timestamp: new Date(), message, type: 'error' }]);
      originalError(...args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
    };
  }, []);

  // Calculate available height for messages
  const availableHeight = useMemo(() => {
    let height = process.stdout.rows - 3; // Reserve 3 lines for input area
    if (messages.length === 0) {
      height -= 4; // Reserve space for header and welcome message
    }
    if (showDebugLogs) {
      height = Math.floor(height * 0.6); // Use 60% for messages, 40% for logs
    }
    return Math.max(height, 10); // Minimum 10 lines
  }, [messages.length, showDebugLogs]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    setScrollOffset(0); // Reset scroll to show latest messages
  }, [messages.length, currentTypingMessage]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      process.exit(0);
    }
    // Toggle debug logs with 'd' key
    if (input === 'd' && showInput) {
      setShowDebugLogs(prev => !prev);
      return;
    }
    // Only allow scrolling when not typing in input
    if (!showInput) {
      if (key.upArrow) {
        setScrollOffset(prev => Math.min(prev + 1, Math.max(0, messages.length - availableHeight)));
      } else if (key.downArrow) {
        setScrollOffset(prev => Math.max(prev - 1, 0));
      }
    }
  });

  const handleSubmit = async (value: string) => {
    if (!value.trim() || isLoading) return;

    // Handle commands
    if (value.startsWith('/')) {
      handleCommand(value.trim());
      setInput('');
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: value,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Check if this is an OnlyBrains request
      if (eigenaiService.isOnlyBrainsAvailable() && eigenaiService.isOnlyBrainsRequest(value)) {
        setIsLoading(false);
        
        // Agent: Let me get the content for you
        const initialResponse: Message = {
          role: 'ai',
          content: 'Let me get the content for you.\n\nCalling OnlyBrains API...',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, initialResponse]);
        
        // Small delay for narrative effect
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Get pricing info
        const pricing = await eigenaiService.getOnlyBrainsPricing();
        
        // Agent: You have to pay to access the "good" content
        const paymentPrompt: Message = {
          role: 'ai',
          content: `You have to pay ${pricing.price} to access the "good" content. Shall I proceed with the payment?\n\n(Type "yes" to approve or "no" to cancel)`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, paymentPrompt]);
        
        return;
      }
      
      // Check if user is responding to payment approval
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content.includes('Shall I proceed with the payment')) {
        const userResponse = value.toLowerCase().trim();
        
        if (userResponse === 'yes' || userResponse === 'y') {
          const processingMessage: Message = {
            role: 'ai',
            content: 'Paying for OnlyBrains subscription...',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, processingMessage]);
          
          // Small delay for narrative
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          try {
            console.log('🔵 [ChatInterface] Calling eigenaiService.purchaseOnlyBrains()...');
            // Execute the purchase
            const result = await eigenaiService.purchaseOnlyBrains();
            console.log('🔵 [ChatInterface] Purchase successful:', result);
            
            const successMessage: Message = {
              role: 'ai',
              content: `✅ You now have access to the "good" content!\n\n**${result.content.title}**\n${result.content.description}\n\n**Available Datasets:**\n${result.content.datasets.map(d => `• ${d}`).join('\n')}\n\n${result.content.note}\n\n**Subscription Status:** ${result.subscription.status}\n**Expires:** ${new Date(result.subscription.expiresAt).toLocaleDateString()}`,
              timestamp: new Date(),
              isTyping: true
            };
            setMessages(prev => [...prev, successMessage]);
            setCurrentTypingMessage(successMessage.content);
          } catch (error: any) {
            console.error('🔴 [ChatInterface] Error caught:', error);
            console.error('🔴 [ChatInterface] Error stack:', error.stack);
            const errorMessage: Message = {
              role: 'ai',
              content: `❌ Payment failed: ${error.message}`,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
          }
          
          setIsLoading(false);
          return;
        } else if (userResponse === 'no' || userResponse === 'n') {
          const cancelMessage: Message = {
            role: 'ai',
            content: 'Payment cancelled. No charges were made.',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, cancelMessage]);
          setIsLoading(false);
          return;
        }
      }

      // Regular chat flow
      const response = await eigenaiService.sendMessage(value);
      const cleanedResponse = cleanAIResponse(response.choices[0].message.content);

      setIsLoading(false);

      // Add the AI message with typewriter effect
      const aiMessage: Message = {
        role: 'ai',
        content: cleanedResponse,
        timestamp: new Date(),
        isTyping: true
      };

      setMessages(prev => [...prev, aiMessage]);
      setCurrentTypingMessage(cleanedResponse);
    } catch (error) {
      setIsLoading(false);
      const errorMessage: Message = {
        role: 'ai',
        content: `Error: ${error}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleCommand = (command: string) => {
    switch (command.toLowerCase()) {
      case '/clear':
        setMessages([]);
        break;
      case '/help':
        const helpMessage: Message = {
          role: 'ai',
          content: `# KRNL Agent Commands

## Available Commands:
- **/help** - Show this command reference
- **/clear** - Clear conversation history
- **/exit** - Exit KRNL Agent
- **Ctrl+C** - Force quit

## About:
KRNL Agent is an intelligent assistant powered by Eigen AI, designed to help with various tasks including code assistance, explanations, and general questions.

Ready to assist! 🚀`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, helpMessage]);
        break;
      case '/exit':
        process.exit(0);
        break;
      default:
        const unknownMessage: Message = {
          role: 'ai',
          content: `Unknown command: ${command}. Type /help for available commands.`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, unknownMessage]);
    }
  };

  // Calculate which messages to show based on scroll
  const visibleMessages = useMemo(() => {
    const allMessages = [...messages];
    if (isLoading) {
      allMessages.push({
        role: 'ai' as const,
        content: '',
        timestamp: new Date(),
        isTyping: false
      });
    }

    // Show latest messages minus scroll offset
    const startIndex = Math.max(0, allMessages.length - availableHeight + scrollOffset);
    return allMessages.slice(startIndex);
  }, [messages, isLoading, availableHeight, scrollOffset]);

  return (
    <Box flexDirection="column" height={process.stdout.rows}>
      {/* Simple Header Banner - Only show if no messages */}
      {messages.length === 0 && (
        <Box justifyContent="center" marginBottom={1}>
          <Text color="cyan" bold>KRNL Agent </Text>
          <Text color="gray">powered by </Text>
          <Text color="blue" bold>Eigen AI</Text>
        </Box>
      )}

      {/* Chat Messages - Fixed Height */}
      <Box flexDirection="column" height={availableHeight} paddingX={1}>
        {messages.length === 0 && (
          <Box marginBottom={2}>
            <Box justifyContent="center" marginBottom={1}>
              <Text color="gray">Ready to help with your tasks</Text>
            </Box>
            <Box justifyContent="center">
              <Text color="gray" dimColor>Commands: </Text>
              <Text color="cyan">/help</Text>
              <Text color="gray" dimColor> • </Text>
              <Text color="cyan">/clear</Text>
              <Text color="gray" dimColor> • </Text>
              <Text color="cyan">/exit</Text>
            </Box>
          </Box>
        )}

        {visibleMessages.map((message, index) => {
          if (message.content === '' && isLoading) {
            return (
              <Box key={`loading-${index}`} flexDirection="column">
                <Box>
                  <Text color="magenta" bold>[{new Date().toLocaleTimeString()}] </Text>
                  <Text color="green" bold>SYSTEM@AI: </Text>
                  <TypingDots color="cyan" speed={500} />
                </Box>
              </Box>
            );
          }

          return (
            <Box key={index} flexDirection="column">
              {message.role === 'user' ? (
                /* User Message - 90s Style */
                <Box>
                  <Text color="magenta" bold>[{message.timestamp.toLocaleTimeString()}] </Text>
                  <Text color="yellow" bold>USER@KRNL: </Text>
                  <Text color="white">{message.content}</Text>
                </Box>
              ) : (
                /* AI Response - 90s Style */
                <Box flexDirection="column">
                  <Box>
                    <Text color="magenta" bold>[{message.timestamp.toLocaleTimeString()}] </Text>
                    <Text color="green" bold>SYSTEM@AI: </Text>
                  </Box>
                  <Box paddingLeft={2}>
                    {message.isTyping ? (
                      <TypewriterExtensiveMarkdown content={message.content} />
                    ) : (
                      <ExtensiveMarkdownRenderer content={message.content} />
                    )}
                  </Box>
                </Box>
              )}
              <Box height={1} />
            </Box>
          );
        })}
      </Box>

      {/* Scroll indicator */}
      {messages.length > availableHeight && (
        <Box justifyContent="center">
          <Text color="gray" dimColor>
            {scrollOffset > 0 ? `↑ ${scrollOffset} messages above` : '↓ Latest messages'}
          </Text>
        </Box>
      )}

      {/* Debug Logs Panel */}
      {showDebugLogs && debugLogs.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1} height={Math.floor(process.stdout.rows * 0.35)}>
          <Box>
            <Text color="blue" bold>🔍 Debug Logs </Text>
            <Text color="gray" dimColor>(Press 'd' to toggle)</Text>
          </Box>
          <Box flexDirection="column" overflowY="hidden">
            {debugLogs.slice(-10).map((log, idx) => (
              <Box key={idx}>
                <Text color={log.type === 'error' ? 'red' : 'gray'} dimColor>
                  [{log.timestamp.toLocaleTimeString()}] 
                </Text>
                <Text color={log.type === 'error' ? 'red' : 'white'}>
                  {' '}{log.message}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Fixed Input Area - 90s Terminal Style */}
      {showInput && (
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="yellow" bold>USER@KRNL:</Text>
          <Text color="white"> </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="Enter command..."
          />
          <Text color="gray" dimColor> (Press 'd' to toggle debug logs)</Text>
        </Box>
      )}
    </Box>
  );
};