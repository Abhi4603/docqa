import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://docqa:docqa@localhost:5432/docqa',
  mlServiceUrl: process.env.ML_SERVICE_URL ?? 'http://localhost:8000',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50),
  uploadDir: path.resolve(here, '../uploads'),
};
