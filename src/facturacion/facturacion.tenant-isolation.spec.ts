import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { FacturacionService } from './facturacion.service';
import { FacturacionController } from './facturacion.controller';
import { EmisorFiscal } from './entities/emisor-fiscal.entity';
import { SucursalFiscal } from './entities/sucursal-fiscal.entity';
import { ProductoFiscal } from './entities/producto-fiscal.entity';
import { ReceptorFiscal } from './entities/receptor-fiscal.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../pos/entities/product.entity';
import { ROLES_KEY } from '../auth/roles.decorator';

const A = 'tenant-A';
const B = 'tenant-B';

// Repos en memoria con filtro por los campos del `where`: si el servicio olvida acotar por tenant, el test lo ve.
function repoMemoria<T extends { id?: string } = any>(filas: T[]) {
  const coincide = (f: any, where: any) => Object.entries(where).every(([k, v]) => f[k] === v);
  let seq = 0;
  return {
    filas,
    findOne: jest.fn(async ({ where }: any) => filas.find((f) => coincide(f, where)) ?? null),
    find: jest.fn(async ({ where }: any) => filas.filter((f) => coincide(f, where))),
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => {
      const fila = d.id ? filas.find((f) => f.id === d.id) : undefined;
      if (fila) return Object.assign(fila, d);
      const nueva = { ...d, id: d.id ?? `id-${++seq}` };
      filas.push(nueva);
      return nueva;
    }),
    delete: jest.fn(async (where: any) => {
      const i = filas.findIndex((f) => coincide(f, where));
      if (i >= 0) filas.splice(i, 1);
    }),
  };
}

describe('Facturación F0 — aislamiento por tenant', () => {
  let service: FacturacionService;
  let emisores: ReturnType<typeof repoMemoria<any>>;
  let sucursales: ReturnType<typeof repoMemoria<any>>;
  let productos: ReturnType<typeof repoMemoria<any>>;
  let receptores: ReturnType<typeof repoMemoria<any>>;

  beforeEach(async () => {
    emisores = repoMemoria([]);
    sucursales = repoMemoria([]);
    productos = repoMemoria([]);
    receptores = repoMemoria([]);
    const companies = repoMemoria<any>([
      { id: 'co-A', tenantId: A },
      { id: 'co-B', tenantId: B },
    ]);
    const branches = repoMemoria<any>([
      { id: 'br-A', companyId: 'co-A' },
      { id: 'br-B', companyId: 'co-B' },
    ]);
    const products = repoMemoria<any>([
      { id: 'pr-A', tenantId: A },
      { id: 'pr-B', tenantId: B },
    ]);
    const mod = await Test.createTestingModule({
      providers: [
        FacturacionService,
        { provide: getRepositoryToken(EmisorFiscal), useValue: emisores },
        { provide: getRepositoryToken(SucursalFiscal), useValue: sucursales },
        { provide: getRepositoryToken(ProductoFiscal), useValue: productos },
        { provide: getRepositoryToken(ReceptorFiscal), useValue: receptores },
        { provide: getRepositoryToken(Company), useValue: companies },
        { provide: getRepositoryToken(Branch), useValue: branches },
        { provide: getRepositoryToken(Product), useValue: products },
      ],
    }).compile();
    service = mod.get(FacturacionService);
  });

  const emisorOk = { rfc: 'EKU9003173C9', nombreFiscal: 'ESCUELA KEMPER URGATE', regimenFiscal: '601', serie: 'a' };
  const productoOk = { claveProdServ: '90101500', claveUnidad: 'H87', objetoImp: '02' };
  const receptorOk = { rfc: 'XIQB891116QE4', nombreFiscal: 'JUAN PEREZ', codigoPostal: '06600', regimenFiscal: '612', usoCfdiDefault: 'G03', email: 'J@X.com' };

  it('emisor: el tenant A no lee ni escribe la empresa de B (404) y no se crea nada', async () => {
    await expect(service.obtenerEmisor(A, 'co-B')).rejects.toThrow('Empresa no encontrada');
    await expect(service.guardarEmisor(A, 'co-B', emisorOk)).rejects.toThrow('Empresa no encontrada');
    expect(emisores.filas).toHaveLength(0);
  });

  it('emisor: guarda normalizado (serie en mayúsculas) y por defecto NO activa la facturación', async () => {
    const e = await service.guardarEmisor(A, 'co-A', emisorOk);
    expect(e).toMatchObject({ tenantId: A, companyId: 'co-A', serie: 'A', facturacionActiva: false });
    expect(await service.obtenerEmisor(A, 'co-A')).toMatchObject({ rfc: 'EKU9003173C9' });
    await service.guardarEmisor(A, 'co-A', { nombreFiscal: 'NUEVO NOMBRE' }); // actualiza sin duplicar
    expect(emisores.filas).toHaveLength(1);
    expect(emisores.filas[0]).toMatchObject({ nombreFiscal: 'NUEVO NOMBRE', rfc: 'EKU9003173C9' });
  });

  it('emisor: rechaza RFC inválido, genérico, régimen inexistente y serie con símbolos', async () => {
    await expect(service.guardarEmisor(A, 'co-A', { ...emisorOk, rfc: 'EKU9003173C8' })).rejects.toThrow('dígito verificador');
    await expect(service.guardarEmisor(A, 'co-A', { ...emisorOk, rfc: 'XAXX010101000' })).rejects.toThrow('genérico');
    await expect(service.guardarEmisor(A, 'co-A', { ...emisorOk, regimenFiscal: '999' })).rejects.toThrow('Régimen');
    await expect(service.guardarEmisor(A, 'co-A', { ...emisorOk, serie: 'A-1!' })).rejects.toThrow('serie');
    expect(emisores.filas).toHaveLength(0);
  });

  it('sucursal: la de otro tenant responde 404 (se resuelve por la empresa) y valida el CP', async () => {
    await expect(service.obtenerSucursal(A, 'br-B')).rejects.toThrow('Sucursal no encontrada');
    await expect(service.guardarSucursal(A, 'br-B', '06600')).rejects.toThrow('Sucursal no encontrada');
    await expect(service.guardarSucursal(A, 'br-A', '6600')).rejects.toThrow('5 dígitos');
    expect(await service.guardarSucursal(A, 'br-A', '06600')).toMatchObject({ tenantId: A, branchId: 'br-A', codigoPostalExpedicion: '06600' });
    expect(sucursales.filas).toHaveLength(1);
  });

  it('producto: el de otro tenant responde 404; valida claves SAT', async () => {
    await expect(service.obtenerProducto(A, 'pr-B')).rejects.toThrow('Producto no encontrado');
    await expect(service.guardarProducto(A, 'pr-B', productoOk)).rejects.toThrow('Producto no encontrado');
    await expect(service.guardarProducto(A, 'pr-A', { ...productoOk, claveProdServ: '123' })).rejects.toThrow('8 dígitos');
    await expect(service.guardarProducto(A, 'pr-A', { ...productoOk, claveUnidad: 'h87' })).resolves.toMatchObject({ claveUnidad: 'H87' });
    await expect(service.guardarProducto(A, 'pr-A', { ...productoOk, objetoImp: '09' })).rejects.toThrow('Objeto de impuesto');
    expect(productos.filas).toHaveLength(1);
    expect(productos.filas[0]).toMatchObject({ tenantId: A, productId: 'pr-A' });
  });

  it('receptor: listado, lectura, edición y baja solo dentro del propio tenant', async () => {
    const deB = await service.crearReceptor(B, receptorOk);
    expect(await service.listarReceptores(A)).toEqual([]);
    expect(await service.listarReceptores(B)).toHaveLength(1);
    await expect(service.obtenerReceptor(A, deB.id)).rejects.toThrow('Receptor no encontrado');
    await expect(service.actualizarReceptor(A, deB.id, { nombreFiscal: 'HACKEADO' })).rejects.toThrow('Receptor no encontrado');
    await expect(service.eliminarReceptor(A, deB.id)).rejects.toThrow('Receptor no encontrado');
    expect(receptores.filas[0].nombreFiscal).toBe('JUAN PEREZ');
  });

  it('receptor: el mismo RFC+CP puede existir en dos tenants, pero no duplicarse dentro de uno', async () => {
    await service.crearReceptor(A, receptorOk);
    await expect(service.crearReceptor(B, receptorOk)).resolves.toBeDefined();
    await expect(service.crearReceptor(A, receptorOk)).rejects.toThrow('Ya existe');
  });

  it('receptor: normaliza, valida y fija esExtranjero con el RFC genérico extranjero', async () => {
    const r = await service.crearReceptor(A, receptorOk);
    expect(r).toMatchObject({ email: 'j@x.com', usoCfdiDefault: 'G03', esExtranjero: false });
    const ext = await service.crearReceptor(A, { ...receptorOk, rfc: 'XEXX010101000' });
    expect(ext.esExtranjero).toBe(true);
    await expect(service.crearReceptor(A, { ...receptorOk, rfc: 'BAD' })).rejects.toThrow('RFC');
    await expect(service.crearReceptor(A, { ...receptorOk, rfc: 'EKU9003173C9', usoCfdiDefault: 'ZZZ' })).rejects.toThrow('Uso de CFDI');
    await expect(service.crearReceptor(A, { ...receptorOk, rfc: 'EKU9003173C9', email: 'no-es-correo' })).rejects.toThrow('Correo');
  });

  it('receptor: cambiar un dato fiscal borra la validación previa del PAC', async () => {
    const r = await service.crearReceptor(A, receptorOk);
    receptores.filas[0].validadoEn = new Date();
    const mismo = await service.actualizarReceptor(A, r.id, { email: 'otro@x.com' });
    expect(mismo.validadoEn).not.toBeNull();
    const cambiado = await service.actualizarReceptor(A, r.id, { codigoPostal: '03100' });
    expect(cambiado.validadoEn).toBeNull();
  });
});

describe('FacturacionController — tenant del token y roles', () => {
  const service = { obtenerEmisor: jest.fn().mockResolvedValue(null), crearReceptor: jest.fn().mockResolvedValue({}) } as any;
  const controller = new FacturacionController(service);

  it('usa el tenant del token y nunca uno del body', async () => {
    await controller.crearReceptor({ tenantId: B, rfc: 'X' } as any, { user: { tenantId: A, roleCode: 'ADMIN' } });
    expect(service.crearReceptor).toHaveBeenCalledWith(A, expect.objectContaining({ rfc: 'X' }));
  });

  it('sin tenant en la sesión (p. ej. SOPORTE) no opera: 403', () => {
    expect(() => controller.emisor('co-A', { user: { roleCode: 'SOPORTE' } })).toThrow(ForbiddenException);
    expect(() => controller.emisor('co-A', { user: {} })).toThrow(ForbiddenException);
    expect(() => controller.emisor('co-A', {})).toThrow(ForbiddenException);
  });

  it('el controlador exige ADMIN o GERENTE (cajero y mesero no)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, FacturacionController) as string[];
    expect(roles).toEqual(['ADMIN', 'GERENTE']);
  });
});
