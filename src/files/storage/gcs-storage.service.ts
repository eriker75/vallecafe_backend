import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage, Bucket } from '@google-cloud/storage';
import { IStorageService } from './storage.interface';

/**
 * Almacenamiento en Google Cloud Storage.
 * Construcción perezosa: no falla si GCS no está configurado mientras se use
 * otro backend (STORAGE_TYPE=local|s3). Solo valida al subir/eliminar.
 *
 * Credenciales (en orden de preferencia):
 *  - GOOGLE_APPLICATION_CREDENTIALS  → ruta al JSON de la service account (ADC)
 *  - GCS_KEY_FILE                    → ruta al JSON (alias explícito)
 *  - GCS_CREDENTIALS_JSON            → el JSON de credenciales en una sola variable
 *  - (nada)                          → Application Default Credentials del entorno
 */
@Injectable()
export class GcsStorageService implements IStorageService {
  private readonly logger = new Logger(GcsStorageService.name);
  private storage?: Storage;
  private bucketRef?: Bucket;
  private bucketName?: string;

  constructor(private readonly config: ConfigService) {}

  private getBucket(): Bucket {
    if (this.bucketRef) return this.bucketRef;

    this.bucketName = this.config.get<string>('GCS_BUCKET_NAME');
    if (!this.bucketName) {
      throw new InternalServerErrorException('GCS_BUCKET_NAME no está configurado');
    }

    const projectId = this.config.get<string>('GCP_PROJECT_ID');
    const keyFilename =
      this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') ||
      this.config.get<string>('GCS_KEY_FILE');
    const credentialsJson = this.config.get<string>('GCS_CREDENTIALS_JSON');

    const options: ConstructorParameters<typeof Storage>[0] = {};
    if (projectId) options.projectId = projectId;
    if (credentialsJson) {
      try {
        options.credentials = JSON.parse(credentialsJson);
      } catch {
        throw new InternalServerErrorException('GCS_CREDENTIALS_JSON no es un JSON válido');
      }
    } else if (keyFilename) {
      options.keyFilename = keyFilename;
    }
    // Si no hay ninguna, el cliente usa Application Default Credentials.

    this.storage = new Storage(options);
    this.bucketRef = this.storage.bucket(this.bucketName);
    this.logger.log(`GCS bucket inicializado: ${this.bucketName}`);
    return this.bucketRef;
  }

  async upload(buffer: Buffer, type: string, filename: string, mimeType: string): Promise<string> {
    const bucket = this.getBucket();
    const key = `${type}/${filename}`;
    try {
      await bucket.file(key).save(buffer, {
        contentType: mimeType,
        resumable: false,
      });
      return this.getUrl(type, filename);
    } catch (error: any) {
      throw new InternalServerErrorException(`Error subiendo archivo a GCS: ${error.message}`);
    }
  }

  async delete(type: string, filename: string): Promise<void> {
    const bucket = this.getBucket();
    try {
      await bucket.file(`${type}/${filename}`).delete({ ignoreNotFound: true });
    } catch (error: any) {
      this.logger.warn(`No se pudo eliminar ${type}/${filename} de GCS: ${error.message}`);
    }
  }

  getUrl(type: string, filename: string): string {
    const key = `${type}/${filename}`;
    // Permite servir desde un CDN/base personalizado si se define.
    const base = this.config.get<string>('GCS_PUBLIC_BASE_URL');
    if (base) return `${base.replace(/\/$/, '')}/${key}`;
    return `https://storage.googleapis.com/${this.bucketName}/${key}`;
  }
}
