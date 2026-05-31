import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const method = request.method;
    const url = request.url;
    const user = request.user;
    const tenantId = request.tenantId || user?.tenantId;

    // Solo auditar POST, PUT, PATCH, DELETE
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // Extraer la entidad de la URL
    const entity = this.extractEntityFromUrl(url);

    // Determinar la acción
    let action: string;
    switch (method) {
      case 'POST':
        action = 'CREATE';
        break;
      case 'PUT':
      case 'PATCH':
        action = 'UPDATE';
        break;
      case 'DELETE':
        action = 'DELETE';
        break;
      default:
        action = 'ACCESS';
    }

    // Obtener IP y User Agent
    const ipAddress = request.ip || request.connection.remoteAddress;
    const userAgent = request.headers['user-agent'] || '';

    return next.handle().pipe(
      tap(async () => {
        // Solo registrar si la respuesta fue exitosa (2xx)
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            await this.auditService.createLog({
              userId: user?.id || 'system',
              userEmail: user?.email || 'system',
              tenantId: tenantId || 'system',
              action,
              entity,
              details: {
                method,
                url,
                body: request.body,
              },
              ipAddress,
              userAgent,
            });
          } catch (error) {
            console.error('Error creating audit log:', error);
          }
        }
      }),
    );
  }

  private extractEntityFromUrl(url: string): string {
    // Extraer la entidad de la URL
    // Ej: /users -> User, /companies -> Company
    const parts = url.split('/').filter(Boolean);
    if (parts.length > 0) {
      const entity = parts[0];
      // Convertir a singular y capitalizar
      return this.singularize(this.capitalize(entity));
    }
    return 'Unknown';
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private singularize(str: string): string {
    // Reglas simples de singularización
    if (str.endsWith('ies')) {
      return str.slice(0, -3) + 'y';
    }
    if (str.endsWith('es')) {
      return str.slice(0, -2);
    }
    if (str.endsWith('s')) {
      return str.slice(0, -1);
    }
    return str;
  }
}
