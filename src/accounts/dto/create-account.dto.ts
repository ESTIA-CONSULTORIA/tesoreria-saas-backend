import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAccountDto {
  @IsUUID()
  branchId: string;

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
