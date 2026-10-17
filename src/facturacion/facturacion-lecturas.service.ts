import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../pos/entities/product.entity';
import { PosCategory } from '../pos/entities/category.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { GIRO_LABELS, DEFAULT_GIRO, isValidGiro } from '../config/giros.config';
import { EmisorFiscal } from './entities/emisor-fiscal.entity';
import { SucursalFiscal } from './entities/sucursal-fiscal.entity';
import { ProductoFiscal } from './entities/producto-fiscal.entity';
import { OBJETOS_IMPUESTO } from './sat-catalogos';
import { esClaveProdServ, esClaveUnidad } from './fiscal-validators';

export const PRODUCTOS_POR_PAGINA = 15;
export const MAX_LOTE = 200;
export type EstadoProductos = 'TODOS' | 'PENDIENTES' | 'COMPLETOS';

export interface FiltroProductos {
  q?: string;
  categoria?: string;
  estado?: string;
  page?: string | number;
}
export interface LoteInput {
  productIds?: string[];
  claveProdServ?: string;
  claveUnidad?: string;
  unidadNombre?: string | null;
  objetoImp?: string;
}

const limpiar = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nombreEmpresa = (c: Company) => c.tradeName || c.legalName || 'Empresa sin nombre';
const escaparLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

// Lecturas de la pantalla "Datos fiscales" (DISENO-DATOS-FISCALES.md §8): nombres en vez de ids, listas paginadas y trabajo por
// lote. Todas acotadas al tenant del token (lo decide el controller); no cambian tablas.
@Injectable()
export class FacturacionLecturasService {
  constructor(
    @InjectRepository(EmisorFiscal) private emisores: Repository<EmisorFiscal>,
    @InjectRepository(SucursalFiscal) private sucursales: Repository<SucursalFiscal>,
    @InjectRepository(ProductoFiscal) private productosFiscales: Repository<ProductoFiscal>,
    @InjectRepository(Company) private companies: Repository<Company>,
    @InjectRepository(Branch) private branches: Repository<Branch>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
  ) {}

  /** Productos activos del negocio (compartidos entre sucursales incluidos), con su fila fiscal si la tiene. */
  private productosBase(tenantId: string) {
    return this.products
      .createQueryBuilder('p')
      .leftJoin(PosCategory, 'c', 'CAST(c.id AS text) = CAST(p.categoryId AS text)')
      .leftJoin(ProductoFiscal, 'f', 'f.productId = CAST(p.id AS text) AND f.tenantId = p.tenantId')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.isActive = true');
  }

  // ── 1. resumen ──
  async resumen(tenantId: string) {
    const empresas = await this.companies.find({ where: { tenantId } });
    const ids = empresas.map((c) => c.id);
    const [emisores, sucursales, ramas, totalProductos, conClaves] = await Promise.all([
      this.emisores.find({ where: { tenantId } }),
      this.sucursales.find({ where: { tenantId } }),
      ids.length ? this.branches.find({ where: { companyId: In(ids) } }) : Promise.resolve([] as Branch[]),
      this.productosBase(tenantId).getCount(),
      this.productosBase(tenantId).andWhere('f.id IS NOT NULL').getCount(),
    ]);
    const conCp = new Set(sucursales.map((s) => s.branchId));
    return {
      empresas: empresas.map((c) => {
        const activas = ramas.filter((b) => b.companyId === c.id && b.isActive !== false);
        const e = emisores.find((x) => x.companyId === c.id);
        return {
          companyId: c.id,
          empresa: nombreEmpresa(c),
          emisorCompleto: !!e,
          facturacionActiva: !!e?.facturacionActiva,
          sucursalesTotal: activas.length,
          sucursalesConCp: activas.filter((b) => conCp.has(b.id)).length,
        };
      }),
      productos: { total: totalProductos, conClaves, pendientes: totalProductos - conClaves },
    };
  }

  // ── 2. sucursales ──
  async listarSucursales(tenantId: string) {
    const empresas = await this.companies.find({ where: { tenantId } });
    if (!empresas.length) return [];
    const ramas = await this.branches.find({ where: { companyId: In(empresas.map((c) => c.id)) } });
    const fiscales = await this.sucursales.find({ where: { tenantId } });
    return ramas
      .filter((b) => b.isActive !== false)
      .map((b) => {
        const cp = fiscales.find((s) => s.branchId === b.id)?.codigoPostalExpedicion ?? null;
        const empresa = empresas.find((c) => c.id === b.companyId)!;
        return { branchId: b.id, sucursal: b.name || 'Sucursal sin nombre', companyId: empresa.id, empresa: nombreEmpresa(empresa), codigoPostalExpedicion: cp, completo: !!cp };
      })
      .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.sucursal.localeCompare(b.sucursal));
  }

  // ── 3. productos paginados ──
  async listarProductos(tenantId: string, filtro: FiltroProductos) {
    const pagina = Math.max(1, Math.floor(Number(filtro.page) || 1));
    const estado = String(filtro.estado ?? 'TODOS').toUpperCase() as EstadoProductos;
    const qb = this.productosBase(tenantId);
    const q = limpiar(filtro.q);
    // El escape por defecto de LIKE en Postgres ya es la barra invertida: no hace falta ESCAPE.
    if (q) qb.andWhere('p.name ILIKE :q', { q: `%${escaparLike(q)}%` });
    const categoria = limpiar(filtro.categoria);
    if (categoria === 'SIN_CATEGORIA') qb.andWhere('p.categoryId IS NULL');
    else if (categoria) qb.andWhere('p.categoryId = :categoria', { categoria });
    if (estado === 'PENDIENTES') qb.andWhere('f.id IS NULL');
    else if (estado === 'COMPLETOS') qb.andWhere('f.id IS NOT NULL');

    const total = await qb.clone().getCount();
    const filas = await qb
      .clone()
      .select('p.id', 'id')
      .addSelect('p.name', 'producto')
      .addSelect('c.name', 'categoria')
      .addSelect('p.tasaIva', 'tasaIva')
      .addSelect('p.esServicio', 'esServicio')
      .addSelect('f.claveProdServ', 'claveProdServ')
      .addSelect('f.claveUnidad', 'claveUnidad')
      .addSelect('f.unidadNombre', 'unidadNombre')
      .addSelect('f.objetoImp', 'objetoImp')
      .orderBy('p.name', 'ASC')
      .addOrderBy('p.id', 'ASC')
      .offset((pagina - 1) * PRODUCTOS_POR_PAGINA)
      .limit(PRODUCTOS_POR_PAGINA)
      .getRawMany();
    return {
      page: pagina,
      porPagina: PRODUCTOS_POR_PAGINA,
      total,
      paginas: Math.max(1, Math.ceil(total / PRODUCTOS_POR_PAGINA)),
      items: filas.map((r) => ({
        productId: r.id as string,
        producto: (r.producto as string) || 'Producto sin nombre',
        categoria: (r.categoria as string | null) ?? 'Sin categoría',
        tasaIva: (r.tasaIva as string | null) ?? null,
        esServicio: !!r.esServicio,
        claveProdServ: (r.claveProdServ as string | null) ?? null,
        claveUnidad: (r.claveUnidad as string | null) ?? null,
        unidadNombre: (r.unidadNombre as string | null) ?? null,
        objetoImp: (r.objetoImp as string | null) ?? null,
        completo: !!r.claveProdServ,
      })),
    };
  }

  // ── 4. lote ──
  async guardarLote(tenantId: string, input: LoteInput) {
    const ids = Array.from(new Set((input.productIds ?? []).map((x) => limpiar(x)).filter(Boolean)));
    if (!ids.length) throw new BadRequestException('Marca al menos un producto.');
    if (ids.length > MAX_LOTE) throw new BadRequestException(`Máximo ${MAX_LOTE} productos por lote.`);
    const claveProdServ = limpiar(input.claveProdServ);
    const claveUnidad = limpiar(input.claveUnidad).toUpperCase();
    const objetoImp = limpiar(input.objetoImp);
    const unidadNombre = input.unidadNombre ? limpiar(input.unidadNombre) : null;
    if (!esClaveProdServ(claveProdServ)) throw new BadRequestException('La clave de producto/servicio SAT debe tener 8 dígitos.');
    if (!esClaveUnidad(claveUnidad)) throw new BadRequestException('Clave de unidad SAT inválida (2 o 3 letras/números, p. ej. H87).');
    if (!OBJETOS_IMPUESTO[objetoImp]) throw new BadRequestException('Objeto de impuesto inválido (01, 02, 03 o 04).');
    if (unidadNombre && unidadNombre.length > 40) throw new BadRequestException('El nombre de la unidad admite máx. 40 caracteres.');

    // Todo o nada: si UN id no es del tenant no se cambia ninguno (y no se dice cuál, para no confirmar ids ajenos).
    const propios = await this.products.find({ where: { id: In(ids), tenantId } });
    if (propios.length !== ids.length) throw new NotFoundException('Algún producto no se encontró');
    const previos = await this.productosFiscales.find({ where: { tenantId, productId: In(ids) } });
    const filas = ids.map((productId) => {
      const previo = previos.find((f) => f.productId === productId);
      return this.productosFiscales.create({ ...(previo ?? {}), tenantId, productId, claveProdServ, claveUnidad, objetoImp, unidadNombre });
    });
    await this.productosFiscales.save(filas);
    return { cambiados: filas.length };
  }

  // ── 5. sugerencias ──
  async sugerencias(tenantId: string) {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    const giro = tenant?.giro && isValidGiro(tenant.giro) ? tenant.giro : DEFAULT_GIRO;
    const filas = await this.productosBase(tenantId)
      .andWhere('f.id IS NULL')
      .select('p.categoryId', 'categoriaId')
      .addSelect('c.name', 'categoria')
      .addSelect('COUNT(p.id)', 'productos')
      .addSelect('SUM(CASE WHEN p.esServicio THEN 1 ELSE 0 END)', 'servicios')
      .groupBy('p.categoryId')
      .addGroupBy('c.name')
      .orderBy('c.name', 'ASC')
      .getRawMany();
    return {
      giro,
      giroNombre: GIRO_LABELS[giro],
      // Las claves de producto/servicio (8 dígitos) NO se sugieren: las entrega el contador (P-04 / D-12). [VALIDAR]
      clavesConfirmadas: false,
      nota: 'Las claves de producto/servicio las entrega tu contador. Aquí solo se sugieren unidad y objeto de impuesto.',
      categorias: filas.map((r) => {
        const productos = Number(r.productos);
        const todosServicios = productos > 0 && Number(r.servicios) === productos;
        const servicio = giro === 'gimnasio' || todosServicios;
        return {
          categoriaId: (r.categoriaId as string | null) ?? null,
          categoria: (r.categoria as string | null) ?? 'Sin categoría',
          productosPendientes: productos,
          claveProdServ: null as string | null,
          claveUnidad: servicio ? 'E48' : 'H87',
          unidadNombre: servicio ? 'Servicio' : 'Pieza',
          objetoImp: '02',
        };
      }),
    };
  }
}
