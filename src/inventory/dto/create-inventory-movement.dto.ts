import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateInventoryMovementDto {
  @IsUUID()
  productId: string;

  @IsString()
  type: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  reference?: string;
}
