export const baseTenant = {
  id: 'default-tenant',
  legalName: 'Default Tenant SA de CV',
  tradeName: 'Default Tenant',
  taxId: 'XAXX010101000',
};

export const baseCompany = {
  id: 'default-company',
  tenantId: 'default-tenant',
  legalName: 'Default Company SA de CV',
  tradeName: 'Default Company',
  taxId: 'XAXX010101000',
  baseCurrency: 'MXN',
};

export const baseBranch = {
  id: 'default-branch',
  companyId: 'default-company',
  name: 'Sucursal Principal',
};
