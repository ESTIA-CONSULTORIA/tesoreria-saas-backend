import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { redactar, redactarUrl } from './redactar';
import { entidadDeLaUrl, negocioDeLaBitacora } from './tenant-objetivo';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    try {
      const request = context.switchToHttp().getRequest();
      const response = context.switchToHttp().getResponse();

      const method = request.method;
      const url = request.url;
      const user = request.user;
      const tenantIdToken = request.tenantId || user?.tenantId;
      const roleCode = user?.roleCode || null;

      // Solo auditar POST, PUT, PATCH, DELETE
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return next.handle();
      }

      // Extraer la entidad de la URL
      const entity = entidadDeLaUrl(url);

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
        tap(async (respuesta) => {
          // Solo registrar si la respuesta fue exitosa (2xx)
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              // Si actúa SOPORTE, la entrada lleva el negocio OBJETIVO (ver tenant-objetivo.ts); si no, el del token
              const negocio = negocioDeLaBitacora({ roleCode, tenantIdToken, query: request.query, body: request.body, respuesta });
              await this.auditService.createLog({
                userId: user?.id || 'system',
                userEmail: user?.email || 'system',
                roleCode,
                tenantId: negocio.tenantId,
                action,
                entity: entity || 'SYSTEM',
                details: {
                  method,
                  url: redactarUrl(url),
                  // Nunca se guardan contraseñas, NIP, tokens, llaves ni certificados (ver redactar.ts).
                  body: redactar(request.body),
                  // de dónde salió el negocio cuando quien actúa es SOPORTE (query, body o respuesta)
                  ...(roleCode === 'SOPORTE' ? { negocioObjetivo: negocio.origen } : {}),
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
    } catch (error) {
      console.error('Error in audit interceptor:', error);
      // Si falla el interceptor, continuar con la petición
      return next.handle();
    }
  }
}
