import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { FindOptionsOrder } from 'typeorm';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  async create(
    createOrganizationDto: CreateOrganizationDto,
  ): Promise<Organization> {
    const existingOrganization = await this.organizationRepository.findOne({
      where: { code: createOrganizationDto.code },
    });

    if (existingOrganization) {
      throw new ConflictException(
        'An organization with this code already exists.',
      );
    }

    const organization = this.organizationRepository.create(
      createOrganizationDto,
    );

    return this.organizationRepository.save(organization);
  }
  async findAll(): Promise<Organization[]> {
  return this.organizationRepository.find({
    order: {
      createdAt: 'DESC',
    } as FindOptionsOrder<Organization>,
  });
}

async findOne(id: string): Promise<Organization> {
  const organization = await this.organizationRepository.findOne({
    where: { id },
  });

  if (!organization) {
    throw new NotFoundException('Organization not found.');
  }

  return organization;
}
async update(
  id: string,
  updateOrganizationDto: UpdateOrganizationDto,
): Promise<Organization> {
  const organization = await this.findOne(id);

  if (
    updateOrganizationDto.code &&
    updateOrganizationDto.code !== organization.code
  ) {
    const existingOrganization = await this.organizationRepository.findOne({
      where: { code: updateOrganizationDto.code },
    });

    if (existingOrganization) {
      throw new ConflictException(
        'An organization with this code already exists.',
      );
    }
  }

  Object.assign(organization, updateOrganizationDto);

  return this.organizationRepository.save(organization);
}
async deactivate(id: string): Promise<Organization> {
  const organization = await this.findOne(id);

  if (!organization.isActive) {
    return organization;
  }

  organization.isActive = false;

  return this.organizationRepository.save(organization);
}
}