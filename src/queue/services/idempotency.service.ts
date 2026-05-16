import { Injectable } from '@nestjs/common';

@Injectable()
export class IdempotencyService {
  private processedKeys = new Set<string>();

  async validate(key: string) {
    const alreadyProcessed = this.processedKeys.has(key);

    return {
      valid: !alreadyProcessed,
      alreadyProcessed,
    };
  }

  async register(key: string) {
    this.processedKeys.add(key);

    return {
      success: true,
      key,
    };
  }
}
