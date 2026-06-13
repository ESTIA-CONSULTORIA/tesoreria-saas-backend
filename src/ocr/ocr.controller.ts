import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Request,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OcrService } from './ocr.service';

@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
        cb(null, allowed.includes(file.mimetype));
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-tenant-id') headerTenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    if (!file) {
      throw new BadRequestException('Tipo de archivo no permitido o archivo ausente');
    }
    const tenantId = req?.user?.tenantId ?? headerTenantId;
    const companyId = req?.user?.companyId ?? headerCompanyId;
    return this.ocrService.processDocument(file, tenantId, companyId);
  }

  @Get('documents/:id')
  findOne(@Param('id') id: string) {
    return this.ocrService.findOne(id);
  }

  @Get('documents')
  findAll(
    @Headers('x-tenant-id') headerTenantId?: string,
    @Headers('x-company-id') headerCompanyId?: string,
    @Request() req?: any,
  ) {
    const tenantId = req?.user?.tenantId ?? headerTenantId;
    const companyId = req?.user?.companyId ?? headerCompanyId;
    return this.ocrService.findAll(tenantId, companyId);
  }

  @Put('documents/:id/validate')
  validate(
    @Param('id') id: string,
    @Body() body: { validatedData: Record<string, any>; action?: string },
    @Request() req?: any,
  ) {
    const validatedBy = req?.user?.email ?? 'unknown';
    if (body.action === 'REJECT') {
      return this.ocrService.reject(id, validatedBy);
    }
    return this.ocrService.validate(id, body.validatedData, validatedBy);
  }

  @Delete('documents/:id')
  remove(@Param('id') id: string) {
    return this.ocrService.remove(id);
  }
}
