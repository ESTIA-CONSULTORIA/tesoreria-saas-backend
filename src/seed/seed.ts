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
  const familiasRepository = dataSource.getRepository('FamiliaInsumo');
  const insumosRepository = dataSource.getRepository('Insumo');
  const recipesRepository = dataSource.getRepository('Recipe');
  const posCategoriesRepository = dataSource.getRepository('PosCategory');
  const productsRepository = dataSource.getRepository('Product');

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

  // Crear usuario de prueba con rol ADMIN (administrador del cliente)
  const existingAdminUser = await usersRepository.findOne({ where: { email: 'admin@empresademo.com' } });
  
  if (!existingAdminUser) {
    // Buscar o crear rol ADMIN
    let adminRole = await rolesRepository.findOne({ where: { code: 'ADMIN' } });
    
    if (!adminRole) {
      adminRole = await rolesRepository.save({
        code: 'ADMIN',
        name: 'Administrador',
        description: 'Administrador del cliente (tenant)',
        isActive: true,
      });
    }

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

  // Resumen final del seed
  const totalCompanies = await companiesRepository.count({ where: { tenantId: testTenant.id } });
  const totalBranches = await branchesRepository.count();
  const totalBanks = await banksRepository.count();
  const totalMovements = await movementsRepository.count();
  const totalSuppliers = await suppliersRepository.count({ where: { tenantId: testTenant.id } });
  const totalFamilias = await familiasRepository.count();

  console.log('═══════════════════════════════════════');
  console.log('✅ SEED COMPLETADO');
  console.log('═══════════════════════════════════════');
  console.log(`📊 Resumen de datos creados:`);
  console.log(`   - Empresas: ${totalCompanies}`);
  console.log(`   - Sucursales: ${totalBranches}`);
  console.log(`   - Cuentas bancarias: ${totalBanks}`);
  console.log(`   - Movimientos: ${totalMovements}`);
  console.log(`   - Proveedores: ${totalSuppliers}`);
  console.log(`   - Familias de insumos: ${totalFamilias}`);
  console.log('═══════════════════════════════════════');
}
