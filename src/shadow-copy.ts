import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export function prepareShadowCopy(sourcePath: string, stagingPath: string): string {
  if (fs.existsSync(stagingPath)) {
    fs.rmSync(stagingPath, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingPath, { recursive: true });
  fs.cpSync(sourcePath, stagingPath, { recursive: true });
  logger.info({ source: sourcePath, staging: stagingPath }, 'Shadow copy prepared');
  return stagingPath;
}
