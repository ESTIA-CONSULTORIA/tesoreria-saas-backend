import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

export async function seedDatabase(dataSource: DataSource) {
  const usersRepository = dataSource.getRepository('User');
  const rolesRepository = dataSource.getRepository('Role');
  const companiesRepository = dataSource.getRepository('Company');
  const branchesRepository = dataSource.getRepository('Branch');
  const banksRepository = dataSource.getRepository('Bank');
  const movementsRepository = dataSource.getRepository('Movement');
  const suppliersRepository = dataSource.getRepository('Supplier');

  // Verificar si el usuario admin ya existe
  const existingAdmin = await usersRepository.findOne({ where: { email: 'admin@estia.com' } });
  
  if (!existingAdmin) {
    // Buscar o crear rol SUPER_ADMIN
    let superAdminRole = await rolesRepository.findOne({ where: { code: 'SUPER_ADMIN' } });
    
    if (!superAdminRole) {
      superAdminRole = await rolesRepository.save({
        code: 'SUPER_ADMIN',
        name: 'Super Administrador',
        description: 'Acceso total al sistema',
        isActive: true,
      });
    }

    // Crear usuario admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await usersRepository.save({
      email: 'admin@estia.com',
      password: hashedPassword,
      name: 'Administrador',
      roleId: superAdminRole.id,
      roleCode: 'SUPER_ADMIN',
      isActive: true,
    });

    console.log('✅ Usuario admin@estia.com creado exitosamente');
  } else {
    // Actualizar si existe pero no tiene los datos correctos
    if (existingAdmin.name !== 'Administrador' || existingAdmin.roleCode !== 'SUPER_ADMIN') {
      const superAdminRole = await rolesRepository.findOne({ where: { code: 'SUPER_ADMIN' } });
      
      await usersRepository.update(existingAdmin.id, {
        name: 'Administrador',
        roleId: superAdminRole?.id,
        roleCode: 'SUPER_ADMIN',
      });
      
      console.log('✅ Usuario admin@estia.com actualizado exitosamente');
    }
  }

  // Crear tenant de prueba si no existe
  const tenantsRepository = dataSource.getRepository('Tenant');
  let testTenant = await tenantsRepository.findOne({ where: { tradeName: 'Empresa Demo' } });
  
  if (!testTenant) {
    testTenant = await tenantsRepository.save({
      legalName: 'Empresa Demo S.A. de C.V.',
      tradeName: 'Empresa Demo',
      taxId: 'ABC123456XYZ',
      plan: 'PROFESIONAL',
      isActive: true,
    });
    console.log('✅ Tenant de prueba creado');
  }

  // Crear empresas de prueba
  const existingCompanies = await companiesRepository.find({ where: { tenantId: testTenant.id } });
  
  if (existingCompanies.length === 0) {
    const company1 = await companiesRepository.save({
      tenantId: testTenant.id,
      legalName: 'Comercializadora Demo S.A. de C.V.',
      tradeName: 'Comercializadora Demo',
      taxId: 'COM987654XYZ',
      baseCurrency: 'MXN',
      isActive: true,
    });

    const company2 = await companiesRepository.save({
      tenantId: testTenant.id,
      legalName: 'Servicios Profesionales Demo S. de R.L.',
      tradeName: 'Servicios Demo',
      taxId: 'SER456789XYZ',
      baseCurrency: 'MXN',
      isActive: true,
    });

    console.log('✅ 2 empresas de prueba creadas');

    // Crear sucursales
    const branch1 = await branchesRepository.save({
      companyId: company1.id,
      code: 'SUC-001',
      name: 'Sucursal Centro',
      address: 'Av. Principal #123, Centro',
      city: 'Ciudad de México',
      state: 'CDMX',
      isActive: true,
    });

    const branch2 = await branchesRepository.save({
      companyId: company1.id,
      code: 'SUC-002',
      name: 'Sucursal Norte',
      address: 'Blvd. Norte #456, Zona Norte',
      city: 'Ciudad de México',
      state: 'CDMX',
      isActive: true,
    });

    const branch3 = await branchesRepository.save({
      companyId: company2.id,
      code: 'SUC-003',
      name: 'Sucursal Sur',
      address: 'Calle Sur #789, Zona Sur',
      city: 'Ciudad de México',
      state: 'CDMX',
      isActive: true,
    });

    console.log('✅ 3 sucursales creadas');

    // Crear cuentas bancarias
    const bank1 = await banksRepository.save({
      branchId: branch1.id,
      name: 'Cuenta Principal BBVA',
      accountNumber: '0123456789',
      bank: 'BBVA',
      initialBalance: 50000,
      balance: 50000,
      currency: 'MXN',
      type: 'BANCO',
      isActive: true,
    });

    const bank2 = await banksRepository.save({
      branchId: branch1.id,
      name: 'Caja Chica',
      accountNumber: 'CAJA-001',
      bank: 'EFECTIVO',
      initialBalance: 10000,
      balance: 10000,
      currency: 'MXN',
      type: 'EFECTIVO',
      isActive: true,
    });

    console.log('✅ 2 cuentas bancarias creadas');

    // Crear movimientos de ingreso
    const incomeMovements = [
      {
        accountId: bank1.id,
        type: 'INCOME',
        category: 'SALE',
        concept: 'Venta de mercancía',
        reference: 'FAC-001',
        amount: 15000,
      },
      {
        accountId: bank1.id,
        type: 'INCOME',
        category: 'SALE',
        concept: 'Venta de servicios',
        reference: 'FAC-002',
        amount: 8500,
      },
      {
        accountId: bank1.id,
        type: 'INCOME',
        category: 'RENT',
        concept: 'Renta de equipo',
        reference: 'REC-001',
        amount: 3200,
      },
      {
        accountId: bank2.id,
        type: 'INCOME',
        category: 'SALE',
        concept: 'Venta contado',
        reference: 'FAC-003',
        amount: 5000,
      },
      {
        accountId: bank1.id,
        type: 'INCOME',
        category: 'TRANSFER',
        concept: 'Transferencia de cliente',
        reference: 'TRF-001',
        amount: 12000,
      },
    ];

    for (const movement of incomeMovements) {
      await movementsRepository.save(movement);
    }

    console.log('✅ 5 movimientos de ingreso creados');

    // Crear movimientos de egreso
    const expenseMovements = [
      {
        accountId: bank1.id,
        type: 'EXPENSE',
        category: 'PAYROLL',
        concept: 'Nómina quincenal',
        reference: 'NOM-001',
        amount: 25000,
      },
      {
        accountId: bank1.id,
        type: 'EXPENSE',
        category: 'RENT',
        concept: 'Renta de local',
        reference: 'REN-001',
        amount: 8000,
      },
      {
        accountId: bank2.id,
        type: 'EXPENSE',
        category: 'SUPPLIES',
        concept: 'Compra de papelería',
        reference: 'GAS-001',
        amount: 1500,
      },
      {
        accountId: bank1.id,
        type: 'EXPENSE',
        category: 'SERVICES',
        concept: 'Servicios de internet',
        reference: 'SER-001',
        amount: 1200,
      },
      {
        accountId: bank1.id,
        type: 'EXPENSE',
        category: 'TRANSFER',
        concept: 'Transferencia a proveedor',
        reference: 'TRF-002',
        amount: 4500,
      },
    ];

    for (const movement of expenseMovements) {
      await movementsRepository.save(movement);
    }

    console.log('✅ 5 movimientos de egreso creados');

    // Crear proveedores
    const suppliers = [
      {
        nombre: 'Papelería Central',
        razonSocial: 'Papelería Central S.A. de C.V.',
        rfc: 'PAC123456XYZ',
        email: 'contacto@papeleriacentral.com',
        telefono: '555-1234',
        contacto: 'Juan Pérez',
        direccion: 'Calle Papel #123',
        ciudad: 'Ciudad de México',
        estado: 'CDMX',
        pais: 'México',
        condicionesPago: 'CONTADO',
        limiteCredito: 0,
        saldoPendiente: 0,
        moneda: 'MXN',
        isActive: true,
        tenantId: testTenant.id,
      },
      {
        nombre: 'Tech Solutions',
        razonSocial: 'Tech Solutions S. de R.L.',
        rfc: 'TES987654XYZ',
        email: 'ventas@techsolutions.com',
        telefono: '555-5678',
        contacto: 'María García',
        direccion: 'Av. Tecnología #456',
        ciudad: 'Ciudad de México',
        estado: 'CDMX',
        pais: 'México',
        condicionesPago: '30dias',
        limiteCredito: 50000,
        saldoPendiente: 0,
        moneda: 'MXN',
        isActive: true,
        tenantId: testTenant.id,
      },
      {
        nombre: 'Distribuidora Nacional',
        razonSocial: 'Distribuidora Nacional S.A. de C.V.',
        rfc: 'DIS456789XYZ',
        email: 'pedidos@distribuidoranacional.com',
        telefono: '555-9012',
        contacto: 'Carlos López',
        direccion: 'Blvd. Comercial #789',
        ciudad: 'Ciudad de México',
        estado: 'CDMX',
        pais: 'México',
        condicionesPago: '15dias',
        limiteCredito: 100000,
        saldoPendiente: 0,
        moneda: 'MXN',
        isActive: true,
        tenantId: testTenant.id,
      },
    ];

    for (const supplier of suppliers) {
      await suppliersRepository.save(supplier);
    }

    console.log('✅ 3 proveedores creados');
  } else {
    console.log('ℹ️ Datos de prueba ya existen, omitiendo creación');
  }
}
