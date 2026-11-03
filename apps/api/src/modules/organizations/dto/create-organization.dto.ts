import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { OrganizationType } from '../enums/organization-type.enum';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'Code must contain only uppercase letters, numbers, hyphens, and underscores',
  })
  code: string;

  @IsEnum(OrganizationType)
  organizationType: OrganizationType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}