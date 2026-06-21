/**
 * Contrato de un backend de almacenamiento físico de archivos.
 * Implementado por LocalStorageService (disco) y S3StorageService (AWS/S3).
 * No conoce nada de base de datos: solo sube/elimina bytes y resuelve URLs.
 */
export interface IStorageService {
  /** Sube los bytes y devuelve la URL pública del archivo. */
  upload(buffer: Buffer, type: string, filename: string, mimeType: string): Promise<string>;

  /** Elimina el archivo físico. No falla si ya no existe. */
  delete(type: string, filename: string): Promise<void>;

  /** Resuelve la URL pública de un archivo ya almacenado. */
  getUrl(type: string, filename: string): string;
}

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
