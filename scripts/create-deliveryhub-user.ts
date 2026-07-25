import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../src/data-source';

const EMAIL = 'deliveryhub@service.estia';

async function main() {
  await AppDataSource.initialize();

  const usersRepository = AppDataSource.getRepository('User');
  const rolesRepository = AppDataSource.getRepository('Role');

  const existing = await usersRepository.findOne({ where: { email: EMAIL } });
  if (existing) {
    console.log(`⚠️ El usuario ${EMAIL} ya existe (id: ${existing.id}). No se creó ni modificó nada.`);
    await AppDataSource.destroy();
    return;
  }

  let soporteRole = await rolesRepository.findOne({ where: { code: 'SOPORTE' } });
  if (!soporteRole) {
    soporteRole = await rolesRepository.save({
      code: 'SOPORTE',
      name: 'Soporte',
      description: 'Acceso total al sistema (proveedor del sistema)',
      isActive: true,
    });
  }

  const plainPassword = crypto.randomBytes(18).toString('base64url');
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const user = await usersRepository.save({
    email: EMAIL,
    password: hashedPassword,
    name: 'DeliveryHub Service',
    roleId: soporteRole.id,
    roleCode: 'SOPORTE',
    tenantId: null,
    isActive: true,
  });

  console.log(`✅ Usuario ${EMAIL} creado (id: ${user.id}, roleCode: SOPORTE, tenantId: null)`);
  console.log('🔑 Password (guárdala ahora, no se volverá a mostrar):');
  console.log(plainPassword);

  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error('❌ Error creando el usuario:', err);
  await AppDataSource.destroy().catch(() => {});
  process.exit(1);
});
