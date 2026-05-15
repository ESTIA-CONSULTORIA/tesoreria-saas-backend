export interface MappingResult<T = unknown> {
  success: boolean;
  sourceProvider: string;
  targetType: string;
  data?: T;
  errors?: string[];
}
