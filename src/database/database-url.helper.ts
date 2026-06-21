import { ConfigService } from '@nestjs/config';

/**
 * Builds DATABASE_URL from individual environment variables
 * Format: postgresql://user:password@host:port/database?schema=public
 *
 * Environment variables:
 * - DB_USER: Database username
 * - DB_PASSWORD: Database password
 * - DB_HOST: Database host (e.g., postgres, or RDS endpoint)
 * - DB_PORT: Database port (default: 5432)
 * - DB_NAME: Database name
 * - DB_SCHEMA: Database schema (default: public)
 *
 * Falls back to DATABASE_URL if provided directly
 */
export function buildDatabaseUrl(configService: ConfigService): string {
  // If DATABASE_URL is directly provided, use it
  const directUrl = configService.get<string>('DATABASE_URL');
  if (directUrl) {
    return directUrl;
  }

  // Build from individual components
  const user = configService.get<string>('DB_USER');
  const password = configService.get<string>('DB_PASSWORD');
  const host = configService.get<string>('DB_HOST');
  const port = configService.get<string>('DB_PORT') || '5432';
  const database = configService.get<string>('DB_NAME');
  const schema = configService.get<string>('DB_SCHEMA') || 'public';

  // Validate required fields
  if (!user || !password || !host || !database) {
    throw new Error(
      'Missing required database configuration. Provide either DATABASE_URL or all of: DB_USER, DB_PASSWORD, DB_HOST, DB_NAME',
    );
  }

  // Encode password to handle special characters
  const encodedPassword = encodeURIComponent(password);

  // Build the connection URL
  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${database}?schema=${schema}`;
}
