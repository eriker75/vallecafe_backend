import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { IStorageService } from './storage.interface';

/**
 * Almacenamiento en disco local, servido estáticamente bajo /uploads
 * (ver main.ts: app.useStaticAssets(uploadsPath, { prefix: '/uploads' })).
 */
@Injectable()
export class LocalStorageService implements IStorageService {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot =
      this.config.get<string>('UPLOAD_ROOT') || path.join(process.cwd(), 'uploads');
  }

  private get baseUrl(): string {
    return (
      this.config.get<string>('BACKEND_PUBLIC_URL') ||
      `http://localhost:${this.config.get<string>('PORT') ?? 3000}`
    );
  }

  private async ensureDir(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async upload(buffer: Buffer, type: string, filename: string): Promise<string> {
    const dir = path.join(this.uploadRoot, type);
    try {
      await this.ensureDir(dir);
      await fs.writeFile(path.join(dir, filename), buffer);
      return this.getUrl(type, filename);
    } catch (error: any) {
      throw new InternalServerErrorException(`Error guardando archivo local: ${error.message}`);
    }
  }

  async delete(type: string, filename: string): Promise<void> {
    const filePath = path.join(this.uploadRoot, type, filename);
    try {
      await fs.unlink(filePath);
    } catch {
      this.logger.warn(`Archivo ${type}/${filename} no existe, nada que eliminar`);
    }
  }

  getUrl(type: string, filename: string): string {
    return `${this.baseUrl}/uploads/${type}/${filename}`;
  }
}
