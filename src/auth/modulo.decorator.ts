import { SetMetadata } from '@nestjs/common';

export const MODULO_KEY = 'modulo';

export const Modulo = (modulo: string) => SetMetadata(MODULO_KEY, modulo);
