import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageService } from './storage.service';
import { StoredFile } from './entities/stored-file.entity';
import { Base64PostgresProvider } from './providers/base64-postgres.provider';
import { CloudinaryProvider } from './providers/cloudinary.provider';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([StoredFile])],
  providers: [StorageService, Base64PostgresProvider, CloudinaryProvider],
  exports: [StorageService],
})
export class StorageModule {}
