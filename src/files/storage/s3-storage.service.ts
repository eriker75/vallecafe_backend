import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { IStorageService } from './storage.interface';

/**
 * Almacenamiento en AWS S3 (o compatible: DigitalOcean Spaces, MinIO).
 * Construcción perezosa: no falla si S3 no está configurado mientras se use
 * el storage local (STORAGE_TYPE=local). Solo valida al subir/eliminar.
 */
@Injectable()
export class S3StorageService implements IStorageService {
  private client?: S3Client;
  private bucket?: string;
  private region!: string;
  private endpoint?: string;
  private forcePathStyle?: boolean;

  constructor(private readonly config: ConfigService) {}

  private ensureClient(): S3Client {
    if (this.client) return this.client;

    this.region = this.config.get<string>('AWS_REGION') || 'us-east-1';
    // Acepta ambos nombres de variable por compatibilidad con el .env existente.
    this.bucket =
      this.config.get<string>('AWS_S3_BUCKET_NAME') || this.config.get<string>('AWS_S3_BUCKET');
    if (!this.bucket) {
      throw new InternalServerErrorException('AWS_S3_BUCKET_NAME o AWS_S3_BUCKET no está configurado');
    }
    this.endpoint = this.config.get<string>('AWS_S3_ENDPOINT');
    this.forcePathStyle = this.config.get<string>('AWS_S3_FORCE_PATH_STYLE') === 'true';

    const s3Config: any = { region: this.region };

    // Solo fijamos credenciales explícitas si AMBAS están presentes. Si no, dejamos
    // que el SDK use su cadena de credenciales por defecto (variables de entorno
    // estándar, perfil, IAM role…). Pasar undefined rompería esa cadena.
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    if (accessKeyId && secretAccessKey) {
      s3Config.credentials = { accessKeyId, secretAccessKey };
    }
    if (this.endpoint) {
      s3Config.endpoint = this.endpoint;
      s3Config.forcePathStyle = this.forcePathStyle ?? true;
    } else {
      s3Config.endpoint =
        this.region === 'us-east-1'
          ? 'https://s3.amazonaws.com'
          : `https://s3.${this.region}.amazonaws.com`;
      s3Config.forcePathStyle = false;
    }

    this.client = new S3Client(s3Config);
    return this.client;
  }

  async upload(buffer: Buffer, type: string, filename: string, mimeType: string): Promise<string> {
    const client = this.ensureClient();
    const key = `${type}/${filename}`;
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
      return this.getUrl(type, filename);
    } catch (error: any) {
      throw new InternalServerErrorException(`Error subiendo archivo a S3: ${error.message}`);
    }
  }

  async delete(type: string, filename: string): Promise<void> {
    const client = this.ensureClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: `${type}/${filename}` }),
    );
  }

  getUrl(type: string, filename: string): string {
    const key = `${type}/${filename}`;
    if (this.endpoint) {
      const ep = this.endpoint.replace(/\/$/, '');
      return this.forcePathStyle
        ? `${ep}/${this.bucket}/${key}`
        : `https://${this.bucket}.${ep.replace(/^https?:\/\//, '')}/${key}`;
    }
    return this.region === 'us-east-1'
      ? `https://${this.bucket}.s3.amazonaws.com/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
