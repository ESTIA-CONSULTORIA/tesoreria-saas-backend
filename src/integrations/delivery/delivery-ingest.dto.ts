import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export enum DeliveryPlatform {
  UBER_EATS = 'uber_eats',
  RAPPI = 'rappi',
  DIDI_FOOD = 'didi_food',
  PEDIDOSYA = 'pedidosya',
}

export enum DeliveryOrderStatus {
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class DeliveryOrderLineDto {
  @IsString()
  @IsNotEmpty()
  item_id: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unit_price: number;

  @IsNumber()
  @Min(0)
  subtotal: number;
}

export class DeliveryIngestDto {
  @IsString()
  @IsNotEmpty()
  company_id: string;

  @IsString()
  @IsNotEmpty()
  branch_id: string;

  @IsEnum(DeliveryPlatform)
  platform: DeliveryPlatform;

  @IsString()
  @IsNotEmpty()
  external_order_id: string;

  @IsEnum(DeliveryOrderStatus)
  status: DeliveryOrderStatus;

  @IsNumber()
  @Min(0)
  gross_amount: number;

  @IsNumber()
  @Min(0)
  platform_commission: number;

  @IsNumber()
  net_payout: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ingredient_cost?: number;

  @IsDateString()
  placed_at: string;

  @IsOptional()
  @IsDateString()
  delivered_at?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeliveryOrderLineDto)
  lines: DeliveryOrderLineDto[];
}
