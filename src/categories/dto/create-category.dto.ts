import { IsIn, IsString, Length } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(2, 50)
  code: string;

  @IsString()
  @Length(2, 100)
  name: string;

  @IsString()
  @IsIn(['INCOME', 'EXPENSE'])
  type: string;
}
