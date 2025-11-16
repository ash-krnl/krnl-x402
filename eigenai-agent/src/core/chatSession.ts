import { EigenAIService } from '../services';
import { CLIInterface } from '../ui/cliInterface';
import { cleanAIResponse } from '../utils';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

export class ChatSession {
  private eigenaiService: EigenAIService;
  private cli: CLIInterface;
  private chatHistory: ChatMessage[] = [];
  private isRunning: boolean = false;

  constructor(eigenaiService: EigenAIService) {
    this.eigenaiService = eigenaiService;
    this.cli = new CLIInterface();
  }

  async start() {
    this.cli.displayBanner();
    this.isRunning = true;

    while (this.isRunning) {
      try {
        const userInput = await this.cli.getUserInput();

        if (this.handleCommand(userInput)) {
          continue;
        }

        if (!userInput.trim()) {
          continue;
        }

        await this.processUserMessage(userInput);

      } catch (error) {
        this.cli.displayError(`${error}`);
      }
    }
  }

  private handleCommand(input: string): boolean {
    const command = input.toLowerCase().trim();

    switch (command) {
      case '/help':
        this.cli.showHelp();
        return true;

      case '/clear':
        this.cli.displayBanner();
        return true;

      case '/exit':
      case '/quit':
        this.cli.displaySystemMessage('Disconnecting from neural network... Goodbye! 🚀');
        this.isRunning = false;
        return true;

      case '/history':
        this.cli.showHistory(this.chatHistory);
        return true;

      default:
        if (input.startsWith('/')) {
          this.cli.displayError(`Unknown command: ${input}. Type /help for available commands.`);
          return true;
        }
        return false;
    }
  }

  private async processUserMessage(message: string) {
    // Add user message to history
    this.chatHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    this.cli.displayUserMessage(message);
    this.cli.displayProcessing();

    try {
      const response = await this.eigenaiService.sendMessage(message);
      const cleanedResponse = cleanAIResponse(response.choices[0].message.content);

      // Add AI response to history
      this.chatHistory.push({
        role: 'ai',
        content: cleanedResponse,
        timestamp: new Date()
      });

      this.cli.displayAIResponse(cleanedResponse, {
        total: response.usage.total_tokens,
        prompt: response.usage.prompt_tokens,
        completion: response.usage.completion_tokens
      });

    } catch (error) {
      throw error;
    }
  }

}