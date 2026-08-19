import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';

// Filtro global "catch-all", registrado vía APP_FILTER en app.module.ts (mismo patrón ya
// establecido ahí para APP_GUARD/APP_INTERCEPTOR). Objetivo único: las HttpException
// (BadRequestException, UnauthorizedException, etc. — 94 usos ya establecidos en el
// proyecto) siguen exactamente igual, delegadas a Nest vía super.catch(); cualquier otra
// cosa (QueryFailedError de TypeORM, errores de programación, lo que sea) se loguea
// completa del lado del servidor y responde al cliente el mismo shape genérico que Nest
// ya usa hoy para esto ({statusCode, message, error}) — no se cambia nada que
// api.ts (compara message === 'Sesión inválida') ni las 96 pantallas que leen
// err.response?.data?.message ya esperen.
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      // Ya manejada correctamente por Nest — se delega tal cual, cero cambio de
      // comportamiento para los 94 usos existentes en el proyecto.
      super.catch(exception, host);
      return;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const err = exception instanceof Error ? exception : new Error(String(exception));

    this.logger.error(`${request.method} ${request.originalUrl} — ${err.message}`, err.stack);

    // Mensaje genérico y seguro a propósito — no exponer detalles internos de
    // implementación (ej. el texto crudo de un QueryFailedError de TypeORM) al cliente.
    // Mismo shape { statusCode, message, error } que Nest ya arma por default para esto.
    response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}
