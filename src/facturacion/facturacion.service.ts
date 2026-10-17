import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Product } from '../pos/entities/product.entity';
import { EmisorFiscal } from './entities/emisor-fiscal.entity';
import { SucursalFiscal } from './entities/sucursal-fiscal.entity';
import { ProductoFiscal } from './entities/producto-fiscal.entity';
import { ReceptorFiscal } from './entities/receptor-fiscal.entity';
import { OBJETOS_IMPUESTO, REGIMENES_FISCALES, USOS_CFDI } from './sat-catalogos';
import { esClaveProdServ, esClaveUnidad, esCodigoPostal, esEmail, esSerie, validarRfc } from './fiscal-validators';

export interface EmisorInput {
  rfc?: string;
  nombreFiscal?: string;
  regimenFiscal?: string;
  serie?: string | null;
  facturacionActiva?: boolean;
}
export interface ProductoFiscalInput {
  claveProdServ?: string;
  claveUnidad?: string;
  unidadNombre?: string | null;
  objetoImp?: string;
}
export interface ReceptorInput {
  rfc?: string;
  nombreFiscal?: string;
  codigoPostal?: string;
  regimenFiscal?: string;
  usoCfdiDefault?: string | null;
  email?: string | null;
  esExtranjero?: boolean;
}

const limpiar = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

// Datos fiscales de F0 (emisor, sucursal, producto, receptor). El tenant SIEMPRE llega del token (lo decide el controller): toda
// lectura y escritura se acota a él, y el id de una empresa/sucursal/producto/receptor de otro negocio responde 404.
@Injectable()
export class FacturacionService {
  constructor(
    @InjectRepository(EmisorFiscal) private emisores: Repository<EmisorFiscal>,
    @InjectRepository(SucursalFiscal) private sucursales: Repository<SucursalFiscal>,
    @InjectRepository(ProductoFiscal) private productos: Repository<ProductoFiscal>,
    @InjectRepository(ReceptorFiscal) private receptores: Repository<ReceptorFiscal>,
    @InjectRepository(Company) private companies: Repository<Company>,
    @InjectRepository(Branch) private branches: Repository<Branch>,
    @InjectRepository(Product) private products: Repository<Product>,
  ) {}

  catalogos() {
    return { regimenesFiscales: REGIMENES_FISCALES, usosCfdi: USOS_CFDI, objetosImpuesto: OBJETOS_IMPUESTO };
  }

  // ── pertenencia al tenant ──
  private async empresaDelTenant(tenantId: string, companyId: string): Promise<Company> {
    const c = await this.companies.findOne({ where: { id: companyId, tenantId } });
    if (!c) throw new NotFoundException('Empresa no encontrada');
    return c;
  }

  private async sucursalDelTenant(tenantId: string, branchId: string): Promise<Branch> {
    const b = await this.branches.findOne({ where: { id: branchId } });
    if (!b) throw new NotFoundException('Sucursal no encontrada');
    // Branch no tiene tenantId: el dueño es el de su empresa.
    const c = await this.companies.findOne({ where: { id: b.companyId, tenantId } });
    if (!c) throw new NotFoundException('Sucursal no encontrada');
    return b;
  }

  private async productoDelTenant(tenantId: string, productId: string): Promise<Product> {
    const p = await this.products.findOne({ where: { id: productId, tenantId } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  // ── emisor (por empresa) ──
  async obtenerEmisor(tenantId: string, companyId: string) {
    await this.empresaDelTenant(tenantId, companyId);
    return (await this.emisores.findOne({ where: { tenantId, companyId } })) ?? null;
  }

  async guardarEmisor(tenantId: string, companyId: string, input: EmisorInput) {
    await this.empresaDelTenant(tenantId, companyId);
    const previo = await this.emisores.findOne({ where: { tenantId, companyId } });

    const rfc = limpiar(input.rfc ?? previo?.rfc).toUpperCase();
    const nombreFiscal = limpiar(input.nombreFiscal ?? previo?.nombreFiscal);
    const regimenFiscal = limpiar(input.regimenFiscal ?? previo?.regimenFiscal);
    const serie = input.serie === undefined ? (previo?.serie ?? null) : input.serie ? limpiar(input.serie).toUpperCase() : null;

    const r = validarRfc(rfc);
    if (!r.ok) throw new BadRequestException(r.motivo);
    if (r.tipo === 'GENERICO_NACIONAL' || r.tipo === 'GENERICO_EXTRANJERO') {
      throw new BadRequestException('El emisor no puede usar un RFC genérico.');
    }
    if (!nombreFiscal || nombreFiscal.length > 254) throw new BadRequestException('El nombre fiscal es obligatorio (máx. 254 caracteres).');
    if (!REGIMENES_FISCALES[regimenFiscal]) throw new BadRequestException('Régimen fiscal inválido.');
    if (serie !== null && !esSerie(serie)) throw new BadRequestException('La serie solo admite letras y números (máx. 25).');
    const activa = input.facturacionActiva ?? previo?.facturacionActiva ?? false;

    const fila = this.emisores.create({
      ...(previo ?? {}),
      tenantId,
      companyId,
      rfc,
      nombreFiscal,
      regimenFiscal,
      serie,
      facturacionActiva: activa,
    });
    return this.emisores.save(fila);
  }

  // ── sucursal (lugar de expedición) ──
  async obtenerSucursal(tenantId: string, branchId: string) {
    await this.sucursalDelTenant(tenantId, branchId);
    return (await this.sucursales.findOne({ where: { tenantId, branchId } })) ?? null;
  }

  async guardarSucursal(tenantId: string, branchId: string, codigoPostalExpedicion: unknown) {
    await this.sucursalDelTenant(tenantId, branchId);
    if (!esCodigoPostal(codigoPostalExpedicion)) throw new BadRequestException('El código postal debe ser de 5 dígitos.');
    const previo = await this.sucursales.findOne({ where: { tenantId, branchId } });
    return this.sucursales.save(this.sucursales.create({ ...(previo ?? {}), tenantId, branchId, codigoPostalExpedicion }));
  }

  // ── producto (claves SAT) ──
  async obtenerProducto(tenantId: string, productId: string) {
    await this.productoDelTenant(tenantId, productId);
    return (await this.productos.findOne({ where: { tenantId, productId } })) ?? null;
  }

  async guardarProducto(tenantId: string, productId: string, input: ProductoFiscalInput) {
    await this.productoDelTenant(tenantId, productId);
    const previo = await this.productos.findOne({ where: { tenantId, productId } });

    const claveProdServ = limpiar(input.claveProdServ ?? previo?.claveProdServ);
    const claveUnidad = limpiar(input.claveUnidad ?? previo?.claveUnidad).toUpperCase();
    const objetoImp = limpiar(input.objetoImp ?? previo?.objetoImp);
    const unidadNombre = input.unidadNombre === undefined ? (previo?.unidadNombre ?? null) : input.unidadNombre ? limpiar(input.unidadNombre) : null;

    if (!esClaveProdServ(claveProdServ)) throw new BadRequestException('La clave de producto/servicio SAT debe tener 8 dígitos.');
    if (!esClaveUnidad(claveUnidad)) throw new BadRequestException('Clave de unidad SAT inválida (2 o 3 letras/números, p. ej. H87).');
    if (!OBJETOS_IMPUESTO[objetoImp]) throw new BadRequestException('Objeto de impuesto inválido (01, 02, 03 o 04).');
    if (unidadNombre && unidadNombre.length > 40) throw new BadRequestException('El nombre de la unidad admite máx. 40 caracteres.');

    return this.productos.save(
      this.productos.create({ ...(previo ?? {}), tenantId, productId, claveProdServ, claveUnidad, objetoImp, unidadNombre }),
    );
  }

  // ── receptor ──
  // Con los NOMBRES del régimen y del uso de CFDI para la pantalla (los códigos solos no le dicen nada al usuario).
  private conNombres(r: ReceptorFiscal) {
    return {
      ...r,
      regimenNombre: REGIMENES_FISCALES[r.regimenFiscal] ?? null,
      usoCfdiNombre: r.usoCfdiDefault ? (USOS_CFDI[r.usoCfdiDefault] ?? null) : null,
      validadoSat: !!r.validadoEn,
    };
  }

  async listarReceptores(tenantId: string, rfc?: string) {
    const where: Record<string, unknown> = { tenantId };
    if (rfc) where.rfc = rfc.trim().toUpperCase();
    const filas = await this.receptores.find({ where, order: { nombreFiscal: 'ASC' }, take: 200 });
    return filas.map((r) => this.conNombres(r));
  }

  async receptorConNombres(tenantId: string, id: string) {
    return this.conNombres(await this.obtenerReceptor(tenantId, id));
  }

  async obtenerReceptor(tenantId: string, id: string) {
    const r = await this.receptores.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Receptor no encontrado');
    return r;
  }

  private normalizarReceptor(input: ReceptorInput, base?: ReceptorFiscal) {
    const rfc = limpiar(input.rfc ?? base?.rfc).toUpperCase();
    const nombreFiscal = limpiar(input.nombreFiscal ?? base?.nombreFiscal);
    const codigoPostal = limpiar(input.codigoPostal ?? base?.codigoPostal);
    const regimenFiscal = limpiar(input.regimenFiscal ?? base?.regimenFiscal);
    const usoCfdiDefault =
      input.usoCfdiDefault === undefined ? (base?.usoCfdiDefault ?? null) : input.usoCfdiDefault ? limpiar(input.usoCfdiDefault).toUpperCase() : null;
    const email = input.email === undefined ? (base?.email ?? null) : input.email ? limpiar(input.email).toLowerCase() : null;

    const r = validarRfc(rfc);
    if (!r.ok) throw new BadRequestException(r.motivo);
    if (!nombreFiscal || nombreFiscal.length > 254) throw new BadRequestException('El nombre fiscal es obligatorio (máx. 254 caracteres).');
    if (!esCodigoPostal(codigoPostal)) throw new BadRequestException('El código postal fiscal debe ser de 5 dígitos.');
    if (!REGIMENES_FISCALES[regimenFiscal]) throw new BadRequestException('Régimen fiscal del receptor inválido.');
    if (usoCfdiDefault && !USOS_CFDI[usoCfdiDefault]) throw new BadRequestException('Uso de CFDI inválido.');
    if (email && !esEmail(email)) throw new BadRequestException('Correo inválido.');
    return {
      rfc,
      nombreFiscal,
      codigoPostal,
      regimenFiscal,
      usoCfdiDefault,
      email,
      esExtranjero: r.tipo === 'GENERICO_EXTRANJERO' ? true : (input.esExtranjero ?? base?.esExtranjero ?? false),
    };
  }

  private async asegurarUnico(tenantId: string, rfc: string, codigoPostal: string, exceptoId?: string) {
    const otro = await this.receptores.findOne({ where: { tenantId, rfc, codigoPostal } });
    if (otro && otro.id !== exceptoId) throw new ConflictException('Ya existe un receptor con ese RFC y código postal.');
  }

  async crearReceptor(tenantId: string, input: ReceptorInput) {
    const datos = this.normalizarReceptor(input);
    await this.asegurarUnico(tenantId, datos.rfc, datos.codigoPostal);
    return this.receptores.save(this.receptores.create({ ...datos, tenantId }));
  }

  async actualizarReceptor(tenantId: string, id: string, input: ReceptorInput) {
    const actual = await this.obtenerReceptor(tenantId, id);
    const datos = this.normalizarReceptor(input, actual);
    await this.asegurarUnico(tenantId, datos.rfc, datos.codigoPostal, id);
    // Si cambió un dato fiscal, la validación previa del PAC (si la hubo) ya no aplica.
    const cambioFiscal = datos.rfc !== actual.rfc || datos.nombreFiscal !== actual.nombreFiscal || datos.codigoPostal !== actual.codigoPostal || datos.regimenFiscal !== actual.regimenFiscal;
    return this.receptores.save({ ...actual, ...datos, validadoEn: cambioFiscal ? null : actual.validadoEn });
  }

  async eliminarReceptor(tenantId: string, id: string) {
    await this.obtenerReceptor(tenantId, id);
    await this.receptores.delete({ id, tenantId });
    return { deleted: true };
  }
}
