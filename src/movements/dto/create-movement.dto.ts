import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateMovementDto {
  @IsUUID()
  accountId: string;

  @IsString()
  type: string;

  @IsString()
  category: string;

  @IsString()
  concept: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsNumber()
  @Min(0)
  amount: number;
}
