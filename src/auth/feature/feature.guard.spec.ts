import { FeatureGuard } from './feature.guard';
import { Reflector } from '@nestjs/core';

describe('FeatureGuard', () => {
  it('should be defined', () => {
    const reflector = new Reflector();
    const subsService = {} as any;
    const plansService = {} as any;
    expect(new FeatureGuard(reflector, subsService, plansService)).toBeDefined();
  });
});
