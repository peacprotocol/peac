import { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import { logger } from '../logging';
import { config } from '../config';
import { randomUUID } from 'node:crypto';
import { verifySession } from '../core/session';
import { getRedis } from '../utils/redis-pool';

const exportRequestSchema = z.object({
  subject: z.string(),
});

function validateKeyPath(keyPath: string): string {
  const safeDirectories = [
    resolve(process.cwd(), 'keys'),
    resolve(process.cwd(), 'certs'),
  ];

  const resolvedPath = resolve(keyPath);
  
  const isInSafeDir = safeDirectories.some(safeDir => {
    const relativePath = relative(safeDir, resolvedPath);
    return relativePath && !relativePath.startsWith('..') && !relativePath.startsWith('/');
  });

  if (!isInSafeDir || !resolvedPath.endsWith('.pem')) {
    throw new Error('invalid_key_path');
  }

  return resolvedPath;
}

function sanitizeSubject(subject: string): string {
  return subject.replace(/[*?[\]]/g, '');
}

async function scanRedisKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  const stream = redis.scanStream({ match: pattern, count: 100 });
  
  for await (const batch of stream) {
    keys.push(...batch);
  }
  
  return keys;
}

interface GDPRManifest {
  subject: string;
  exportId: string;
  timestamp: string;
  count: number;
  algo: 'RSA-SHA256';
  dataTypes: string[];
}

export async function handleGDPRExport(req: Request, res: Response): Promise<void> {
  const redis = getRedis();
  
  try {
    const { subject } = exportRequestSchema.parse(req.body);
    
    // Proper JWT authentication
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return void res.status(401).json({ ok: false, reason: 'unauthorized' });
    }
    
    let sessionPayload: { sub: string };
    try {
      const token = auth.slice(7);
      sessionPayload = await verifySession(token);
    } catch {
      return void res.status(401).json({ ok: false, reason: 'invalid_token' });
    }

    // Subject authorization: only allow users to export their own data
    if (sessionPayload.sub !== subject) {
      return void res.status(403).json({ ok: false, reason: 'unauthorized_subject_access' });
    }
    
    // Get private key for signing with path validation
    let privateKey = config.gdpr.manifestPrivateKey;
    
    if (!privateKey.includes('BEGIN')) {
      try {
        const validatedPath = validateKeyPath(privateKey);
        privateKey = await readFile(validatedPath, 'utf8');
      } catch {
        return void res.status(500).json({ ok: false, reason: 'invalid_key_config' });
      }
    }
    
    if (!privateKey) {
      return void res.status(500).json({ ok: false, reason: 'missing_signing_key' });
    }
    
    // Sanitize subject to prevent Redis injection
    const safeSubject = sanitizeSubject(subject);
    
    // Fetch user data
    const records: Array<{ type: string; data: unknown; key: string }> = [];
    const dataTypes = new Set<string>();
    
    // Fetch consent records using scan
    const consentKeys = await scanRedisKeys(redis, `consent:${safeSubject}:*`);
    for (const key of consentKeys) {
      const data = await redis.get(key);
      if (data) {
        records.push({ type: 'consent', data: JSON.parse(data), key });
        dataTypes.add('consent');
      }
    }
    
    // Fetch payment records using scan
    const paymentKeys = await scanRedisKeys(redis, `payment:${safeSubject}:*`);
    for (const key of paymentKeys) {
      const data = await redis.hgetall(key);
      if (Object.keys(data).length > 0) {
        // Redact sensitive fields
        delete data.privateKey;
        delete data.apiKey;
        records.push({ type: 'payment', data, key });
        dataTypes.add('payment');
      }
    }
    
    // Fetch audit logs using scan
    const auditKeys = await scanRedisKeys(redis, `audit:${safeSubject}:*`);
    for (const key of auditKeys) {
      const data = await redis.get(key);
      if (data) {
        records.push({ type: 'audit', data: JSON.parse(data), key });
        dataTypes.add('audit');
      }
    }
    
    // Create manifest
    const manifest: GDPRManifest = {
      subject,
      exportId: randomUUID(),
      timestamp: new Date().toISOString(),
      count: records.length,
      algo: 'RSA-SHA256',
      dataTypes: Array.from(dataTypes),
    };
    
    // Sign manifest
    const sign = createSign('RSA-SHA256');
    sign.update(JSON.stringify(manifest));
    sign.end();
    const signature = sign.sign(privateKey, 'base64');
    
    // Emit audit log
    logger.info({
      action: 'gdpr_export',
      subject,
      exportId: manifest.exportId,
      recordCount: records.length,
    }, 'GDPR export completed');
    
    // Return NDJSON
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr-export-${subject}.ndjson"`);
    res.write(JSON.stringify({ manifest, signature }) + '\n');
    
    for (const record of records) {
      res.write(JSON.stringify(record) + '\n');
    }
    
    res.end();
    
  } catch (error) {
    logger.error({ error }, 'GDPR export failed');
    res.status(500).json({ ok: false, reason: 'export_failed' });
  } finally {
    // Redis connection is pooled, no need to quit
  }
}
