import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { buildDatabaseUrl } from './database-url.helper';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor(private configService: ConfigService) {
    const nodeEnv = configService.get<string>('NODE_ENV');
    const databaseUrl = buildDatabaseUrl(configService);
    // Cloud SQL por socket Unix (?host=/cloudsql/...) no habla TLS: el túnel de
    // Cloud Run ya va cifrado. Forzar ssl ahí produce TlsConnectionError.
    const usesUnixSocket = databaseUrl.includes('host=/');

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl:
        nodeEnv === 'production' && !usesUnixSocket
          ? { rejectUnauthorized: false }
          : false,
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: nodeEnv === 'production' ? ['warn', 'error'] : ['warn', 'error'],
    });

    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    await this.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS unaccent;');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  async cleanDatabase() {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean database in production');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) => typeof key === 'string' && !key.startsWith('_'),
    );

    return Promise.all(
      models.map((modelKey) => {
        const model = this[modelKey as keyof typeof this];
        if (model && typeof model === 'object' && 'deleteMany' in model) {
          return (model as any).deleteMany();
        }
      }),
    );
  }
}
