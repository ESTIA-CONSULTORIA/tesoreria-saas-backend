import { DataSource, IsNull, In } from 'typeorm';
import * as bcrypt from 'bcrypt';

function randomDateDistributed(): Date {
  const rand = Math.random();
  const date = new Date();
  if (rand < 0.30) {
    date.setDate(date.getDate() - Math.floor(Math.random() * 7));
  } else if (rand < 0.70) {
    date.setDate(date.getDate() - (8 + Math.floor(Math.random() * 23)));
  } else {
    date.setDate(date.getDate() - (31 + Math.floor(Math.random() * 60)));
  }
  return date;
}

export async function seedDatabase(dataSource: DataSource) {
  const usersRepository = dataSource.getRepository('User');
  const rolesRepository = dataSource.getRepository('Role');
  const companiesRepository = dataSource.getRepository('Company');
  const branchesRepository = dataSource.getRepository('Branch');
  const banksRepository = dataSource.getRepository('Bank');
  const movementsRepository = dataSource.getRepository('Movement');
  const suppliersRepository = dataSource.getRepository('Supplier');
  const familiasRepository = dataSource.getRepository('FamiliaInsumo');
  const insumosRepository = dataSource.getRepository('Insumo');
  const recipesRepository = dataSource.getRepository('Recipe');
  const posCategoriesRepository = dataSource.getRepository('PosCategory');
  const productsRepository = dataSource.getRepository('Product');
  const purchaseOrdersRepository = dataSource.getRepository('PurchaseOrder');
  const purchaseInvoicesRepository = dataSource.getRepository('Purchase');
  const inventoryRecordsRepository = dataSource.getRepository('Inventory');
  const subscriptionRepository = dataSource.getRepository('Subscription');
  const areasRepository = dataSource.getRepository('Area');
  const tablesRepository = dataSource.getRepository('Table');

  // Limpiar testTenant y todos sus datos
  try {
    const testTenantId = '7ac7af3a-2df1-44b6-a844-e87113db73f5';
    await dataSource.query(`
      DELETE FROM movement WHERE "accountId" IN (
        SELECT bk.id FROM bank bk
        JOIN branch br ON bk."branchId" = br.id
        JOIN company c ON br."companyId" = c.id
        WHERE c."tenantId" = '${testTenantId}'
      )
    `);
    await dataSource.query(`DELETE FROM bank WHERE "branchId" IN (SELECT br.id FROM branch br JOIN company c ON br."companyId" = c.id WHERE c."tenantId" = '${testTenantId}')`);
    await dataSource.query(`DELETE FROM branch WHERE "companyId" IN (SELECT id FROM company WHERE "tenantId" = '${testTenantId}')`);
    await dataSource.query(`DELETE FROM company WHERE "tenantId" = '${testTenantId}'`);
    await dataSource.query(`DELETE FROM tenant WHERE id = '${testTenantId}'`);
    console.log('🧹 testTenant y sus datos eliminados');
  } catch (cleanupError) {
    console.log('⚠️ Cleanup testTenant omitido:', cleanupError.message);
  }

  // Verificar si el usuario admin ya existe
  const existingAdmin = await usersRepository.findOne({ where: { email: 'admin@estia.com' } });
  
  if (!existingAdmin) {
    // Buscar o crear rol SOPORTE (antes SUPER_ADMIN)
    let soporteRole = await rolesRepository.findOne({ where: { code: 'SOPORTE' } });
    
    if (!soporteRole) {
      soporteRole = await rolesRepository.save({
        code: 'SOPORTE',
        name: 'Soporte',
        description: 'Acceso total al sistema (proveedor del sistema)',
        isActive: true,
      });
    }

    // Crear usuario admin con rol SOPORTE
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await usersRepository.save({
      email: 'admin@estia.com',
      password: hashedPassword,
      name: 'Administrador Soporte',
      roleId: soporteRole.id,
      roleCode: 'SOPORTE',
      tenantId: null, // SOPORTE no pertenece a ningún tenant cliente
      isActive: true,
    });

    console.log('✅ Usuario admin@estia.com (SOPORTE) creado exitosamente');
  } else {
    // Actualizar si existe pero no tiene los datos correctos
    if (existingAdmin.name !== 'Administrador Soporte' || existingAdmin.roleCode !== 'SOPORTE') {
      const soporteRole = await rolesRepository.findOne({ where: { code: 'SOPORTE' } });
      
      await usersRepository.update(existingAdmin.id, {
        name: 'Administrador Soporte',
        roleId: soporteRole?.id,
        roleCode: 'SOPORTE',
        tenantId: null, // SOPORTE no pertenece a ningún tenant cliente
      });
      
      console.log('✅ Usuario admin@estia.com actualizado a rol SOPORTE');
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

  // Crear suscripción para tenant de prueba
  const existingTestSubscription = await subscriptionRepository.findOne({ where: { tenantId: testTenant.id } });
  if (!existingTestSubscription) {
    await subscriptionRepository.save({
      tenantId: testTenant.id,
      planCode: 'PRO',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '2027-12-31',
      status: 'ACTIVE',
    });
    console.log('✅ Suscripción creada para tenant de prueba');
  }

  // Crear usuario de prueba con rol ADMIN (administrador del cliente)
  const existingAdminUser = await usersRepository.findOne({ where: { email: 'admin@empresademo.com' } });
  
  // Buscar o crear rol ADMIN (necesario para PARTE 1)
  let adminRole = await rolesRepository.findOne({ where: { code: 'ADMIN' } });
  if (!adminRole) {
    adminRole = await rolesRepository.save({
      code: 'ADMIN',
      name: 'Administrador',
      description: 'Administrador del cliente (tenant)',
      isActive: true,
    });
  }
  
  if (!existingAdminUser) {
    // Crear usuario admin del cliente
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await usersRepository.save({
      email: 'admin@empresademo.com',
      password: hashedPassword,
      name: 'Administrador Cliente',
      roleId: adminRole.id,
      roleCode: 'ADMIN',
      tenantId: testTenant.id, // Asociado al tenant de prueba
      isActive: true,
    });

    console.log('✅ Usuario admin@empresademo.com (ADMIN) creado exitosamente');
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTE 1: TENANT DEMO Y USUARIOS
  // ═══════════════════════════════════════════════════════════════
  
  // Crear tenant "Grupo Empresarial Demo" si no existe
  let demoTenant = await tenantsRepository.findOne({ where: { tradeName: 'Grupo Empresarial Demo' } });
  
  if (!demoTenant) {
    demoTenant = await tenantsRepository.save({
      legalName: 'Grupo Empresarial Demo S.A. de C.V.',
      tradeName: 'Grupo Empresarial Demo',
      taxId: 'GED987654XYZ',
      plan: 'BUSINESS',
      isActive: true,
    });
    console.log('✅ Tenant "Grupo Empresarial Demo" creado');
  }

  // Crear suscripción para tenant demo
  const existingDemoSubscription = await subscriptionRepository.findOne({ where: { tenantId: demoTenant.id } });
  if (!existingDemoSubscription) {
    await subscriptionRepository.save({
      tenantId: demoTenant.id,
      planCode: 'BUSINESS',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '2027-12-31',
      status: 'ACTIVE',
    });
    console.log('✅ Suscripción creada para tenant demo');
  }

  // Crear roles adicionales si no existen
  let gerenteRole = await rolesRepository.findOne({ where: { code: 'GERENTE' } });
  if (!gerenteRole) {
    gerenteRole = await rolesRepository.save({
      code: 'GERENTE',
      name: 'Gerente',
      description: 'Gerente de sucursal',
      isActive: true,
    });
  }

  let cajeroRole = await rolesRepository.findOne({ where: { code: 'CAJERO' } });
  if (!cajeroRole) {
    cajeroRole = await rolesRepository.save({
      code: 'CAJERO',
      name: 'Cajero',
      description: 'Cajero de POS',
      isActive: true,
    });
  }

  let contadorRole = await rolesRepository.findOne({ where: { code: 'CONTADOR' } });
  if (!contadorRole) {
    contadorRole = await rolesRepository.save({
      code: 'CONTADOR',
      name: 'Contador',
      description: 'Contador/Finanzas',
      isActive: true,
    });
  }

  // Crear usuarios demo para el tenant "Grupo Empresarial Demo"
  const demoUsers = [
    { email: 'admin@demo.com', password: 'Admin123', name: 'Administrador Demo', role: adminRole, roleCode: 'ADMIN', executivePin: '1234' },
    { email: 'gerente@demo.com', password: 'Admin123', name: 'Gerente Demo', role: gerenteRole, roleCode: 'GERENTE', executivePin: '1234' },
    { email: 'cajero@demo.com', password: '1234', name: 'Cajero Demo', role: cajeroRole, roleCode: 'CAJERO', executivePin: null },
    { email: 'contador@demo.com', password: 'Admin123', name: 'Contador Demo', role: contadorRole, roleCode: 'CONTADOR', executivePin: null },
  ];

  for (const userData of demoUsers) {
    const existingUser = await usersRepository.findOne({ where: { email: userData.email } });
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const savedUser = await usersRepository.save({
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        roleId: userData.role.id,
        roleCode: userData.roleCode,
        tenantId: demoTenant.id,
        isActive: true,
        executivePin: userData.executivePin,
      });
      if (userData.email === 'cajero@demo.com') {
        console.log('✅ Usuario cajero@demo.com creado');
        console.log('cajero password (hashed):', savedUser.password);
        console.log('cajero password (original):', userData.password);
      } else {
        console.log(`✅ Usuario ${userData.email} (${userData.roleCode}) creado`);
      }
    }
  }

  // Buscar o crear empresa El Sazón dinámicamente para usarla en usuarios y HR
  const sazonCompany = await companiesRepository.findOne({
    where: [
      { tenantId: demoTenant.id, tradeName: 'El Sazón' },
      { tenantId: demoTenant.id, legalName: 'El Sazón' },
      { tenantId: demoTenant.id, tradeName: 'El Sazon' },
    ],
  }) || await companiesRepository.save({
    tenantId: demoTenant.id,
    legalName: 'El Sazón SA de CV',
    tradeName: 'El Sazón',
    rfc: 'SAZO123456789',
    giro: 'Restaurante',
    isActive: true,
  });

  // Crear usuarios con restricción de empresa/sucursal
  const restrictedUsers = [
    {
      email: 'gerente.sazon@demo.com',
      password: 'Admin123',
      name: 'Gerente El Sazón',
      role: gerenteRole,
      roleCode: 'GERENTE',
      companyId: sazonCompany.id,
      branchId: null,
      executivePin: '1234',
    },
    {
      email: 'gerente.sucursal@demo.com',
      password: 'Admin123',
      name: 'Gerente Sucursal',
      role: gerenteRole,
      roleCode: 'GERENTE',
      companyId: null,
      branchId: null, // Will be set after branch is created
      executivePin: '1234',
    },
  ];

  for (const userData of restrictedUsers) {
    const existingUser = await usersRepository.findOne({ where: { email: userData.email } });
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      await usersRepository.save({
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        roleId: userData.role.id,
        roleCode: userData.roleCode,
        tenantId: demoTenant.id,
        companyId: userData.companyId,
        branchId: userData.branchId,
        isActive: true,
        executivePin: userData.executivePin,
      });
      console.log(`✅ Usuario ${userData.email} (${userData.roleCode}) con restricción creado`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP: Eliminar duplicados bajo testTenant de deploys anteriores
  // Comercializadora Demo y Servicios Demo deben vivir bajo demoTenant
  // ═══════════════════════════════════════════════════════════════
  for (const name of ['Comercializadora Demo', 'Servicios Demo']) {
    const dupes = await companiesRepository.find({ where: { tenantId: testTenant.id, tradeName: name } });
    for (const dupe of dupes) {
      const dupeBranches = await branchesRepository.find({ where: { companyId: dupe.id } });
      for (const branch of dupeBranches) {
        const dupeBanks = await banksRepository.find({ where: { branchId: branch.id } });
        for (const bank of dupeBanks) {
          await movementsRepository.delete({ accountId: bank.id });
          await banksRepository.delete({ id: bank.id });
        }
        await branchesRepository.delete({ id: branch.id });
      }
      await companiesRepository.delete({ id: dupe.id });
    }
    if (dupes.length > 0) {
      console.log(`🧹 Eliminados ${dupes.length} duplicado(s) de "${name}" bajo testTenant`);
    }
  }

  // Crear empresas bajo demoTenant (Grupo Empresarial Demo)
  let company1 = await companiesRepository.findOne({ where: { tenantId: demoTenant.id, tradeName: 'Comercializadora Demo' } });
  if (!company1) {
    company1 = await companiesRepository.save({
      tenantId: demoTenant.id,
      legalName: 'Comercializadora Demo S.A. de C.V.',
      tradeName: 'Comercializadora Demo',
      taxId: 'COM987654XYZ',
      baseCurrency: 'MXN',
      isActive: true,
    });
    console.log('✅ Empresa Comercializadora Demo creada');
  }

  let company2 = await companiesRepository.findOne({ where: { tenantId: demoTenant.id, tradeName: 'Servicios Demo' } });
  if (!company2) {
    company2 = await companiesRepository.save({
      tenantId: demoTenant.id,
      legalName: 'Servicios Profesionales Demo S. de R.L.',
      tradeName: 'Servicios Demo',
      taxId: 'SER456789XYZ',
      baseCurrency: 'MXN',
      isActive: true,
    });
    console.log('✅ Empresa Servicios Demo creada');
  }

  // Crear sucursales individualmente con verificación
  let branch1 = await branchesRepository.findOne({ where: { companyId: company1.id, code: 'SUC-001' } });
  if (!branch1) {
    branch1 = await branchesRepository.save({
      companyId: company1.id,
      code: 'SUC-001',
      name: 'Centro',
      address: 'Av. Principal #123, Centro',
      city: 'Ciudad de México',
      state: 'CDMX',
      isActive: true,
    });
    console.log('✅ Sucursal Centro creada');
  }

  let branch2 = await branchesRepository.findOne({ where: { companyId: company1.id, code: 'SUC-002' } });
  if (!branch2) {
    branch2 = await branchesRepository.save({
      companyId: company1.id,
      code: 'SUC-002',
      name: 'Norte',
      address: 'Blvd. Norte #456, Zona Norte',
      city: 'Ciudad de México',
      state: 'CDMX',
      isActive: true,
    });
    console.log('✅ Sucursal Norte creada');
  }

  // Check if banks already exist for branch1
  const existingBanksBranch1 = await banksRepository.count({ where: { branchId: branch1.id } });

  if (existingBanksBranch1 === 0) {
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
      { accountId: bank1.id, type: 'INCOME', category: 'SALE', concept: 'Venta de mercancía', reference: 'FAC-001', amount: 15000, date: randomDateDistributed() },
      { accountId: bank1.id, type: 'INCOME', category: 'SALE', concept: 'Venta de servicios', reference: 'FAC-002', amount: 8500, date: randomDateDistributed() },
      { accountId: bank1.id, type: 'INCOME', category: 'RENT', concept: 'Renta de equipo', reference: 'REC-001', amount: 5200, date: randomDateDistributed() },
      { accountId: bank2.id, type: 'INCOME', category: 'SALE', concept: 'Venta contado', reference: 'FAC-003', amount: 7000, date: randomDateDistributed() },
      { accountId: bank1.id, type: 'INCOME', category: 'TRANSFER', concept: 'Transferencia de cliente', reference: 'TRF-001', amount: 12000, date: randomDateDistributed() },
    ];

    for (const movement of incomeMovements) {
      await movementsRepository.save(movement);
    }

    console.log('✅ 5 movimientos de ingreso creados');

    // Crear movimientos de egreso
    const expenseMovements = [
      { accountId: bank1.id, type: 'EXPENSE', category: 'PAYROLL', concept: 'Nómina quincenal', reference: 'NOM-001', amount: 5500, date: randomDateDistributed() },
      { accountId: bank1.id, type: 'EXPENSE', category: 'RENT', concept: 'Renta de local', reference: 'REN-001', amount: 4000, date: randomDateDistributed() },
      { accountId: bank2.id, type: 'EXPENSE', category: 'SUPPLIES', concept: 'Compra de papelería', reference: 'GAS-001', amount: 1500, date: randomDateDistributed() },
      { accountId: bank1.id, type: 'EXPENSE', category: 'SERVICES', concept: 'Servicios de internet', reference: 'SER-001', amount: 1200, date: randomDateDistributed() },
      { accountId: bank1.id, type: 'EXPENSE', category: 'TRANSFER', concept: 'Transferencia a proveedor', reference: 'TRF-002', amount: 4500, date: randomDateDistributed() },
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
    console.log('ℹ️ Bancos ya existen para branch1, omitiendo creación de datos relacionados');
  }

  // Check if banks already exist for branch2 (Comercializadora Demo - Sucursal Norte)
  const existingBanksBranch2 = await banksRepository.count({ where: { branchId: branch2.id } });

  if (existingBanksBranch2 === 0) {
    // Crear cuentas bancarias para Sucursal Norte
    const bank2_1 = await banksRepository.save({
      branchId: branch2.id,
      name: 'HSBC Cuenta Norte',
      accountNumber: '0123456790',
      bank: 'HSBC',
      initialBalance: 38000,
      balance: 38000,
      currency: 'MXN',
      type: 'BANCO',
      isActive: true,
    });

    const bank2_2 = await banksRepository.save({
      branchId: branch2.id,
      name: 'Caja Chica Norte',
      accountNumber: 'CAJA-002',
      bank: 'EFECTIVO',
      initialBalance: 2500,
      balance: 2500,
      currency: 'MXN',
      type: 'EFECTIVO',
      isActive: true,
    });

    console.log('✅ 2 cuentas bancarias creadas para Sucursal Norte');

    // Crear movimientos de ingreso
    for (let i = 0; i < 10; i++) {
      const amount = Math.floor(Math.random() * 20000) + 5000;
      const date = randomDateDistributed();
      await movementsRepository.save({
        accountId: bank2_1.id,
        type: 'INCOME',
        category: 'SALE',
        concept: 'Venta del día',
        reference: `NOR-ING-${String(i + 1).padStart(3, '0')}`,
        amount: amount,
        date: date,
      });
    }
    console.log('✅ 10 movimientos de ingreso creados para Sucursal Norte');

    // Crear movimientos de egreso
    for (let i = 0; i < 5; i++) {
      const amount = Math.floor(Math.random() * 5000) + 1000;
      const date = randomDateDistributed();
      await movementsRepository.save({
        accountId: bank2_1.id,
        type: 'EXPENSE',
        category: 'OPERATIONAL',
        concept: 'Gasto operativo',
        reference: `NOR-EGR-${String(i + 1).padStart(3, '0')}`,
        amount: amount,
        date: date,
      });
    }
    console.log('✅ 5 movimientos de egreso creados para Sucursal Norte');
  } else {
    console.log('ℹ️ Bancos ya existen para branch2, omitiendo creación');
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTE: EMPRESAS DEL TENANT DEMO CON CUENTAS Y MOVIMIENTOS
  // ═══════════════════════════════════════════════════════════════

  // Buscar empresas por nombre (no por UUID hardcodeado)
  const sazon = await companiesRepository.findOne({ where: { tenantId: demoTenant.id, tradeName: 'El Sazón' } })
    || await companiesRepository.findOne({ where: { tenantId: demoTenant.id, tradeName: 'El Sazon' } });
  const sonorense = await companiesRepository.findOne({ where: { tenantId: demoTenant.id, tradeName: 'El Sonorense' } })
    || await companiesRepository.save({
      tenantId: demoTenant.id,
      legalName: 'El Sonorense SA de CV',
      tradeName: 'El Sonorense',
      rfc: 'SNOR123456789',
      giro: 'Restaurante',
      isActive: true,
    });
  const comercializadora = company1;
  const servicios = company2;

  // Actualizar nombre de "El Sazón Matriz" a "El Sazón"
  if (sazon && sazon.tradeName === 'El Sazón Matriz') {
    await companiesRepository.update(sazon.id, { tradeName: 'El Sazón' });
    console.log('✅ Nombre de empresa actualizado: El Sazón Matriz → El Sazón');
  }

  // Crear sucursales para El Sazón: Matriz, Norte
  if (sazon) {
    let sazonMatriz = await branchesRepository.findOne({ where: { companyId: sazon.id, code: 'SAZ-MAT' } });
    if (!sazonMatriz) {
      sazonMatriz = await branchesRepository.save({
        companyId: sazon.id,
        code: 'SAZ-MAT',
        name: 'Matriz',
        address: 'Av. Principal #500, Centro',
        city: 'Hermosillo',
        state: 'Sonora',
        isActive: true,
      });
      console.log('✅ Sucursal Matriz de El Sazón creada');
    }

    let sazonNorte = await branchesRepository.findOne({ where: { companyId: sazon.id, code: 'SAZ-NOR' } });
    if (!sazonNorte) {
      sazonNorte = await branchesRepository.save({
        companyId: sazon.id,
        code: 'SAZ-NOR',
        name: 'Norte',
        address: 'Blvd. Norte #200, Zona Norte',
        city: 'Hermosillo',
        state: 'Sonora',
        isActive: true,
      });
      console.log('✅ Sucursal Norte de El Sazón creada');
    }

    // Check if banks already exist for sazonNorte
    const existingBanksSazonNorte = await banksRepository.count({ where: { branchId: sazonNorte.id } });

    if (existingBanksSazonNorte === 0) {
      // Crear cuentas bancarias para El Sazón - Norte
      const sazonNorteBancomer = await banksRepository.save({
        branchId: sazonNorte.id,
        name: 'Bancomer Cuenta Norte',
        accountNumber: '0123456791',
        bank: 'Bancomer',
        initialBalance: 45000,
        balance: 45000,
        currency: 'MXN',
        type: 'BANCO',
        isActive: true,
      });

      const sazonNorteCaja = await banksRepository.save({
        branchId: sazonNorte.id,
        name: 'Caja Chica Norte',
        accountNumber: 'CAJA-SAZ-NOR',
        bank: 'EFECTIVO',
        initialBalance: 3000,
        balance: 3000,
        currency: 'MXN',
        type: 'EFECTIVO',
        isActive: true,
      });

      console.log('✅ 2 cuentas bancarias creadas para El Sazón - Norte');

      // Crear movimientos de ingreso
      for (let i = 0; i < 10; i++) {
        const amount = Math.floor(Math.random() * 20000) + 5000;
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: sazonNorteBancomer.id,
          type: 'INCOME',
          category: 'SALE',
          concept: 'Venta del día',
          reference: `SAZ-NOR-ING-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 10 movimientos de ingreso creados para El Sazón - Norte');

      // Crear movimientos de egreso
      for (let i = 0; i < 5; i++) {
        const amount = Math.floor(Math.random() * 5000) + 1000;
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: sazonNorteBancomer.id,
          type: 'EXPENSE',
          category: 'OPERATIONAL',
          concept: 'Gasto operativo',
          reference: `SAZ-NOR-EGR-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 5 movimientos de egreso creados para El Sazón - Norte');
    } else {
      console.log('ℹ️ Bancos ya existen para El Sazón - Norte, omitiendo creación');
    }

    // Update gerente.sucursal user with branchId
    const gerenteSucursal = await usersRepository.findOne({ where: { email: 'gerente.sucursal@demo.com' } });
    if (gerenteSucursal && sazonMatriz) {
      await usersRepository.update(gerenteSucursal.id, { branchId: sazonMatriz.id });
      console.log('✅ Usuario gerente.sucursal@demo.com actualizado con branchId');
    }
  }

  // Crear sucursal para El Sonorense: Matriz
  if (sonorense) {
    let sonorenseBranch = await branchesRepository.findOne({ where: { companyId: sonorense.id, code: 'SON-MAT' } });
    if (!sonorenseBranch) {
      sonorenseBranch = await branchesRepository.save({
        companyId: sonorense.id,
        code: 'SON-MAT',
        name: 'Matriz',
        address: 'Blvd. Principal #200, Centro',
        city: 'Hermosillo',
        state: 'Sonora',
        isActive: true,
      });
      console.log('✅ Sucursal Matriz de El Sonorense creada');
    }
  }

  // Crear sucursal para Servicios Demo: Corporativo
  if (servicios) {
    let serviciosBranch = await branchesRepository.findOne({ where: { companyId: servicios.id, code: 'SER-CORP' } });
    if (!serviciosBranch) {
      serviciosBranch = await branchesRepository.save({
        companyId: servicios.id,
        code: 'SER-CORP',
        name: 'Corporativo',
        address: 'Calle Servicios #100, Centro',
        city: 'Hermosillo',
        state: 'Sonora',
        isActive: true,
      });
      console.log('✅ Sucursal Corporativo de Servicios Demo creada');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CREAR CUENTAS BANCARIAS PARA CADA EMPRESA
  // ═══════════════════════════════════════════════════════════════
  const demoBranches = await branchesRepository.find();
  const sazonBranchFinal = demoBranches.find(b => b.companyId === sazon?.id);
  const sonorenseBranchFinal = demoBranches.find(b => b.companyId === sonorense?.id);
  const serviciosBranchFinal = demoBranches.find(b => b.companyId === servicios?.id);

  // El Sazón - BBVA Cuenta Operativa
  const existingBanksSazonMatriz = await banksRepository.count({ where: { branchId: sazonBranchFinal?.id } });
  let sazonBBVA = await banksRepository.findOne({ where: { branchId: sazonBranchFinal?.id, name: 'BBVA Cuenta Operativa' } });
  if (!sazonBBVA && sazonBranchFinal && existingBanksSazonMatriz === 0) {
    sazonBBVA = await banksRepository.save({
      branchId: sazonBranchFinal.id,
      name: 'BBVA Cuenta Operativa',
      accountNumber: '012345678901',
      bank: 'BBVA',
      initialBalance: 85400,
      balance: 85400,
      currency: 'MXN',
      type: 'BANCO',
      isActive: true,
    });
    console.log('✅ BBVA Cuenta Operativa creada para El Sazón');
  }

  // El Sazón - Caja Chica
  let sazonCaja = await banksRepository.findOne({ where: { branchId: sazonBranchFinal?.id, name: 'Caja Chica' } });
  if (!sazonCaja && sazonBranchFinal) {
    sazonCaja = await banksRepository.save({
      branchId: sazonBranchFinal.id,
      name: 'Caja Chica',
      accountNumber: 'CAJA-SAZ-001',
      bank: 'EFECTIVO',
      initialBalance: 5000,
      balance: 5000,
      currency: 'MXN',
      type: 'EFECTIVO',
      isActive: true,
    });
    console.log('✅ Caja Chica creada para El Sazón');
  }

  // El Sonorense - Banorte Cuenta Principal
  const existingBanksSonorense = await banksRepository.count({ where: { branchId: sonorenseBranchFinal?.id } });
  let sonorenseBanorte = await banksRepository.findOne({ where: { branchId: sonorenseBranchFinal?.id, name: 'Banorte Cuenta Principal' } });
  if (!sonorenseBanorte && sonorenseBranchFinal && existingBanksSonorense === 0) {
    sonorenseBanorte = await banksRepository.save({
      branchId: sonorenseBranchFinal.id,
      name: 'Banorte Cuenta Principal',
      accountNumber: '098765432109',
      bank: 'Banorte',
      initialBalance: 62000,
      balance: 62000,
      currency: 'MXN',
      type: 'BANCO',
      isActive: true,
    });
    console.log('✅ Banorte Cuenta Principal creada para EL SONORENSE');
  }

  // EL SONORENSE - Caja Chica
  let elSonorenseCaja = await banksRepository.findOne({ where: { branchId: sonorenseBranchFinal?.id, name: 'Caja Chica' } });
  if (!elSonorenseCaja && sonorenseBranchFinal) {
    elSonorenseCaja = await banksRepository.save({
      branchId: sonorenseBranchFinal.id,
      name: 'Caja Chica',
      accountNumber: 'CAJA-SON-001',
      bank: 'EFECTIVO',
      initialBalance: 3500,
      balance: 3500,
      currency: 'MXN',
      type: 'EFECTIVO',
      isActive: true,
    });
    console.log('✅ Caja Chica creada para EL SONORENSE');
  }

  // SERVICIOS DEMO - HSBC Cuenta Corporativa
  const existingBanksServicios = await banksRepository.count({ where: { branchId: serviciosBranchFinal?.id } });
  let serviciosHSBC = await banksRepository.findOne({ where: { branchId: serviciosBranchFinal?.id, name: 'HSBC Cuenta Corporativa' } });
  if (!serviciosHSBC && serviciosBranchFinal && existingBanksServicios === 0) {
    serviciosHSBC = await banksRepository.save({
      branchId: serviciosBranchFinal.id,
      name: 'HSBC Cuenta Corporativa',
      accountNumber: '045678901234',
      bank: 'HSBC',
      initialBalance: 45000,
      balance: 45000,
      currency: 'MXN',
      type: 'BANCO',
      isActive: true,
    });
    console.log('✅ HSBC Cuenta Corporativa creada para SERVICIOS DEMO');
  }

  // SERVICIOS DEMO - Scotiabank Nómina
  let serviciosScotiabank = await banksRepository.findOne({ where: { branchId: serviciosBranchFinal?.id, name: 'Scotiabank Nómina' } });
  if (!serviciosScotiabank && serviciosBranchFinal) {
    serviciosScotiabank = await banksRepository.save({
      branchId: serviciosBranchFinal.id,
      name: 'Scotiabank Nómina',
      accountNumber: '056789012345',
      bank: 'Scotiabank',
      initialBalance: 22000,
      balance: 22000,
      currency: 'MXN',
      type: 'BANCO',
      isActive: true,
    });
    console.log('✅ Scotiabank Nómina creada para SERVICIOS DEMO');
  }

  // ═══════════════════════════════════════════════════════════════
  // CREAR MOVIMIENTOS PARA CADA EMPRESA
  // ═══════════════════════════════════════════════════════════════
  const incomeConcepts = ['Venta del día', 'Cobro factura', 'Depósito cliente', 'Transferencia recibida'];
  const expenseConcepts = ['Pago proveedor', 'Renta local', 'Nómina quincenal', 'Servicios', 'Insumos'];

  // EL SAZÓN MATRIZ - 15 ingresos, 8 egresos
  if (sazonBBVA) {
    const existingMovements = await movementsRepository.count({ where: { accountId: sazonBBVA.id } });
    if (existingMovements === 0) {
      for (let i = 0; i < 15; i++) {
        const amount = Math.floor(Math.random() * 20000) + 5000; // $5,000 - $25,000
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: sazonBBVA.id,
          type: 'INCOME',
          category: 'SALE',
          concept: incomeConcepts[Math.floor(Math.random() * incomeConcepts.length)],
          reference: `SAZ-ING-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 15 movimientos de ingreso creados para EL SAZÓN MATRIZ');

      for (let i = 0; i < 8; i++) {
        const amount = Math.floor(Math.random() * 5000) + 1000; // $1,000 - $6,000
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: sazonBBVA.id,
          type: 'EXPENSE',
          category: 'OPERATIONAL',
          concept: expenseConcepts[Math.floor(Math.random() * expenseConcepts.length)],
          reference: `SAZ-EGR-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 8 movimientos de egreso creados para EL SAZÓN MATRIZ');
    } else {
      console.log('⏭️  Movimientos ya existen para EL SAZÓN MATRIZ, omitiendo creación');
    }
  }

  // EL SONORENSE - 12 ingresos, 6 egresos
  if (sonorenseBanorte) {
    const existingMovements = await movementsRepository.count({ where: { accountId: sonorenseBanorte.id } });
    if (existingMovements === 0) {
      for (let i = 0; i < 12; i++) {
        const amount = Math.floor(Math.random() * 20000) + 5000; // $5,000 - $25,000
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: sonorenseBanorte.id,
          type: 'INCOME',
          category: 'SALE',
          concept: incomeConcepts[Math.floor(Math.random() * incomeConcepts.length)],
          reference: `SON-ING-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 12 movimientos de ingreso creados para EL SONORENSE');

      for (let i = 0; i < 6; i++) {
        const amount = Math.floor(Math.random() * 5000) + 1000; // $1,000 - $6,000
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: sonorenseBanorte.id,
          type: 'EXPENSE',
          category: 'OPERATIONAL',
          concept: expenseConcepts[Math.floor(Math.random() * expenseConcepts.length)],
          reference: `SON-EGR-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 6 movimientos de egreso creados para EL SONORENSE');
    } else {
      console.log('⏭️  Movimientos ya existen para EL SONORENSE, omitiendo creación');
    }
  }

  // SERVICIOS DEMO - 10 ingresos, 5 egresos
  if (serviciosHSBC) {
    const existingMovements = await movementsRepository.count({ where: { accountId: serviciosHSBC.id } });
    if (existingMovements === 0) {
      for (let i = 0; i < 10; i++) {
        const amount = Math.floor(Math.random() * 20000) + 5000; // $5,000 - $25,000
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: serviciosHSBC.id,
          type: 'INCOME',
          category: 'SALE',
          concept: incomeConcepts[Math.floor(Math.random() * incomeConcepts.length)],
          reference: `SER-ING-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 10 movimientos de ingreso creados para SERVICIOS DEMO');

      for (let i = 0; i < 5; i++) {
        const amount = Math.floor(Math.random() * 5000) + 1000; // $1,000 - $6,000
        const date = randomDateDistributed();
        await movementsRepository.save({
          accountId: serviciosHSBC.id,
          type: 'EXPENSE',
          category: 'OPERATIONAL',
          concept: expenseConcepts[Math.floor(Math.random() * expenseConcepts.length)],
          reference: `SER-EGR-${String(i + 1).padStart(3, '0')}`,
          amount: amount,
          date: date,
        });
      }
      console.log('✅ 5 movimientos de egreso creados para SERVICIOS DEMO');
    } else {
      console.log('⏭️  Movimientos ya existen para SERVICIOS DEMO, omitiendo creación');
    }
  }

  // Crear familias de insumos por defecto si no existen
  const existingFamilias = await familiasRepository.find();
  
  if (existingFamilias.length === 0) {
    const familiasPorDefecto = [
      {
        nombre: 'Proteínas',
        prefijo: 'PROT',
        descripcion: 'Carnes, mariscos, huevo y otros alimentos proteicos',
        color: '#EF4444',
        isActive: true,
      },
      {
        nombre: 'Secos y Abarrotes',
        prefijo: 'SECO',
        descripcion: 'Granos, cereales, pastas y alimentos secos',
        color: '#F59E0B',
        isActive: true,
      },
      {
        nombre: 'Frutas y Verduras',
        prefijo: 'FYV',
        descripcion: 'Frutas frescas, verduras y hortalizas',
        color: '#10B981',
        isActive: true,
      },
      {
        nombre: 'Lácteos',
        prefijo: 'LACT',
        descripcion: 'Leche, quesos, yogures y derivados lácteos',
        color: '#3B82F6',
        isActive: true,
      },
      {
        nombre: 'Bebidas',
        prefijo: 'BEB',
        descripcion: 'Refrescos, jugos, aguas y bebidas alcohólicas',
        color: '#8B5CF6',
        isActive: true,
      },
      {
        nombre: 'Limpieza',
        prefijo: 'LIMP',
        descripcion: 'Productos de limpieza y sanitización',
        color: '#06B6D4',
        isActive: true,
      },
      {
        nombre: 'Desechables',
        prefijo: 'DESC',
        descripcion: 'Empaques, vasos, platos y utensilios desechables',
        color: '#64748B',
        isActive: true,
      },
      {
        nombre: 'Misceláneos',
        prefijo: 'MISC',
        descripcion: 'Artículos varios que no encajan en otras categorías',
        color: '#94A3B8',
        isActive: true,
      },
    ];

    for (const familia of familiasPorDefecto) {
      await familiasRepository.save(familia);
    }

    console.log('✅ 8 familias de insumos por defecto creadas');
  }

  // Crear insumos de restaurante demo si no existen
  const existingInsumos = await insumosRepository.find();
  
  if (existingInsumos.length === 0) {
    const familias = await familiasRepository.find();
    const familiaSECO = familias.find(f => f.prefijo === 'SECO');
    const familiaPROT = familias.find(f => f.prefijo === 'PROT');
    const familiaFYV = familias.find(f => f.prefijo === 'FYV');
    const familiaLACT = familias.find(f => f.prefijo === 'LACT');
    const familiaBEB = familias.find(f => f.prefijo === 'BEB');

    const insumosData = [
      // Panes y masas
      { nombre: 'Pan para hamburguesa', familia: 'SECO', familiaId: familiaSECO?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 3.50, stockMinimo: 20, stockActual: 100 },
      { nombre: 'Pan para hot dog', familia: 'SECO', familiaId: familiaSECO?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 2.50, stockMinimo: 20, stockActual: 100 },
      { nombre: 'Masa para pizza', familia: 'SECO', familiaId: familiaSECO?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 15.00, stockMinimo: 10, stockActual: 50 },
      
      // Proteínas
      { nombre: 'Carne molida', familia: 'PROT', familiaId: familiaPROT?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 120.00, stockMinimo: 3, stockActual: 10 },
      { nombre: 'Salchicha', familia: 'PROT', familiaId: familiaPROT?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 8.00, stockMinimo: 20, stockActual: 100 },
      
      // Frutas y verduras
      { nombre: 'Lechuga', familia: 'FYV', familiaId: familiaFYV?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 25.00, stockMinimo: 2, stockActual: 5 },
      { nombre: 'Tomate', familia: 'FYV', familiaId: familiaFYV?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 18.00, stockMinimo: 2, stockActual: 5 },
      { nombre: 'Jitomate', familia: 'FYV', familiaId: familiaFYV?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 20.00, stockMinimo: 2, stockActual: 5 },
      
      // Lácteos
      { nombre: 'Queso americano', familia: 'LACT', familiaId: familiaLACT?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 4.00, stockMinimo: 50, stockActual: 200 },
      { nombre: 'Mozzarella', familia: 'LACT', familiaId: familiaLACT?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 180.00, stockMinimo: 1, stockActual: 3 },
      
      // Bebidas
      { nombre: 'Refresco lata', familia: 'BEB', familiaId: familiaBEB?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 12.00, stockMinimo: 20, stockActual: 100 },
      { nombre: 'Agua embotellada', familia: 'BEB', familiaId: familiaBEB?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 8.00, stockMinimo: 20, stockActual: 100 },
      { nombre: 'Cerveza', familia: 'BEB', familiaId: familiaBEB?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 18.00, stockMinimo: 15, stockActual: 50 },
      { nombre: 'Jugo natural', familia: 'BEB', familiaId: familiaBEB?.id, presentacion: 'pza', unidadMedida: 'pza', costoUnitario: 15.00, stockMinimo: 15, stockActual: 50 },
      
      // Condimentos para sub-recetas
      { nombre: 'Mayonesa', familia: 'SECO', familiaId: familiaSECO?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 45.00, stockMinimo: 1, stockActual: 5 },
      { nombre: 'Mostaza', familia: 'SECO', familiaId: familiaSECO?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 50.00, stockMinimo: 1, stockActual: 5 },
      { nombre: 'Ketchup', familia: 'SECO', familiaId: familiaSECO?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 40.00, stockMinimo: 1, stockActual: 5 },
      { nombre: 'Cebolla', familia: 'FYV', familiaId: familiaFYV?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 22.00, stockMinimo: 2, stockActual: 5 },
      { nombre: 'Ajo', familia: 'FYV', familiaId: familiaFYV?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 80.00, stockMinimo: 0.5, stockActual: 2 },
    ];

    for (const insumoData of insumosData) {
      const count = await insumosRepository.count({ where: { familiaId: insumoData.familiaId } });
      const nextNumber = count + 1;
      const codigo = `${insumoData.familia}-${String(nextNumber).padStart(3, '0')}`;
      
      await insumosRepository.save({
        codigo,
        nombre: insumoData.nombre,
        descripcion: '',
        familia: insumoData.familia,
        familiaId: insumoData.familiaId,
        presentacion: insumoData.presentacion,
        unidadMedida: insumoData.unidadMedida,
        costoUnitario: insumoData.costoUnitario,
        moneda: 'MXN',
        stockMinimo: insumoData.stockMinimo,
        stockActual: insumoData.stockActual,
        isActive: true,
      });
    }

    console.log('✅ 18 insumos de restaurante demo creados');
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTE 2: AGREGAR INSUMOS ADICIONALES (completar 20 insumos)
  // ═══════════════════════════════════════════════════════════════
  const currentInsumos = await insumosRepository.find({ where: { isActive: true } });
  const familias = await familiasRepository.find();
  const familiaPROT = familias.find(f => f.prefijo === 'PROT');
  const familiaSECO = familias.find(f => f.prefijo === 'SECO');
  const familiaFYV = familias.find(f => f.prefijo === 'FYV');
  const familiaLACT = familias.find(f => f.prefijo === 'LACT');
  const familiaBEB = familias.find(f => f.prefijo === 'BEB');

  // Insumos adicionales para completar 20
  const insumosAdicionales = [
    { nombre: 'Pechuga de pollo', familia: 'PROT', familiaId: familiaPROT?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 95, stockMinimo: 5, stockActual: 15 },
    { nombre: 'Camarón mediano', familia: 'PROT', familiaId: familiaPROT?.id, presentacion: 'kg', unidadMedida: 'kg', costoUnitario: 280, stockMinimo: 2, stockActual: 5 },
  ];

  for (const insumoData of insumosAdicionales) {
    const existingInsumo = await insumosRepository.findOne({ where: { nombre: insumoData.nombre } });
    if (!existingInsumo) {
      const count = await insumosRepository.count({ where: { familiaId: insumoData.familiaId } });
      const nextNumber = count + 1;
      const codigo = `${insumoData.familia}-${String(nextNumber).padStart(3, '0')}`;
      
      await insumosRepository.save({
        codigo,
        nombre: insumoData.nombre,
        descripcion: '',
        familia: insumoData.familia,
        familiaId: insumoData.familiaId,
        presentacion: insumoData.presentacion,
        unidadMedida: insumoData.unidadMedida,
        costoUnitario: insumoData.costoUnitario,
        moneda: 'MXN',
        stockMinimo: insumoData.stockMinimo,
        stockActual: insumoData.stockActual,
        isActive: true,
      });
      console.log(`✅ Insumo adicional "${insumoData.nombre}" creado`);
    }
  }

  // Crear sub-recetas si no existen
  const existingRecipes = await recipesRepository.find();
  const allInsumos = await insumosRepository.find({ where: { isActive: true } });
  
  if (existingRecipes.length === 0) {
    // Sub-receta: Aderezo especial
    const mayonesa = allInsumos.find(i => i.nombre === 'Mayonesa');
    const mostaza = allInsumos.find(i => i.nombre === 'Mostaza');
    const ketchup = allInsumos.find(i => i.nombre === 'Ketchup');
    
    if (mayonesa && mostaza && ketchup) {
      const aderezoItems = [
        { insumoId: mayonesa.id, cantidad: 0.030, unidadMedida: 'kg', costoUnitario: mayonesa.costoUnitario, costoTotal: 0.030 * mayonesa.costoUnitario },
        { insumoId: mostaza.id, cantidad: 0.010, unidadMedida: 'kg', costoUnitario: mostaza.costoUnitario, costoTotal: 0.010 * mostaza.costoUnitario },
        { insumoId: ketchup.id, cantidad: 0.015, unidadMedida: 'kg', costoUnitario: ketchup.costoUnitario, costoTotal: 0.015 * ketchup.costoUnitario },
      ];
      const aderezoCostoTotal = aderezoItems.reduce((sum, item) => sum + item.costoTotal, 0);
      
      await recipesRepository.save({
        nombre: 'Aderezo especial',
        descripcion: 'Mezcla de mayonesa, mostaza y ketchup',
        tipo: 'INSUMO_ELABORADO',
        rendimiento: 1,
        unidadRendimiento: 'porción',
        items: aderezoItems,
        costoTotal: aderezoCostoTotal,
        precioVentaSugerido: aderezoCostoTotal / 0.7,
        margenDeseado: 0.3,
        isActive: true,
      });
    }

    // Sub-receta: Salsa de tomate
    const jitomate = allInsumos.find(i => i.nombre === 'Jitomate');
    const cebolla = allInsumos.find(i => i.nombre === 'Cebolla');
    const ajo = allInsumos.find(i => i.nombre === 'Ajo');
    
    if (jitomate && cebolla && ajo) {
      const salsaItems = [
        { insumoId: jitomate.id, cantidad: 0.200, unidadMedida: 'kg', costoUnitario: jitomate.costoUnitario, costoTotal: 0.200 * jitomate.costoUnitario },
        { insumoId: cebolla.id, cantidad: 0.050, unidadMedida: 'kg', costoUnitario: cebolla.costoUnitario, costoTotal: 0.050 * cebolla.costoUnitario },
        { insumoId: ajo.id, cantidad: 0.010, unidadMedida: 'kg', costoUnitario: ajo.costoUnitario, costoTotal: 0.010 * ajo.costoUnitario },
      ];
      const salsaCostoTotal = salsaItems.reduce((sum, item) => sum + item.costoTotal, 0);
      
      await recipesRepository.save({
        nombre: 'Salsa de tomate',
        descripcion: 'Salsa base para pizzas',
        tipo: 'INSUMO_ELABORADO',
        rendimiento: 1,
        unidadRendimiento: 'porción',
        items: salsaItems,
        costoTotal: salsaCostoTotal,
        precioVentaSugerido: salsaCostoTotal / 0.7,
        margenDeseado: 0.3,
        isActive: true,
      });
    }

    console.log('✅ 2 sub-recetas creadas');
  }

  // Crear recetas principales vinculadas a productos POS
  const updatedRecipes = await recipesRepository.find();
  const panHamburguesa = allInsumos.find(i => i.nombre === 'Pan para hamburguesa');
  const carneMolida = allInsumos.find(i => i.nombre === 'Carne molida');
  const lechuga = allInsumos.find(i => i.nombre === 'Lechuga');
  const tomate = allInsumos.find(i => i.nombre === 'Tomate');
  const quesoAmericano = allInsumos.find(i => i.nombre === 'Queso americano');
  const aderezoEspecial = updatedRecipes.find(r => r.nombre === 'Aderezo especial');
  const panHotDog = allInsumos.find(i => i.nombre === 'Pan para hot dog');
  const salchicha = allInsumos.find(i => i.nombre === 'Salchicha');
  const masaPizza = allInsumos.find(i => i.nombre === 'Masa para pizza');
  const salsaTomate = updatedRecipes.find(r => r.nombre === 'Salsa de tomate');
  const mozzarella = allInsumos.find(i => i.nombre === 'Mozzarella');

  if (updatedRecipes.length === 2) {
    // Receta: Hamburguesa clásica
    if (panHamburguesa && carneMolida && lechuga && tomate && quesoAmericano && aderezoEspecial) {
      const hamburguesaItems = [
        { insumoId: panHamburguesa.id, cantidad: 1, unidadMedida: 'pza', costoUnitario: panHamburguesa.costoUnitario, costoTotal: panHamburguesa.costoUnitario },
        { insumoId: carneMolida.id, cantidad: 0.150, unidadMedida: 'kg', costoUnitario: carneMolida.costoUnitario, costoTotal: 0.150 * carneMolida.costoUnitario },
        { insumoId: lechuga.id, cantidad: 0.020, unidadMedida: 'kg', costoUnitario: lechuga.costoUnitario, costoTotal: 0.020 * lechuga.costoUnitario },
        { insumoId: tomate.id, cantidad: 0.030, unidadMedida: 'kg', costoUnitario: tomate.costoUnitario, costoTotal: 0.030 * tomate.costoUnitario },
        { insumoId: quesoAmericano.id, cantidad: 1, unidadMedida: 'pza', costoUnitario: quesoAmericano.costoUnitario, costoTotal: quesoAmericano.costoUnitario },
      ];
      const hamburguesaCostoTotal = hamburguesaItems.reduce((sum, item) => sum + item.costoTotal, 0) + aderezoEspecial.costoTotal;
      
      await recipesRepository.save({
        nombre: 'Hamburguesa clásica',
        descripcion: 'Hamburguesa con carne, lechuga, tomate, queso y aderezo',
        tipo: 'PRODUCTO_VENTA',
        rendimiento: 1,
        unidadRendimiento: 'porción',
        items: hamburguesaItems,
        costoTotal: hamburguesaCostoTotal,
        precioVentaSugerido: hamburguesaCostoTotal / 0.7,
        margenDeseado: 0.3,
        isActive: true,
      });
    }

    // Receta: Hot Dog
    if (panHotDog && salchicha) {
      const hotDogItems = [
        { insumoId: panHotDog.id, cantidad: 1, unidadMedida: 'pza', costoUnitario: panHotDog.costoUnitario, costoTotal: panHotDog.costoUnitario },
        { insumoId: salchicha.id, cantidad: 1, unidadMedida: 'pza', costoUnitario: salchicha.costoUnitario, costoTotal: salchicha.costoUnitario },
      ];
      const hotDogCostoTotal = hotDogItems.reduce((sum, item) => sum + item.costoTotal, 0);
      
      await recipesRepository.save({
        nombre: 'Hot Dog',
        descripcion: 'Hot dog clásico',
        tipo: 'PRODUCTO_VENTA',
        rendimiento: 1,
        unidadRendimiento: 'porción',
        items: hotDogItems,
        costoTotal: hotDogCostoTotal,
        precioVentaSugerido: hotDogCostoTotal / 0.7,
        margenDeseado: 0.3,
        isActive: true,
      });
    }

    // Receta: Pizza personal
    if (masaPizza && salsaTomate && mozzarella) {
      const pizzaItems = [
        { insumoId: masaPizza.id, cantidad: 1, unidadMedida: 'pza', costoUnitario: masaPizza.costoUnitario, costoTotal: masaPizza.costoUnitario },
        { insumoId: mozzarella.id, cantidad: 0.080, unidadMedida: 'kg', costoUnitario: mozzarella.costoUnitario, costoTotal: 0.080 * mozzarella.costoUnitario },
      ];
      const pizzaCostoTotal = pizzaItems.reduce((sum, item) => sum + item.costoTotal, 0) + salsaTomate.costoTotal;
      
      await recipesRepository.save({
        nombre: 'Pizza personal',
        descripcion: 'Pizza personal con salsa de tomate y mozzarella',
        tipo: 'PRODUCTO_VENTA',
        rendimiento: 1,
        unidadRendimiento: 'porción',
        items: pizzaItems,
        costoTotal: pizzaCostoTotal,
        precioVentaSugerido: pizzaCostoTotal / 0.7,
        margenDeseado: 0.3,
        isActive: true,
      });
    }

    console.log('✅ 3 recetas principales creadas');
  }

  // Crear categorías POS si no existen
  const existingCategories = await posCategoriesRepository.find();
  
  if (existingCategories.length === 0) {
    const categories = [
      { name: 'Comida', color: '#EF4444', order: 1, isActive: true },
      { name: 'Bebidas', color: '#3B82F6', order: 2, isActive: true },
      { name: 'Postres', color: '#F59E0B', order: 3, isActive: true },
    ];

    for (const category of categories) {
      await posCategoriesRepository.save(category);
    }

    console.log('✅ 3 categorías POS creadas');
  }

  // Crear productos POS vinculados a recetas/insumos
  const updatedCategories = await posCategoriesRepository.find({ where: { isActive: true } });
  const updatedRecipesFinal = await recipesRepository.find({ where: { isActive: true } });
  const categoriaComida = updatedCategories.find(c => c.name === 'Comida');
  const categoriaBebidas = updatedCategories.find(c => c.name === 'Bebidas');
  const recetaHamburguesa = updatedRecipesFinal.find(r => r.nombre === 'Hamburguesa clásica');
  const recetaHotDog = updatedRecipesFinal.find(r => r.nombre === 'Hot Dog');
  const recetaPizza = updatedRecipesFinal.find(r => r.nombre === 'Pizza personal');
  const insumoRefresco = allInsumos.find(i => i.nombre === 'Refresco lata');
  const insumoAgua = allInsumos.find(i => i.nombre === 'Agua embotellada');
  const insumoCerveza = allInsumos.find(i => i.nombre === 'Cerveza');
  const insumoJugo = allInsumos.find(i => i.nombre === 'Jugo natural');

  const existingProducts = await productsRepository.find();
  
  // Migración: Actualizar tenantId de productos existentes sin tenantId
  for (const product of existingProducts) {
    if (!product.tenantId) {
      await productsRepository.update(
        { id: product.id },
        { tenantId: demoTenant.id }
      );
      console.log(`✅ Producto "${product.name}" actualizado con tenantId`);
    }
  }
  
  // Solo crear nuevos productos si no existen
  if (existingProducts.length === 0) {
    const productsData = [
      // Productos preparados (vinculados a recetas)
      { name: 'Hamburguesa Clásica', categoryId: categoriaComida?.id, price: 120, type: 'PREPARADO', recipeId: recetaHamburguesa?.id, isActive: true, tenantId: demoTenant.id },
      { name: 'Hot Dog', categoryId: categoriaComida?.id, price: 65, type: 'PREPARADO', recipeId: recetaHotDog?.id, isActive: true, tenantId: demoTenant.id },
      { name: 'Pizza Personal', categoryId: categoriaComida?.id, price: 150, type: 'PREPARADO', recipeId: recetaPizza?.id, isActive: true, tenantId: demoTenant.id },
      
      // Productos simples (vinculados a insumos)
      { name: 'Refresco', categoryId: categoriaBebidas?.id, price: 25, type: 'SIMPLE', insumoId: insumoRefresco?.id, isActive: true, tenantId: demoTenant.id },
      { name: 'Agua', categoryId: categoriaBebidas?.id, price: 15, type: 'SIMPLE', insumoId: insumoAgua?.id, isActive: true, tenantId: demoTenant.id },
      { name: 'Cerveza', categoryId: categoriaBebidas?.id, price: 45, type: 'SIMPLE', insumoId: insumoCerveza?.id, isActive: true, tenantId: demoTenant.id },
      { name: 'Jugo Natural', categoryId: categoriaBebidas?.id, price: 35, type: 'SIMPLE', insumoId: insumoJugo?.id, isActive: true, tenantId: demoTenant.id },
    ];

    for (const productData of productsData) {
      await productsRepository.save(productData);
    }

    console.log('✅ 7 productos POS creados');
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTE 3: AGREGAR RECETAS Y PRODUCTOS POS ADICIONALES
  // ═══════════════════════════════════════════════════════════════
  const recipesForPart3 = await recipesRepository.find({ where: { isActive: true } });
  const insumosForPart3 = await insumosRepository.find({ where: { isActive: true } });
  const categoriesForPart3 = await posCategoriesRepository.find({ where: { isActive: true } });

  // Buscar insumos para nuevas recetas
  const pechuga = insumosForPart3.find(i => i.nombre === 'Pechuga de pollo');
  const aceite = insumosForPart3.find(i => i.nombre === 'Aceite vegetal');
  const limon = insumosForPart3.find(i => i.nombre === 'Limón');
  const cebolla = insumosForPart3.find(i => i.nombre === 'Cebolla');
  const camaron = insumosForPart3.find(i => i.nombre === 'Camarón mediano');
  const arroz = insumosForPart3.find(i => i.nombre === 'Arroz');
  const frijol = insumosForPart3.find(i => i.nombre === 'Frijol negro');
  const lechugaPart3 = insumosForPart3.find(i => i.nombre === 'Lechuga');
  const jitomate = insumosForPart3.find(i => i.nombre === 'Jitomate');
  const quesoOaxaca = insumosForPart3.find(i => i.nombre === 'Queso Oaxaca');
  const crema = insumosForPart3.find(i => i.nombre === 'Crema');

  // Receta: Pollo a la plancha
  const existingPollo = await recipesRepository.findOne({ where: { nombre: 'Pollo a la plancha' } });
  if (!existingPollo && pechuga && aceite && limon && cebolla) {
    const polloItems = [
      { insumoId: pechuga.id, cantidad: 0.200, unidadMedida: 'kg', costoUnitario: pechuga.costoUnitario, costoTotal: 0.200 * pechuga.costoUnitario },
      { insumoId: aceite.id, cantidad: 0.015, unidadMedida: 'L', costoUnitario: aceite.costoUnitario, costoTotal: 0.015 * aceite.costoUnitario },
      { insumoId: limon.id, cantidad: 0.030, unidadMedida: 'kg', costoUnitario: limon.costoUnitario, costoTotal: 0.030 * limon.costoUnitario },
      { insumoId: cebolla.id, cantidad: 0.030, unidadMedida: 'kg', costoUnitario: cebolla.costoUnitario, costoTotal: 0.030 * cebolla.costoUnitario },
    ];
    const polloCostoTotal = polloItems.reduce((sum, item) => sum + item.costoTotal, 0);
    
    await recipesRepository.save({
      nombre: 'Pollo a la plancha',
      descripcion: 'Pechuga de pollo a la plancha con verduras',
      tipo: 'PRODUCTO_VENTA',
      rendimiento: 1,
      unidadRendimiento: 'porción',
      items: polloItems,
      costoTotal: polloCostoTotal,
      precioVentaSugerido: polloCostoTotal / 0.7,
      margenDeseado: 0.3,
      isActive: true,
    });
    console.log('✅ Receta "Pollo a la plancha" creada');
  }

  // Receta: Camarones al ajillo
  const existingCamarones = await recipesRepository.findOne({ where: { nombre: 'Camarones al ajillo' } });
  if (!existingCamarones && camaron && aceite && limon) {
    const camaronesItems = [
      { insumoId: camaron.id, cantidad: 0.200, unidadMedida: 'kg', costoUnitario: camaron.costoUnitario, costoTotal: 0.200 * camaron.costoUnitario },
      { insumoId: aceite.id, cantidad: 0.020, unidadMedida: 'L', costoUnitario: aceite.costoUnitario, costoTotal: 0.020 * aceite.costoUnitario },
      { insumoId: limon.id, cantidad: 0.020, unidadMedida: 'kg', costoUnitario: limon.costoUnitario, costoTotal: 0.020 * limon.costoUnitario },
    ];
    const camaronesCostoTotal = camaronesItems.reduce((sum, item) => sum + item.costoTotal, 0);
    
    await recipesRepository.save({
      nombre: 'Camarones al ajillo',
      descripcion: 'Camarones salteados con ajo y limón',
      tipo: 'PRODUCTO_VENTA',
      rendimiento: 1,
      unidadRendimiento: 'porción',
      items: camaronesItems,
      costoTotal: camaronesCostoTotal,
      precioVentaSugerido: camaronesCostoTotal / 0.7,
      margenDeseado: 0.3,
      isActive: true,
    });
    console.log('✅ Receta "Camarones al ajillo" creada');
  }

  // Receta: Arroz con Frijoles
  const existingArrozFrijoles = await recipesRepository.findOne({ where: { nombre: 'Arroz con Frijoles' } });
  if (!existingArrozFrijoles && arroz && frijol) {
    const arrozItems = [
      { insumoId: arroz.id, cantidad: 0.150, unidadMedida: 'kg', costoUnitario: arroz.costoUnitario, costoTotal: 0.150 * arroz.costoUnitario },
      { insumoId: frijol.id, cantidad: 0.100, unidadMedida: 'kg', costoUnitario: frijol.costoUnitario, costoTotal: 0.100 * frijol.costoUnitario },
    ];
    const arrozCostoTotal = arrozItems.reduce((sum, item) => sum + item.costoTotal, 0);
    
    await recipesRepository.save({
      nombre: 'Arroz con Frijoles',
      descripcion: 'Arroz acompañado de frijoles negros',
      tipo: 'PRODUCTO_VENTA',
      rendimiento: 1,
      unidadRendimiento: 'porción',
      items: arrozItems,
      costoTotal: arrozCostoTotal,
      precioVentaSugerido: arrozCostoTotal / 0.7,
      margenDeseado: 0.3,
      isActive: true,
    });
    console.log('✅ Receta "Arroz con Frijoles" creada');
  }

  // Receta: Tacos de Pollo
  const existingTacosPollo = await recipesRepository.findOne({ where: { nombre: 'Tacos de Pollo' } });
  if (!existingTacosPollo && pechuga && lechugaPart3 && jitomate && cebolla && limon) {
    const tacosItems = [
      { insumoId: pechuga.id, cantidad: 0.150, unidadMedida: 'kg', costoUnitario: pechuga.costoUnitario, costoTotal: 0.150 * pechuga.costoUnitario },
      { insumoId: lechugaPart3.id, cantidad: 0.020, unidadMedida: 'kg', costoUnitario: lechugaPart3.costoUnitario, costoTotal: 0.020 * lechugaPart3.costoUnitario },
      { insumoId: jitomate.id, cantidad: 0.030, unidadMedida: 'kg', costoUnitario: jitomate.costoUnitario, costoTotal: 0.030 * jitomate.costoUnitario },
      { insumoId: cebolla.id, cantidad: 0.020, unidadMedida: 'kg', costoUnitario: cebolla.costoUnitario, costoTotal: 0.020 * cebolla.costoUnitario },
      { insumoId: limon.id, cantidad: 0.010, unidadMedida: 'kg', costoUnitario: limon.costoUnitario, costoTotal: 0.010 * limon.costoUnitario },
    ];
    const tacosCostoTotal = tacosItems.reduce((sum, item) => sum + item.costoTotal, 0);
    
    await recipesRepository.save({
      nombre: 'Tacos de Pollo',
      descripcion: '3 tacos de pollo con verduras',
      tipo: 'PRODUCTO_VENTA',
      rendimiento: 1,
      unidadRendimiento: 'orden',
      items: tacosItems,
      costoTotal: tacosCostoTotal,
      precioVentaSugerido: tacosCostoTotal / 0.7,
      margenDeseado: 0.3,
      isActive: true,
    });
    console.log('✅ Receta "Tacos de Pollo" creada');
  }

  // Productos POS adicionales
  const categoriaPlatillos = categoriesForPart3.find(c => c.name === 'Comida');
  const categoriaExtras = categoriesForPart3.find(c => c.name === 'Postres');
  const categoriaBebidasPart3 = categoriesForPart3.find(c => c.name === 'Bebidas');

  const finalRecipes = await recipesRepository.find({ where: { isActive: true } });
  const recetaPollo = finalRecipes.find(r => r.nombre === 'Pollo a la plancha');
  const recetaCamarones = finalRecipes.find(r => r.nombre === 'Camarones al ajillo');
  const recetaArrozFrijoles = finalRecipes.find(r => r.nombre === 'Arroz con Frijoles');
  const recetaTacosPollo = finalRecipes.find(r => r.nombre === 'Tacos de Pollo');

  const productosAdicionales = [
    { name: 'Pollo a la Plancha', categoryId: categoriaPlatillos?.id, price: 145, type: 'PREPARADO', recipeId: recetaPollo?.id, isActive: true, tenantId: demoTenant.id },
    { name: 'Camarones al Ajillo', categoryId: categoriaPlatillos?.id, price: 195, type: 'PREPARADO', recipeId: recetaCamarones?.id, isActive: true, tenantId: demoTenant.id },
    { name: 'Arroz con Frijoles', categoryId: categoriaPlatillos?.id, price: 45, type: 'PREPARADO', recipeId: recetaArrozFrijoles?.id, isActive: true, tenantId: demoTenant.id },
    { name: 'Tacos de Pollo', categoryId: categoriaPlatillos?.id, price: 85, type: 'PREPARADO', recipeId: recetaTacosPollo?.id, isActive: true, tenantId: demoTenant.id },
    { name: 'Orden de Limón', categoryId: categoriaExtras?.id, price: 10, type: 'SIMPLE', insumoId: limon?.id, isActive: true, tenantId: demoTenant.id },
    { name: 'Porción Extra', categoryId: categoriaExtras?.id, price: 25, type: 'SIMPLE', isActive: true, tenantId: demoTenant.id },
  ];

  for (const productData of productosAdicionales) {
    const existingProduct = await productsRepository.findOne({ where: { name: productData.name } });
    if (!existingProduct) {
      await productsRepository.save(productData);
      console.log(`✅ Producto POS "${productData.name}" creado`);
    }
  }

  // Migración: asignar tenantId a insumos y recetas existentes sin tenant
  const insumosWithoutTenant = await insumosRepository.find({ where: { tenantId: IsNull() } });
  if (insumosWithoutTenant.length > 0) {
    for (const insumo of insumosWithoutTenant) {
      await insumosRepository.update(insumo.id, { tenantId: demoTenant.id });
    }
    console.log(`✅ ${insumosWithoutTenant.length} insumos actualizados con tenantId`);
  }

  const recipesWithoutTenant = await recipesRepository.find({ where: { tenantId: IsNull() } });
  if (recipesWithoutTenant.length > 0) {
    for (const recipe of recipesWithoutTenant) {
      await recipesRepository.update(recipe.id, { tenantId: demoTenant.id });
    }
    console.log(`✅ ${recipesWithoutTenant.length} recetas actualizadas con tenantId`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTE 4: AGREGAR MOVIMIENTOS HISTÓRICOS (40 ingresos, 20 egresos, 5 transferencias)
  // ═══════════════════════════════════════════════════════════════
  const allBanks = await banksRepository.find();
  const existingMovementsCount = await movementsRepository.count();

  if (existingMovementsCount < 65) {
    const bankBBVA = allBanks.find(b => b.name === 'Cuenta Principal BBVA');
    const bankBanorte = allBanks.find(b => b.name && b.name.includes('Banorte'));
    const bankCaja = allBanks.find(b => b.name === 'Caja Chica');

    // 40 ingresos por ventas
    const incomeConcepts = [
      'Venta de alimentos', 'Venta de bebidas', 'Venta de platillos', 'Venta de postres',
      'Venta de combos', 'Venta de desayunos', 'Venta de almuerzos', 'Venta de cenas',
      'Venta de snacks', 'Venta de cafés'
    ];

    for (let i = 0; i < 40; i++) {
      const amount = Math.floor(Math.random() * 20000) + 5000; // $5,000 - $25,000
      const date = randomDateDistributed();

      await movementsRepository.save({
        accountId: bankBBVA?.id,
        type: 'INCOME',
        category: 'VENTAS',
        concept: incomeConcepts[Math.floor(Math.random() * incomeConcepts.length)],
        reference: `FAC-${String(i + 100).padStart(4, '0')}`,
        amount: amount,
        date: date,
      });
    }

    // 20 egresos por gastos operativos (con categorías correctas para reportes)
    const expenseData = [
      { concept: 'Pago de nómina',      category: 'GASTOS_FIJOS',    minAmt: 15000, maxAmt: 25000 },
      { concept: 'Renta de local',       category: 'GASTOS_FIJOS',    minAmt: 8000,  maxAmt: 12000 },
      { concept: 'Servicios de luz',     category: 'GASTOS_FIJOS',    minAmt: 2000,  maxAmt: 4000  },
      { concept: 'Servicios de agua',    category: 'GASTOS_FIJOS',    minAmt: 500,   maxAmt: 1500  },
      { concept: 'Servicios de gas',     category: 'GASTOS_FIJOS',    minAmt: 1000,  maxAmt: 3000  },
      { concept: 'Servicios de internet',category: 'GASTOS_FIJOS',    minAmt: 500,   maxAmt: 1200  },
      { concept: 'Compra de insumos',    category: 'COSTO_VENTA',     minAmt: 5000,  maxAmt: 15000 },
      { concept: 'Compra de materias primas', category: 'COSTO_VENTA', minAmt: 3000, maxAmt: 10000 },
      { concept: 'Mantenimiento',        category: 'GASTOS_VARIABLES', minAmt: 1000, maxAmt: 5000  },
      { concept: 'Limpieza',             category: 'GASTOS_VARIABLES', minAmt: 500,  maxAmt: 2000  },
      { concept: 'Seguros',              category: 'GASTOS_FIJOS',    minAmt: 2000,  maxAmt: 4000  },
      { concept: 'Publicidad',           category: 'GASTOS_VARIABLES', minAmt: 1000, maxAmt: 5000  },
      { concept: 'Transporte',           category: 'GASTOS_VARIABLES', minAmt: 500,  maxAmt: 2000  },
      { concept: 'Equipo de cocina',     category: 'COSTO_VENTA',     minAmt: 2000,  maxAmt: 8000  },
      { concept: 'Vajilla',              category: 'COSTO_VENTA',     minAmt: 1000,  maxAmt: 3000  },
      { concept: 'Uniformes',            category: 'GASTOS_FIJOS',    minAmt: 1000,  maxAmt: 3000  },
      { concept: 'Impuestos',            category: 'IMPUESTOS',        minAmt: 3000, maxAmt: 8000  },
      { concept: 'Asesoría contable',    category: 'GASTOS_VARIABLES', minAmt: 2000, maxAmt: 5000  },
      { concept: 'Reparaciones',         category: 'GASTOS_VARIABLES', minAmt: 500,  maxAmt: 3000  },
      { concept: 'Gastos misceláneos',   category: 'GASTOS_VARIABLES', minAmt: 200,  maxAmt: 1500  },
    ];

    for (let i = 0; i < 20; i++) {
      const ed = expenseData[i];
      const amount = Math.floor(Math.random() * (ed.maxAmt - ed.minAmt)) + ed.minAmt;
      const date = randomDateDistributed();

      await movementsRepository.save({
        accountId: bankBanorte?.id || bankBBVA?.id,
        type: 'EXPENSE',
        category: ed.category,
        concept: ed.concept,
        reference: `GAS-${String(i + 100).padStart(4, '0')}`,
        amount: amount,
        date: date,
      });
    }

    // 5 transferencias entre cuentas
    for (let i = 0; i < 5; i++) {
      const amount = Math.floor(Math.random() * 5000) + 1000;
      const date = randomDateDistributed();

      await movementsRepository.save({
        accountId: bankBBVA?.id,
        type: 'EXPENSE',
        category: 'TRANSFER',
        concept: 'Transferencia entre cuentas',
        reference: `TRF-${String(i + 100).padStart(4, '0')}`,
        amount: amount,
        date: date,
      });

      await movementsRepository.save({
        accountId: bankCaja?.id,
        type: 'INCOME',
        category: 'TRANSFER',
        concept: 'Transferencia entre cuentas',
        reference: `TRF-${String(i + 100).padStart(4, '0')}`,
        amount: amount,
        date: date,
      });
    }

    console.log('✅ 65 movimientos históricos creados (40 ingresos, 20 egresos, 5 transferencias)');
  }

  // Migración: corregir categorías de movimientos existentes para que reportes funcionen
  const movimientosSale = await movementsRepository.count({ where: { category: 'SALE' } });
  if (movimientosSale > 0) {
    await movementsRepository
      .createQueryBuilder()
      .update()
      .set({ category: 'VENTAS' })
      .where('category = :cat', { cat: 'SALE' })
      .execute();
    console.log(`✅ ${movimientosSale} movimientos con category SALE actualizados a VENTAS`);
  }

  const movimientosOp = await movementsRepository.count({ where: { category: 'OPERATIONAL' } });
  if (movimientosOp > 0) {
    await movementsRepository
      .createQueryBuilder()
      .update()
      .set({ category: 'GASTOS_VARIABLES' })
      .where('category = :cat', { cat: 'OPERATIONAL' })
      .execute();
    console.log(`✅ ${movimientosOp} movimientos con category OPERATIONAL actualizados a GASTOS_VARIABLES`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTE 5: AGREGAR ÓRDENES DE COMPRA, FACTURAS E INVENTARIO
  // ═══════════════════════════════════════════════════════════════
  const allSuppliers = await suppliersRepository.find();
  const allBranches = await branchesRepository.find();
  const existingPurchaseOrders = await purchaseOrdersRepository.count();
  const existingInvoices = await purchaseInvoicesRepository.count();
  const existingInventoryRecords = await inventoryRecordsRepository.count();

  // MIGRACIÓN: Actualizar facturas existentes con tenantId, supplierId y campos faltantes
  const invoicesWithoutTenant = await purchaseInvoicesRepository.find({ where: { tenantId: null } });
  if (invoicesWithoutTenant.length > 0) {
    const firstSupplier = allSuppliers[0];
    for (const invoice of invoicesWithoutTenant) {
      const now = new Date();
      const fechaVencimiento = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      await purchaseInvoicesRepository.update(invoice.id, {
        tenantId: demoTenant.id,
        supplierId: invoice.supplierId || firstSupplier?.id,
        numero: invoice.numero || `FAC-${String(500 + Math.floor(Math.random() * 1000)).padStart(6, '0')}`,
        total: invoice.total > 0 ? invoice.total : (invoice.subtotal || 0),
        fechaVencimiento: invoice.fechaVencimiento || fechaVencimiento.toISOString().split('T')[0],
        diasCredito: invoice.diasCredito || 30,
      });
    }
    console.log(`✅ ${invoicesWithoutTenant.length} facturas actualizadas con tenantId, supplierId y campos faltantes`);
  }

  // MIGRACIÓN: Actualizar órdenes de compra existentes con tenantId y campos faltantes
  const ordersWithoutTenant = await purchaseOrdersRepository.find({ where: { tenantId: IsNull() } });
  if (ordersWithoutTenant.length > 0) {
    const firstSupplier = allSuppliers[0];
    for (let i = 0; i < ordersWithoutTenant.length; i++) {
      const order = ordersWithoutTenant[i];
      const now = new Date();
      
      await purchaseOrdersRepository.update(order.id, {
        tenantId: demoTenant.id,
        supplierId: order.supplierId || firstSupplier?.id,
        numero: order.numero || `OC-${String(i + 1).padStart(6, '0')}`,
        fecha: order.fecha || now.toISOString().split('T')[0],
        total: order.total > 0 ? order.total : (order.subtotal || 0),
      });
    }
    console.log(`✅ ${ordersWithoutTenant.length} órdenes de compra actualizadas con tenantId y campos faltantes`);
  }

  // MIGRACIÓN: Actualizar productos POS existentes con tenantId
  const allProducts = await productsRepository.find();
  if (allProducts.length > 0) {
    for (const product of allProducts) {
      if (!product.tenantId) {
        await productsRepository.update(product.id, {
          tenantId: demoTenant.id,
        });
      }
    }
    const updatedCount = allProducts.filter(p => !p.tenantId).length;
    console.log(`✅ ${updatedCount} productos POS actualizados con tenantId`);
  }

  const branchCentro = allBranches.find(b => b.name === 'Sucursal Centro');
  const branchNorte = allBranches.find(b => b.name === 'Sucursal Norte');

  // Órdenes de compra
  if (existingPurchaseOrders < 3) {
    const supplierDistribuidora = allSuppliers.find(s => s.nombre === 'Distribuidora Nacional');
    const supplierFrutas = allSuppliers.find(s => s.nombre === 'Frutas y Verduras del Valle');

    // 2 OC recibidas
    for (let i = 0; i < 2; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (30 + i * 15));

      await purchaseOrdersRepository.save({
        supplierId: supplierDistribuidora?.id,
        branchId: branchCentro?.id,
        numero: `OC-${String(100 + i).padStart(6, '0')}`,
        status: 'RECIBIDA',
        fecha: date.toISOString().split('T')[0],
        fechaEntregaEsperada: new Date(date.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        subtotal: Math.floor(Math.random() * 15000) + 5000,
        impuestos: 0,
        total: 0,
        notas: 'Orden de compra de insumos',
      });
    }

    // 1 OC pendiente
    const pendingDate = new Date();
    await purchaseOrdersRepository.save({
      supplierId: supplierFrutas?.id,
      branchId: branchCentro?.id,
      numero: 'OC-000103',
      status: 'PENDIENTE',
      fecha: pendingDate.toISOString().split('T')[0],
      fechaEntregaEsperada: new Date(pendingDate.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subtotal: 8500,
      impuestos: 0,
      total: 0,
      notas: 'Orden pendiente de entrega',
    });

    console.log('✅ 3 órdenes de compra creadas');
  }

  // Facturas de compra (usando entidad Purchase)
  if (existingInvoices < 5) {
    const allPurchaseOrders = await purchaseOrdersRepository.find();

    // 3 facturas pagadas
    for (let i = 0; i < 3; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (45 + i * 15));
      const subtotal = Math.floor(Math.random() * 10000) + 3000;

      await purchaseInvoicesRepository.save({
        numero: `FAC-${String(500 + i).padStart(6, '0')}`,
        fecha: date.toISOString().split('T')[0],
        supplierId: allPurchaseOrders[i]?.supplierId,
        ocId: allPurchaseOrders[i]?.id,
        items: [],
        subtotal: subtotal,
        impuestos: 0,
        total: subtotal,
        montoPagado: subtotal,
        status: 'PAGADA',
        fechaVencimiento: new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        metodoPago: 'TRANSFERENCIA',
        diasCredito: 15,
        tenantId: demoTenant.id,
      });
    }

    // 2 facturas pendientes (CxP activa)
    for (let i = 0; i < 2; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (10 + i * 5));
      const subtotal = Math.floor(Math.random() * 8000) + 2000;

      await purchaseInvoicesRepository.save({
        numero: `FAC-${String(503 + i).padStart(6, '0')}`,
        fecha: date.toISOString().split('T')[0],
        supplierId: allPurchaseOrders[Math.min(i + 3, allPurchaseOrders.length - 1)]?.supplierId,
        ocId: allPurchaseOrders[Math.min(i + 3, allPurchaseOrders.length - 1)]?.id,
        items: [],
        subtotal: subtotal,
        impuestos: 0,
        total: subtotal,
        montoPagado: 0,
        status: 'PENDIENTE',
        fechaVencimiento: new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        metodoPago: null,
        diasCredito: 15,
        tenantId: demoTenant.id,
      });
    }

    console.log('✅ 5 facturas de compra creadas');
  }

  // Registros de inventario (usando entidad Inventory)
  if (existingInventoryRecords < 5) {
    const allInsumos = await insumosRepository.find({ where: { isActive: true } });
    
    // Crear registros de inventario para los últimos 3 meses
    for (let i = 0; i < 3; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const periodo = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Crear registros para algunos insumos
      for (let j = 0; j < Math.min(5, allInsumos.length); j++) {
        const insumo = allInsumos[j];
        const inventarioInicial = Math.floor(Math.random() * 50) + 10;
        const entradas = Math.floor(Math.random() * 30) + 5;
        const salidas = Math.floor(Math.random() * 25) + 5;
        const inventarioFinal = inventarioInicial + entradas - salidas;

        await inventoryRecordsRepository.save({
          insumoId: insumo.id,
          periodo: periodo,
          inventarioInicial: inventarioInicial,
          entradas: entradas,
          salidas: salidas,
          inventarioFinal: inventarioFinal,
          costoPromedio: insumo.costoUnitario,
          tenantId: demoTenant.id,
        });
      }
    }

    console.log('✅ Registros de inventario creados');
  }

  // Crear áreas y mesas para POS si no existen
  const existingAreas = await areasRepository.count();
  
  if (existingAreas === 0) {
    // Buscar cualquier sucursal disponible
    const demoBranch = await branchesRepository.findOne({ where: {} });
    
    if (!demoBranch) {
      console.log('⚠️ No se encontró sucursal para crear áreas y mesas');
    } else {
      const areaTerraza = await areasRepository.save({
        branchId: demoBranch.id,
        name: 'Terraza',
        capacity: 12,
        isActive: true,
      });

      const areaSalon = await areasRepository.save({
        branchId: demoBranch.id,
        name: 'Salón principal',
        capacity: 20,
        isActive: true,
      });

      const areaBarra = await areasRepository.save({
        branchId: demoBranch.id,
        name: 'Barra',
        capacity: 8,
        isActive: true,
      });

      // Mesas Terraza
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaTerraza.id, number: 1, capacity: 4, status: 'AVAILABLE', isActive: true });
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaTerraza.id, number: 2, capacity: 4, status: 'AVAILABLE', isActive: true });
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaTerraza.id, number: 3, capacity: 4, status: 'AVAILABLE', isActive: true });

      // Mesas Salón
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaSalon.id, number: 4, capacity: 6, status: 'AVAILABLE', isActive: true });
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaSalon.id, number: 5, capacity: 6, status: 'AVAILABLE', isActive: true });
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaSalon.id, number: 6, capacity: 4, status: 'AVAILABLE', isActive: true });
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaSalon.id, number: 7, capacity: 4, status: 'AVAILABLE', isActive: true });

      // Mesas Barra
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaBarra.id, number: 1, capacity: 2, status: 'AVAILABLE', isActive: true });
      await tablesRepository.save({ branchId: demoBranch.id, areaId: areaBarra.id, number: 2, capacity: 2, status: 'AVAILABLE', isActive: true });

      console.log('✅ 3 áreas y 10 mesas creadas para POS');
    }
  }

  // Migración: Limpiar duplicados de mesas
  const allTables = await tablesRepository.find();
  const tableMap = new Map<string, any>(); // key: "number-areaId", value: table
  
  for (const table of allTables) {
    const key = `${table.number}-${table.areaId}`;
    if (tableMap.has(key)) {
      // Eliminar duplicado (el más reciente)
      await tablesRepository.delete(table.id);
    } else {
      tableMap.set(key, table);
    }
  }
  console.log(`✅ Duplicados de mesas eliminados`);

  // Migración: Asignar áreas a mesas existentes con areaId NULL
  const existingTables = await tablesRepository.find({ where: { areaId: IsNull() } });
  if (existingTables.length > 0) {
    const areas = await areasRepository.find();
    const terraza = areas.find(a => a.name === 'Terraza');
    const salon = areas.find(a => a.name === 'Salón principal');
    const barra = areas.find(a => a.name === 'Barra');

    if (terraza && salon && barra) {
      for (const table of existingTables) {
        if ([1, 2, 3].includes(table.number)) {
          await tablesRepository.update(table.id, { areaId: terraza.id });
        } else if ([4, 5, 6, 7].includes(table.number)) {
          await tablesRepository.update(table.id, { areaId: salon.id });
        } else {
          await tablesRepository.update(table.id, { areaId: barra.id });
        }
      }
      console.log(`✅ ${existingTables.length} mesas migradas con areaId asignado`);
    }
  }

  // Migración: Crear mesas de barra faltantes si no existen
  const areas = await areasRepository.find();
  const barra = areas.find(a => a.name === 'Barra');
  const demoBranch = await branchesRepository.findOne({ where: {} });
  
  if (barra && demoBranch) {
    const barraTables = await tablesRepository.find({ where: { areaId: barra.id } });
    const existingNumbers = barraTables.map(t => t.number);
    
    // Crear mesas 8 y 9 si no existen
    if (!existingNumbers.includes(8)) {
      await tablesRepository.save({
        branchId: demoBranch.id,
        areaId: barra.id,
        number: 8,
        capacity: 2,
        status: 'AVAILABLE',
        isActive: true,
      });
    }
    if (!existingNumbers.includes(9)) {
      await tablesRepository.save({
        branchId: demoBranch.id,
        areaId: barra.id,
        number: 9,
        capacity: 2,
        status: 'AVAILABLE',
        isActive: true,
      });
    }
    console.log('✅ Mesas de barra verificadas/creadas');
  }

  // Migración: Asignar categoryId a productos existentes sin categoría
  const categories = await posCategoriesRepository.find();
  const comida = categories.find(c => c.name === 'Comida');
  const bebidas = categories.find(c => c.name === 'Bebidas');
  const postres = categories.find(c => c.name === 'Postres');

  if (comida && bebidas && postres) {
    const productsWithoutCategory = await productsRepository.find({ where: { categoryId: IsNull() } });
    
    for (const product of productsWithoutCategory) {
      const productName = product.name.toLowerCase();
      let categoryId: string | null = null;
      
      // Asignar categoría según nombre del producto
      if (['hamburguesa', 'hot dog', 'pizza', 'pollo', 'camarones', 'arroz', 'tacos'].some(name => productName.includes(name))) {
        categoryId = comida.id;
      } else if (['refresco', 'agua', 'cerveza', 'jugo'].some(name => productName.includes(name))) {
        categoryId = bebidas.id;
      } else if (['orden de limón', 'porción extra'].some(name => productName.includes(name))) {
        categoryId = postres.id;
      }
      
      if (categoryId) {
        await productsRepository.update(product.id, { categoryId });
      }
    }
    console.log(`✅ ${productsWithoutCategory.length} productos migrados con categoryId asignado`);
  }

  // Migración: Actualizar password del cajero a NIP '1234'
  const cajeroUser = await usersRepository.findOne({ where: { email: 'cajero@demo.com' } });
  if (cajeroUser) {
    const hashedNip = await bcrypt.hash('1234', 10);
    await usersRepository.update(
      { email: 'cajero@demo.com' },
      { password: hashedNip }
    );
    console.log('✅ Password cajero actualizado a NIP 1234');
    console.log('   Hash generado:', hashedNip);
  } else {
    console.log('⚠️ Cajero no encontrado, no se actualizó password');
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTE HR: EMPLEADOS, TURNOS, ASISTENCIAS, SOLICITUDES DEMO
  // ═══════════════════════════════════════════════════════════════
  try {
    const empRepo = dataSource.getRepository('Employee');
    const docRepo = dataSource.getRepository('HrDocument');
    const hrShiftRepo = dataSource.getRepository('HrShift');
    const attendanceRepo = dataSource.getRepository('Attendance');
    const vacationRepo = dataSource.getRepository('VacationRequest');
    const permissionRepo = dataSource.getRepository('PermissionRequest');

    const sazonMatriz = await branchesRepository.findOne({
      where: { companyId: sazonCompany.id },
    }) || await branchesRepository.save({
      tenantId: demoTenant.id,
      companyId: sazonCompany.id,
      name: 'Matriz',
      code: 'SAZ-MAT',
      city: 'Mexicali',
      state: 'Baja California',
      isActive: true,
    });

    {
      // ─── Nuevos usuarios ────────────────────────────────────────
      const cajero2Exists = await usersRepository.findOne({ where: { email: 'cajero2@demo.com' } });
      if (!cajero2Exists) {
        const hp = await bcrypt.hash('Admin123', 10);
        await usersRepository.save({
          email: 'cajero2@demo.com', password: hp, name: 'Cajero 2 Demo',
          roleId: cajeroRole!.id, roleCode: 'CAJERO', tenantId: demoTenant.id,
          isActive: true, executivePin: '1234',
        });
        console.log('✅ Usuario cajero2@demo.com creado');
      }

      const meseroUserExists = await usersRepository.findOne({ where: { email: 'mesero@demo.com' } });
      if (!meseroUserExists) {
        const hp = await bcrypt.hash('Admin123', 10);
        await usersRepository.save({
          email: 'mesero@demo.com', password: hp, name: 'Mesero Demo',
          roleId: cajeroRole!.id, roleCode: 'CAJERO', tenantId: demoTenant.id,
          isActive: true, executivePin: '1234',
        });
        console.log('✅ Usuario mesero@demo.com creado');
      }

      // ─── Lookup usuarios para vincular empleados ─────────────────
      const uGerenteSazon = await usersRepository.findOne({ where: { email: 'gerente.sazon@demo.com' } });
      const uCajero = await usersRepository.findOne({ where: { email: 'cajero@demo.com' } });
      const uMesero = await usersRepository.findOne({ where: { email: 'mesero@demo.com' } });
      const uContador = await usersRepository.findOne({ where: { email: 'contador@demo.com' } });

      const fechaIngresoHR = new Date();
      fechaIngresoHR.setFullYear(fechaIngresoHR.getFullYear() - 1);
      const fechaIngresoStr = fechaIngresoHR.toISOString().split('T')[0];

      // ─── 6 Empleados ─────────────────────────────────────────────
      const empDataList = [
        { nombre: 'Juan López', apellidos: 'Gerente', puesto: 'Gerente Operaciones', departamento: 'Dirección', salarioQuincenal: 18000, userId: uGerenteSazon?.id },
        { nombre: 'María García', apellidos: '', puesto: 'Cajera', departamento: 'Operaciones', salarioQuincenal: 6500, userId: uCajero?.id },
        { nombre: 'Carlos Mendoza', apellidos: '', puesto: 'Mesero', departamento: 'Servicio', salarioQuincenal: 5500, userId: uMesero?.id },
        { nombre: 'Ana Martínez', apellidos: '', puesto: 'Cocinera', departamento: 'Cocina', salarioQuincenal: 7000, userId: undefined },
        { nombre: 'Roberto Sánchez', apellidos: '', puesto: 'Contador', departamento: 'Administración', salarioQuincenal: 12000, userId: uContador?.id },
        { nombre: 'Laura Torres', apellidos: '', puesto: 'Hostess', departamento: 'Servicio', salarioQuincenal: 5000, userId: undefined },
      ];

      const sdiMap: Record<string, number> = {
        'Juan López': 1200,
        'María García': 433.33,
        'Carlos Mendoza': 366.67,
        'Ana Martínez': 466.67,
        'Roberto Sánchez': 800,
        'Laura Torres': 333.33,
      };

      const savedEmps: any[] = [];
      for (const ed of empDataList) {
        const existingEmp = await empRepo.findOne({ where: { tenantId: demoTenant.id, nombre: ed.nombre } });
        if (!existingEmp) {
          const emp = await empRepo.save({
            tenantId: demoTenant.id,
            companyId: sazonCompany.id,
            branchId: sazonMatriz.id,
            nombre: ed.nombre,
            apellidos: ed.apellidos || undefined,
            puesto: ed.puesto,
            departamento: ed.departamento,
            salarioQuincenal: ed.salarioQuincenal,
            salarioDiarioIntegrado: sdiMap[ed.nombre] || 0,
            periodoPago: 'QUINCENAL',
            userId: ed.userId || undefined,
            status: 'ACTIVO',
            fechaIngreso: fechaIngresoStr,
          });
          savedEmps.push(emp);
          console.log(`✅ Empleado "${ed.nombre}" creado`);
        } else {
          // Migración: actualizar SDI si está en cero
          if (!Number(existingEmp.salarioDiarioIntegrado) && sdiMap[ed.nombre]) {
            await empRepo.update(existingEmp.id, {
              salarioDiarioIntegrado: sdiMap[ed.nombre],
              periodoPago: existingEmp.periodoPago || 'QUINCENAL',
            });
          }
          savedEmps.push(existingEmp);
          console.log(`ℹ️ Empleado "${ed.nombre}" ya existe`);
        }
      }

      // ─── 3 Documentos por empleado ────────────────────────────────
      const docTemplates = [
        { tipo: 'INE', nombre: 'INE Vigente', notas: 'Copia frontal y trasera', url: 'https://example.com/doc-ine.pdf' },
        { tipo: 'CURP', nombre: 'CURP Oficial', notas: null, url: 'https://example.com/doc-curp.pdf' },
        { tipo: 'CONTRATO', nombre: 'Contrato Indefinido', notas: 'Firmado digitalmente', url: 'https://example.com/doc-contrato.pdf' },
      ];
      for (const emp of savedEmps) {
        for (const tpl of docTemplates) {
          const existsDoc = await docRepo.findOne({ where: { employeeId: emp.id, tipo: tpl.tipo } });
          if (!existsDoc) {
            await docRepo.save({ employeeId: emp.id, tipo: tpl.tipo, nombre: tpl.nombre, notas: tpl.notas, url: tpl.url });
          }
        }
      }
      console.log('✅ Documentos de expediente creados para empleados');

      // ─── Turnos ───────────────────────────────────────────────────
      const shiftTemplates = [
        { name: 'Turno Mañana', startTime: '07:00', endTime: '15:00', days: '["LUN","MAR","MIE","JUE","VIE"]', toleranceMinutes: 15 },
        { name: 'Turno Tarde', startTime: '15:00', endTime: '23:00', days: '["LUN","MAR","MIE","JUE","VIE"]', toleranceMinutes: 15 },
        { name: 'Turno Fin de Semana', startTime: '10:00', endTime: '20:00', days: '["SAB","DOM"]', toleranceMinutes: 20 },
      ];
      const savedShifts: Record<string, any> = {};
      for (const st of shiftTemplates) {
        const existingShift = await hrShiftRepo.findOne({ where: { tenantId: demoTenant.id, name: st.name } });
        if (!existingShift) {
          const shift = await hrShiftRepo.save({ ...st, tenantId: demoTenant.id, isActive: true });
          savedShifts[st.name] = shift;
          console.log(`✅ Turno "${st.name}" creado`);
        } else {
          savedShifts[st.name] = existingShift;
        }
      }

      // ─── Asignar turnos a empleados ────────────────────────────────
      const shiftAssignments: Record<string, string> = {
        'Juan López': 'Turno Mañana',
        'María García': 'Turno Mañana',
        'Carlos Mendoza': 'Turno Tarde',
        'Ana Martínez': 'Turno Mañana',
        'Roberto Sánchez': 'Turno Fin de Semana',
        'Laura Torres': 'Turno Mañana',
      };
      for (const emp of savedEmps) {
        const shiftName = shiftAssignments[emp.nombre];
        const shift = shiftName ? savedShifts[shiftName] : undefined;
        if (shift && emp.shiftId !== shift.id) {
          await empRepo.update(emp.id, { shiftId: shift.id });
        }
      }
      console.log('✅ Turnos asignados a empleados');

      // ─── Asistencias últimos 5 días hábiles ────────────────────────
      const businessDays: string[] = [];
      const bdCursor = new Date();
      bdCursor.setHours(0, 0, 0, 0);
      bdCursor.setDate(bdCursor.getDate() - 1); // start from yesterday
      while (businessDays.length < 5) {
        const dow = bdCursor.getDay();
        if (dow !== 0 && dow !== 6) businessDays.push(bdCursor.toISOString().split('T')[0]);
        bdCursor.setDate(bdCursor.getDate() - 1);
      }

      // Fixed check-in times (minutes from midnight); status: PRESENTE if <= 7:15 (435)
      const checkInMins  = [6 * 60 + 52, 7 * 60 + 8,  6 * 60 + 55, 7 * 60 + 18, 7 * 60 + 3];
      const checkOutMins = [15 * 60 + 10, 15 * 60 + 25, 15 * 60 + 5, 15 * 60 + 30, 15 * 60 + 15];

      const attendanceEmps = savedEmps.filter(e =>
        ['Juan López', 'María García', 'Carlos Mendoza'].includes(e.nombre)
      );

      for (const emp of attendanceEmps) {
        for (let i = 0; i < 5; i++) {
          const dateStr = businessDays[i];
          const existingAtt = await attendanceRepo.findOne({
            where: { employeeId: emp.id, date: dateStr as any },
          });
          if (!existingAtt) {
            const dayBase = new Date(dateStr + 'T00:00:00');
            const ci = new Date(dayBase);
            ci.setHours(Math.floor(checkInMins[i] / 60), checkInMins[i] % 60, 0, 0);
            const co = new Date(dayBase);
            co.setHours(Math.floor(checkOutMins[i] / 60), checkOutMins[i] % 60, 0, 0);
            const status = checkInMins[i] <= 7 * 60 + 15 ? 'PRESENTE' : 'TARDANZA';
            await attendanceRepo.save({
              employeeId: emp.id,
              tenantId: demoTenant.id,
              branchId: sazonMatriz.id,
              date: dateStr as any,
              checkIn: ci,
              checkOut: co,
              method: 'WEB_GPS',
              status,
            });
          }
        }
      }
      console.log('✅ Asistencias de los últimos 5 días hábiles creadas');

      // ─── Solicitudes de vacaciones ─────────────────────────────────
      const juan   = savedEmps.find(e => e.nombre === 'Juan López');
      const carlos = savedEmps.find(e => e.nombre === 'Carlos Mendoza');
      const maria  = savedEmps.find(e => e.nombre === 'María García');

      if (juan) {
        const existsJuanVac = await vacationRepo.findOne({ where: { employeeId: juan.id, startDate: '2024-12-15' as any } });
        if (!existsJuanVac) {
          await vacationRepo.save({
            tenantId: demoTenant.id, employeeId: juan.id,
            startDate: '2024-12-15' as any, endDate: '2024-12-19' as any,
            daysRequested: 5, reason: 'Vacaciones de fin de año', status: 'PENDIENTE',
          });
          console.log('✅ Solicitud de vacaciones Juan López creada');
        }
      }

      if (carlos) {
        const existsCarlosVac = await vacationRepo.findOne({ where: { employeeId: carlos.id, startDate: '2025-01-20' as any } });
        if (!existsCarlosVac) {
          await vacationRepo.save({
            tenantId: demoTenant.id, employeeId: carlos.id,
            startDate: '2025-01-20' as any, endDate: '2025-01-24' as any,
            daysRequested: 5, reason: 'Vacaciones enero', status: 'APROBADA',
          });
          console.log('✅ Solicitud de vacaciones Carlos Mendoza creada');
        }
      }

      // ─── Solicitud de permiso María ─────────────────────────────────
      if (maria) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        const existsMariaPerm = await permissionRepo.findOne({ where: { employeeId: maria.id, date: tomorrowStr as any } });
        if (!existsMariaPerm) {
          await permissionRepo.save({
            tenantId: demoTenant.id, employeeId: maria.id,
            date: tomorrowStr as any, hours: 4, type: 'MEDICO',
            reason: 'Cita médica', status: 'PENDIENTE',
          });
          console.log('✅ Solicitud de permiso María García creada');
        }
      }

      console.log('✅ HR DEMO DATA completado: 6 empleados, 18 docs, 3 turnos, asistencias y solicitudes');
    }
  } catch (hrError: any) {
    console.log('⚠️ Error en HR demo data (entidades pueden no existir aún):', hrError.message);
  }

  // Resumen final del seed
  const totalCompanies = await companiesRepository.count({ where: { tenantId: testTenant.id } });
  const totalBranches = await branchesRepository.count();
  const totalBanks = await banksRepository.count();
  const totalMovements = await movementsRepository.count();
  const totalSuppliers = await suppliersRepository.count({ where: { tenantId: testTenant.id } });
  const totalFamilias = await familiasRepository.count();
  const totalInsumos = await insumosRepository.count();
  const totalRecipes = await recipesRepository.count();
  const totalProducts = await productsRepository.count();
  const totalPurchaseOrders = await purchaseOrdersRepository.count();
  const totalInvoices = await purchaseInvoicesRepository.count();
  const totalInventoryRecords = await inventoryRecordsRepository.count();

  console.log('═══════════════════════════════════════');
  console.log('✅ SEED COMPLETADO');
  console.log('═══════════════════════════════════════');
  console.log(`📊 Resumen de datos creados:`);
  console.log(`   - Tenant Demo: Grupo Empresarial Demo (BUSINESS)`);
  console.log(`   - Usuarios Demo: 4 (admin, gerente, cajero, contador)`);
  console.log(`   - Empresas: ${totalCompanies}`);
  console.log(`   - Sucursales: ${totalBranches}`);
  console.log(`   - Cuentas bancarias: ${totalBanks}`);
  console.log(`   - Movimientos: ${totalMovements}`);
  console.log(`   - Proveedores: ${totalSuppliers}`);
  console.log(`   - Familias de insumos: ${totalFamilias}`);
  console.log(`   - Insumos: ${totalInsumos}`);
  console.log(`   - Recetas: ${totalRecipes}`);
  console.log(`   - Productos POS: ${totalProducts}`);
  console.log(`   - Órdenes de compra: ${totalPurchaseOrders}`);
  console.log(`   - Facturas de compra: ${totalInvoices}`);
  console.log(`   - Registros de inventario: ${totalInventoryRecords}`);
  console.log('═══════════════════════════════════════');
}
