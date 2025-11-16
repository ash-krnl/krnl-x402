import inquirer from 'inquirer';
import chalk from 'chalk';

export class CLIInterface {
  displayBanner() {
    console.clear();
    console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║             🚀 EIGENAI TERMINAL             ║'));
    console.log(chalk.cyan('║            Neural Network Interface         ║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.green('✓ AI Agent ONLINE'));
    console.log(chalk.yellow('Commands: /help /clear /exit /history'));
    console.log();
  }

  async getUserInput(): Promise<string> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: chalk.green('>'),
        prefix: ''
      }
    ]);
    return answers.message.trim();
  }

  displayUserMessage(message: string) {
    console.log(chalk.blue(`\n👤 You: ${message}`));
  }

  displayAIResponse(message: string, tokens?: any) {
    console.log(chalk.cyan(`🤖 AI: ${message}`));
    if (tokens) {
      console.log(chalk.dim(`   Neural tokens: ${tokens.total} (${tokens.prompt}→${tokens.completion})`));
    }
    console.log();
  }

  displayError(error: string) {
    console.log(chalk.red(`\n❌ Error: ${error}\n`));
  }

  displaySystemMessage(message: string) {
    console.log(chalk.yellow(`\n⚡ ${message}\n`));
  }

  displayProcessing() {
    console.log(chalk.cyan('🔄 Connecting to neural network...'));
  }

  showHelp() {
    console.log(chalk.cyan('\n╔══════════════ COMMAND CENTER ══════════════╗'));
    console.log(chalk.cyan('║                                             ║'));
    console.log(chalk.cyan('║') + chalk.yellow('  /help    ') + chalk.white('- Show this help menu              ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.yellow('  /clear   ') + chalk.white('- Clear the terminal               ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.yellow('  /history ') + chalk.white('- Show conversation history        ') + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.yellow('  /exit    ') + chalk.white('- Exit the neural network          ') + chalk.cyan('║'));
    console.log(chalk.cyan('║                                             ║'));
    console.log(chalk.cyan('╚═════════════════════════════════════════════╝\n'));
  }

  showHistory(history: any[]) {
    if (history.length === 0) {
      console.log(chalk.yellow('\n📝 No conversation history yet.\n'));
      return;
    }

    console.log(chalk.cyan('\n╔══════════ CONVERSATION HISTORY ══════════╗'));

    history.slice(-10).forEach((msg, index) => {
      const time = msg.timestamp.toLocaleTimeString();
      if (msg.role === 'user') {
        console.log(chalk.blue(`\n[${time}] 👤 You:`));
        console.log(chalk.white(`  ${msg.content}`));
      } else {
        console.log(chalk.cyan(`\n[${time}] 🤖 AI:`));
        console.log(chalk.white(`  ${msg.content}`));
      }
    });

    console.log(chalk.cyan('\n╚═══════════════════════════════════════════╝\n'));
  }
}