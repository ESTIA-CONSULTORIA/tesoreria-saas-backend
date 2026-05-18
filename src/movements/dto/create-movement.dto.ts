import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateMovementDto {
  @IsUUID()
  accountId: string;

  @IsString()
  @IsIn(['INCOME', 'EXPENSE'])
  type: string;

  @IsString()
  @Length(2, 100)
  category: string;

  @IsString()
  @Length(2, 255)
  concept: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  reference?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;
}
