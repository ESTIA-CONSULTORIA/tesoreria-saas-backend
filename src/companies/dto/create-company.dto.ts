import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateCompanyDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @Length(2, 150)
  legalName: string;

  @IsString()
  @Length(2, 150)
  tradeName: string;

  @IsOptional()
  @IsString()
  @Length(3, 30)
  taxId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MXN', 'USD', 'EUR'])
  baseCurrency?: string;
}
