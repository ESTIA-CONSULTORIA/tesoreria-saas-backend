export const baseCategories = [
  {
    code: 'SALE',
    name: 'Ventas',
    type: 'INCOME',
  },
  {
    code: 'PURCHASE',
    name: 'Compras',
    type: 'EXPENSE',
  },
  {
    code: 'PAYROLL',
    name: 'Nómina',
    type: 'EXPENSE',
  },
  {
    code: 'RENT',
    name: 'Renta',
    type: 'EXPENSE',
  },
];

export const baseAccounts = [
  {
    name: 'Caja General',
    type: 'CASH',
    currency: 'MXN',
  },
  {
    name: 'Banco Principal',
    type: 'BANK',
    currency: 'MXN',
  },
  {
    name: 'Banco USD',
    type: 'BANK',
    currency: 'USD',
  },
];
