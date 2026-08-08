import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from './entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { Branch } from '../branches/entities/branch.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ModulesService } from '../modules/modules.service';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)  private tenantsRepository:   Repository<Tenant>,
    @InjectRepository(User)    private usersRepository:     Repository<User>,
    @InjectRepository(Company) private companiesRepository: Repository<Company>,
    @InjectRepository(Branch)  private branchesRepository:  Repository<Branch>,
    private subscriptionsService: SubscriptionsService,
    private modulesService: ModulesService,
  ) {}

  async create(dto: {
    legalName: string;
    tradeName?: string;
    taxId?: string;
    plan?: string;
    email?: string;
    password?: string;
    ownerName?: string;
    rfc?: string;
    industry?: string;
    phone?: string;
    city?: string;
    state?: string;
    slug?: string;
    billingCycle?: string;
  }) {
    const { legalName, tradeName, taxId, plan, email, password, ownerName,
            rfc, industry, phone, city, state, slug, billingCycle } = dto;

    // 1. Tenant
    const tenant = await this.tenantsRepository.save(
      this.tenantsRepository.create({
        legalName,
        tradeName: tradeName || legalName,
        taxId: taxId || rfc,
        rfc,
        industry,
        phone,
        city,
        state,
        slug,
        billingCycle: billingCycle || 'monthly',
        plan: plan || 'BASIC',
        isActive: true,
      }),
    );

    // 2. Usuario ADMIN del tenant
    if (email && password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.usersRepository.save(
        this.usersRepository.create({
          email,
          password: hashedPassword,
          name: ownerName || legalName,
          roleCode: 'ADMIN',
          tenantId: tenant.id,
          isActive: true,
        }),
      );
    }

    // 3. Empresa principal
    const company = await this.companiesRepository.save(
      this.companiesRepository.create({
        legalName,
        tradeName: tradeName || legalName,

        tenantId: tenant.id,
        baseCurrency: 'MXN',
        isActive: true,
      }),
    );

    // 4. Sucursal Matriz
    await this.branchesRepository.save(
      this.branchesRepository.create({
        companyId: company.id,
        code: 'MATRIZ',
        name: 'Matriz',
        isActive: true,
      }),
    );

    // 5. Suscripción inicial
    await this.subscriptionsService.createForTenant(
      tenant.id,
      dto.plan || 'BASIC',
      dto.billingCycle || 'monthly',
    );

    // 6. Inicializar tenant_modules a partir del plan (Sistema 3, fuente única de verdad).
    // No debe tumbar el alta del tenant si falla: se loguea completo y se avisa en la
    // respuesta para que quede visible, no en silencio.
    let modulesWarning: string | undefined;
    try {
      await this.modulesService.initFromPlan(tenant.id, dto.plan || 'BASIC');
    } catch (err) {
      this.logger.error(
        `initFromPlan() falló para tenant ${tenant.id} (${legalName}), plan ${dto.plan || 'BASIC'}`,
        err instanceof Error ? err.stack : err,
      );
      modulesWarning = `No se pudieron inicializar los módulos automáticamente, ejecutar POST /modules/tenant/${tenant.id}/init manualmente`;
    }

    return modulesWarning ? { ...tenant, warning: modulesWarning } : tenant;
  }

  findAll() {
    return this.tenantsRepository.find();
  }

  findOne(id: string) {
    return this.tenantsRepository.findOne({ where: { id } });
  }

  findBySlug(slug: string) {
    return this.tenantsRepository.findOne({
      where: [
        { legalName: ILike(`%${slug}%`) },
        { tradeName: ILike(`%${slug}%`) },
      ],
    });
  }

  async update(id: string, data: Partial<{ legalName: string; tradeName: string; plan: string; isActive: boolean }>) {
    await this.tenantsRepository.update(id, data);
    return this.tenantsRepository.findOne({ where: { id } });
  }

  async updatePlan(id: string, plan: string) {
    await this.tenantsRepository.update(id, { plan });
    return this.tenantsRepository.findOne({ where: { id } });
  }

  async markOnboarded(id: string) {
    await this.tenantsRepository.update(id, { isOnboarded: true });
    return this.tenantsRepository.findOne({ where: { id } });
  }
}
