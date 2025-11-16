import * as readline from 'readline';
import chalk from 'chalk';

export class SimpleTerminal {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  displayBanner() {
    console.clear();
    console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║             🚀 EIGENAI TERMINAL             ║'));
    console.log(chalk.cyan('║            Neural Network Interface         ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.green('✓ AI Agent ONLINE'));
    console.log(chalk.yellow('Commands: /help /clear /exit'));
    console.log();
  }

  displayUserMessage(message: string) {
    console.log(chalk.blue(`👤 You: ${message}`));
  }

  displayAIResponse(message: string, tokens?: any) {
    console.log(chalk.cyan(`🤖 AI: ${message}`));
    if (tokens) {
      console.log(chalk.dim(`   Tokens: ${tokens.total}`));
    }
    console.log();
  }

  displayError(error: string) {
    console.log(chalk.red(`❌ Error: ${error}`));
    console.log();
  }

  displaySystemMessage(message: string) {
    console.log(chalk.yellow(`⚡ ${message}`));
    console.log();
  }

  async getUserInput(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(chalk.green('> '), (answer) => {
        resolve(answer.trim());
      });
    });
  }

  close() {
    this.rl.close();
  }
}