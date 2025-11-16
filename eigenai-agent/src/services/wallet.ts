import { privateKeyToAccount } from 'viem/accounts';
import { type Hex } from 'viem';

export class WalletService {
  private account: any;

  constructor(privateKey: Hex) {
    this.account = privateKeyToAccount(privateKey);
  }

  async signMessage(message: string): Promise<string> {
    return await this.account.signMessage({ message });
  }

  getAccount() {
    return this.account;
  }
}