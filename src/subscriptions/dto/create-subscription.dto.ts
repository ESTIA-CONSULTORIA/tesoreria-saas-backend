import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  tenantId: string;

  @IsString()
  planCode: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}
