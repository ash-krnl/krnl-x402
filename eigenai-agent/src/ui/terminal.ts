import * as readline from 'readline';
import chalk from 'chalk';

export class TerminalUI {
  private rl: readline.Interface;
  private isProcessing: boolean = false;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '',
    });
  }

  async displayBanner() {
    console.clear();
    console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════╗
║                     🚀 EIGENAI TERMINAL                     ║
║                   Neural Network Interface                  ║
╚══════════════════════════════════════════════════════════════╝`));

    console.log(chalk.gray('> System initialization complete...'));
    console.log(chalk.gray('> Quantum encryption enabled...'));
    console.log(chalk.gray('> Neural pathways established...'));
    console.log(chalk.green('> AI Agent ONLINE\n'));

    console.log(chalk.yellow('Available commands:'));
    console.log(chalk.dim('  /help    - Show help menu'));
    console.log(chalk.dim('  /clear   - Clear terminal'));
    console.log(chalk.dim('  /exit    - Disconnect from neural network'));
    console.log(chalk.dim('  /status  - Show system status\n'));
  }

  async typewriterEffect(text: string, color: any = chalk.white, delay: number = 30) {
    for (const char of text) {
      process.stdout.write(color(char));
      await this.delay(delay);
    }
    console.log();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  displayUserMessage(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.blue(`\n┌─ [${timestamp}] USER TRANSMISSION`));
    console.log(chalk.blue('│'));
    console.log(chalk.blue('│ ') + chalk.white(message));
    console.log(chalk.blue('└─────────────────────────────────────────\n'));
  }

  async displayAIResponse(message: string, tokens?: { total: number, prompt: number, completion: number }) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.cyan(`┌─ [${timestamp}] AI NEURAL RESPONSE`));
    console.log(chalk.cyan('│'));
    console.log(chalk.cyan('│ ') + chalk.gray('Processing neural patterns...'));

    await this.delay(800);

    console.log(chalk.cyan('│ ') + chalk.green(message));

    if (tokens) {
      console.log(chalk.cyan('│'));
      console.log(chalk.cyan('│ ') + chalk.dim(`Neural tokens: ${tokens.total} (${tokens.prompt}→${tokens.completion})`));
    }

    console.log(chalk.cyan('└─────────────────────────────────────────\n'));
  }

  displayError(error: string) {
    console.log(chalk.red(`\n⚠️  NEURAL NETWORK ERROR: ${error}\n`));
  }

  displaySystemMessage(message: string) {
    console.log(chalk.yellow(`\n⚡ SYSTEM: ${message}\n`));
  }

  showLoadingSpinner(text: string = 'Connecting to neural network') {
    console.log(chalk.cyan(`⠋ ${text}...`));
    return null; // Simplified - no actual spinner to avoid flicker
  }

  stopLoadingSpinner(interval: any) {
    // No-op for simplified version
  }

  async promptUser(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(chalk.green('> '), (answer) => {
        resolve(answer.trim());
      });
    });
  }

  close() {
    this.rl.close();
  }

  setProcessing(processing: boolean) {
    this.isProcessing = processing;
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}