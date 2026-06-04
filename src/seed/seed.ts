import { DataSource, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';

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
    { email: 'admin@demo.com', password: 'Admin123', name: 'Administrador Demo', role: adminRole, roleCode: 'ADMIN' },
    { email: 'gerente@demo.com', password: 'Admin123', name: 'Gerente Demo', role: gerenteRole, roleCode: 'GERENTE' },
    { email: 'cajero@demo.com', password: 'Admin123', name: 'Cajero Demo', role: cajeroRole, roleCode: 'CAJERO' },
    { email: 'contador@demo.com', password: 'Admin123', name: 'Contador Demo', role: contadorRole, roleCode: 'CONTADOR' },
  ];

  for (const userData of demoUsers) {
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
        isActive: true,
      });
      console.log(`✅ Usuario ${userData.email} (${userData.roleCode}) creado`);
    }
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
  
  if (existingProducts.length === 0) {
    const productsData = [
      // Productos preparados (vinculados a recetas)
      { name: 'Hamburguesa Clásica', categoryId: categoriaComida?.id, price: 120, type: 'PREPARADO', recipeId: recetaHamburguesa?.id, isActive: true },
      { name: 'Hot Dog', categoryId: categoriaComida?.id, price: 65, type: 'PREPARADO', recipeId: recetaHotDog?.id, isActive: true },
      { name: 'Pizza Personal', categoryId: categoriaComida?.id, price: 150, type: 'PREPARADO', recipeId: recetaPizza?.id, isActive: true },
      
      // Productos simples (vinculados a insumos)
      { name: 'Refresco', categoryId: categoriaBebidas?.id, price: 25, type: 'SIMPLE', insumoId: insumoRefresco?.id, isActive: true },
      { name: 'Agua', categoryId: categoriaBebidas?.id, price: 15, type: 'SIMPLE', insumoId: insumoAgua?.id, isActive: true },
      { name: 'Cerveza', categoryId: categoriaBebidas?.id, price: 45, type: 'SIMPLE', insumoId: insumoCerveza?.id, isActive: true },
      { name: 'Jugo Natural', categoryId: categoriaBebidas?.id, price: 35, type: 'SIMPLE', insumoId: insumoJugo?.id, isActive: true },
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
    { name: 'Pollo a la Plancha', categoryId: categoriaPlatillos?.id, price: 145, type: 'PREPARADO', recipeId: recetaPollo?.id, isActive: true },
    { name: 'Camarones al Ajillo', categoryId: categoriaPlatillos?.id, price: 195, type: 'PREPARADO', recipeId: recetaCamarones?.id, isActive: true },
    { name: 'Arroz con Frijoles', categoryId: categoriaPlatillos?.id, price: 45, type: 'PREPARADO', recipeId: recetaArrozFrijoles?.id, isActive: true },
    { name: 'Tacos de Pollo', categoryId: categoriaPlatillos?.id, price: 85, type: 'PREPARADO', recipeId: recetaTacosPollo?.id, isActive: true },
    { name: 'Orden de Limón', categoryId: categoriaExtras?.id, price: 10, type: 'SIMPLE', insumoId: limon?.id, isActive: true },
    { name: 'Porción Extra', categoryId: categoriaExtras?.id, price: 25, type: 'SIMPLE', isActive: true },
  ];

  for (const productData of productosAdicionales) {
    const existingProduct = await productsRepository.findOne({ where: { name: productData.name } });
    if (!existingProduct) {
      await productsRepository.save(productData);
      console.log(`✅ Producto POS "${productData.name}" creado`);
    }
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
      const amount = Math.floor(Math.random() * 24500) + 500; // $500 - $25,000
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 90)); // Últimos 3 meses

      await movementsRepository.save({
        accountId: bankBBVA?.id,
        type: 'INCOME',
        category: 'SALE',
        concept: incomeConcepts[Math.floor(Math.random() * incomeConcepts.length)],
        reference: `FAC-${String(i + 100).padStart(4, '0')}`,
        amount: amount,
        date: date,
      });
    }

    // 20 egresos por gastos operativos
    const expenseConcepts = [
      'Pago de nómina', 'Renta de local', 'Servicios de luz', 'Servicios de agua',
      'Servicios de gas', 'Servicios de internet', 'Compra de insumos', 'Mantenimiento',
      'Limpieza', 'Seguros', 'Publicidad', 'Transporte', 'Equipo de cocina',
      'Vajilla', 'Uniformes', 'Licencias', 'Impuestos', 'Asesoría', 'Reparaciones', 'Otros'
    ];

    for (let i = 0; i < 20; i++) {
      const amount = Math.floor(Math.random() * 24500) + 500;
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 90));

      await movementsRepository.save({
        accountId: bankBanorte?.id || bankBBVA?.id,
        type: 'EXPENSE',
        category: 'OPERATIONAL',
        concept: expenseConcepts[i],
        reference: `GAS-${String(i + 100).padStart(4, '0')}`,
        amount: amount,
        date: date,
      });
    }

    // 5 transferencias entre cuentas
    for (let i = 0; i < 5; i++) {
      const amount = Math.floor(Math.random() * 10000) + 1000;
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 60));

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
  const productsWithoutTenant = await productsRepository.find({ where: [{ tenantId: IsNull() }, { tenantId: '' }] });
  if (productsWithoutTenant.length > 0) {
    for (const product of productsWithoutTenant) {
      await productsRepository.update(product.id, {
        tenantId: demoTenant.id,
      });
    }
    console.log(`✅ ${productsWithoutTenant.length} productos POS actualizados con tenantId`);
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
