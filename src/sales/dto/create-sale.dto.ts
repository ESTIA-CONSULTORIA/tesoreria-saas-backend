import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaleItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsNumber()
  @Min(0)
  total: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
