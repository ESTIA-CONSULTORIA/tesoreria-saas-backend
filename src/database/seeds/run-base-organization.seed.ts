import { DataSource } from 'typeorm';

import { Tenant } from '../../tenants/entities/tenant.entity';
import { Company } from '../../companies/entities/company.entity';
import { Branch } from '../../branches/entities/branch.entity';

import {
  baseTenant,
  baseCompany,
  baseBranch,
} from './base-organization.seed';

export async function runBaseOrganizationSeed(dataSource: DataSource) {
  const tenantRepository = dataSource.getRepository(Tenant);
  const companyRepository = dataSource.getRepository(Company);
  const branchRepository = dataSource.getRepository(Branch);

  const existingTenant = await tenantRepository.findOne({
    where: {
      id: baseTenant.id,
    },
  });

  if (!existingTenant) {
    await tenantRepository.save(
      tenantRepository.create(baseTenant),
    );
  }

  const existingCompany = await companyRepository.findOne({
    where: {
      id: baseCompany.id,
    },
  });

  if (!existingCompany) {
    await companyRepository.save(
      companyRepository.create(baseCompany),
    );
  }

  const existingBranch = await branchRepository.findOne({
    where: {
      id: baseBranch.id,
    },
  });

  if (!existingBranch) {
    await branchRepository.save(
      branchRepository.create({
        ...baseBranch,
        code: 'MAIN',
      }),
    );
  }

  return {
    success: true,
  };
}
