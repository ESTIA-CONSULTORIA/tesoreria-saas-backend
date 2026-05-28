import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

export async function seedDatabase(dataSource: DataSource) {
  const usersRepository = dataSource.getRepository('User');
  const rolesRepository = dataSource.getRepository('Role');

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
}
