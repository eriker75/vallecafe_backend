import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as path from 'path';
import { LocalStorageService } from './storage/local-storage.service';
import { S3StorageService } from './storage/s3-storage.service';
import { GcsStorageService } from './storage/gcs-storage.service';
import { IStorageService } from './storage/storage.interface';

export type StorageType = 'local' | 's3' | 'gcs';

export interface StoredFileMeta {
  url: string;
  pathName: string; // nombre con el que quedó guardado (para poder borrarlo)
  filename: string; // nombre original
  mimeType: string;
  size: number;
}

const IMAGE_FOLDER = 'images';
const ALLOWED_MIME = /^image\/(jpe?g|png|webp|gif|avif|svg\+xml)$/;

// Videos reproducibles directamente con <video> en navegadores modernos.
// quicktime (.mov) se acepta porque Safari/iOS lo genera y lo reproduce.
const VIDEO_FOLDER = 'videos';
const ALLOWED_VIDEO_MIME = /^video\/(mp4|webm|ogg|quicktime|x-m4v)$/;

/**
 * Orquesta el almacenamiento físico de archivos (no toca base de datos).
 * Elige el backend (local / s3 / gcs) según STORAGE_TYPE y devuelve la URL
 * pública. Quien lo llama decide dónde guardar esa URL (Product.images[],
 * Category.image, etc.).
 */
@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly storage: IStorageService;

  constructor(
    private readonly config: ConfigService,
    private readonly local: LocalStorageService,
    private readonly s3: S3StorageService,
    private readonly gcs: GcsStorageService,
  ) {
    const raw = (this.config.get<string>('STORAGE_TYPE') || '').trim().toLowerCase();
    const type = (raw || 'local') as StorageType;
    const backends: Record<StorageType, IStorageService> = {
      local: this.local,
      s3: this.s3,
      gcs: this.gcs,
    };
    // Fail-fast: si se configuró un valor explícito pero inválido, no caemos
    // silenciosamente a 'local' (guardaría en el lugar equivocado). Avisamos claro.
    if (!backends[type]) {
      throw new Error(
        `STORAGE_TYPE="${raw}" no es válido. Usa 'local', 's3' o 'gcs'.`,
      );
    }
    this.storage = backends[type];
    this.logger.log(`Storage backend: ${type}`);
  }

  /** Guarda físicamente una imagen y devuelve sus metadatos. */
  async storeImage(file: Express.Multer.File): Promise<StoredFileMeta> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_MIME.test(file.mimetype)) {
      throw new BadRequestException('Formato de imagen no permitido');
    }

    const pathName = `${randomUUID()}${path.extname(file.originalname) || '.jpg'}`;
    const url = await this.storage.upload(file.buffer, IMAGE_FOLDER, pathName, file.mimetype);

    return {
      url,
      pathName,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /** Guarda físicamente un video y devuelve sus metadatos. */
  async storeVideo(file: Express.Multer.File): Promise<StoredFileMeta> {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    if (!ALLOWED_VIDEO_MIME.test(file.mimetype)) {
      throw new BadRequestException(
        'Formato de video no permitido (usa mp4, webm, ogg o mov)',
      );
    }

    const pathName = `${randomUUID()}${path.extname(file.originalname) || '.mp4'}`;
    const url = await this.storage.upload(file.buffer, VIDEO_FOLDER, pathName, file.mimetype);

    return {
      url,
      pathName,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /** Elimina físicamente una imagen previamente guardada. */
  async removeImage(pathName: string): Promise<void> {
    await this.storage.delete(IMAGE_FOLDER, pathName);
  }
}
