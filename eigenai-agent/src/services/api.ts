import { ChatCompletionRequest } from '../types/index.js';

export class ApiService {
  constructor(private serverUrl: string) {}

  async getGrantMessage(address: string): Promise<string> {
    const response = await fetch(`${this.serverUrl}/message?address=${address}`);
    const data = await response.json();
    return data.message;
  }

  async callChatCompletions(request: ChatCompletionRequest): Promise<any> {
    const response = await fetch(`${this.serverUrl}/api/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });

    return await response.json();
  }
}