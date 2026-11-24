import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { UserInfo } from '../../shared/types.ts';

export interface SessionRecord {
  sessionId: string;
  csrfToken: string;
  username: string;
  timeZone: string;
  userInfo: UserInfo | null;
  upstreamCookies: Record<string, string>;
  integerKeys: string[];
  createdAt: number;
  expiresAt: number;
}

interface EncryptedEnvelope {
  iv: string;
  tag: string;
  data: string;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly encryptionKey: Buffer;
  private readonly storePath: string | null;
  private readonly ttlMs: number;
  private persistenceWritable = true;

  constructor(secret: string, storePath: string | null, ttlMs: number) {
    this.encryptionKey = crypto.createHash('sha256').update(secret).digest();
    this.storePath = storePath;
    this.ttlMs = ttlMs;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.storePath) return;
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const envelope = JSON.parse(raw) as EncryptedEnvelope;
      if (!envelope.iv || !envelope.tag || !envelope.data) return;

      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(envelope.iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');

      const records = JSON.parse(decrypted) as SessionRecord[];
      const now = Date.now();
      for (const rec of records) {
        if (rec && rec.sessionId && rec.expiresAt > now) {
          this.sessions.set(rec.sessionId, rec);
        }
      }
    } catch {
      // Encrypted store from a rotated ephemeral secret cannot be decrypted;
      // users will cleanly re-authenticate on next request.
      this.sessions.clear();
    }
  }

  private persistToDisk(): void {
    if (!this.storePath || !this.persistenceWritable) return;
    try {
      const dir = path.dirname(this.storePath);
      fs.mkdirSync(dir, { recursive: true });

      const now = Date.now();
      const activeRecords = Array.from(this.sessions.values()).filter((s) => s.expiresAt > now);
      const plaintext = JSON.stringify(activeRecords);

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      const envelope: EncryptedEnvelope = {
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
      };

      const tmpPath = `${this.storePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(envelope), { mode: 0o600 });
      fs.renameSync(tmpPath, this.storePath);
    } catch {
      this.persistenceWritable = false;
    }
  }

  create(params: {
    username: string;
    timeZone: string;
    userInfo: UserInfo | null;
    upstreamCookies: Record<string, string>;
    integerKeys?: string[];
  }): SessionRecord {
    const now = Date.now();
    const record: SessionRecord = {
      sessionId: crypto.randomBytes(32).toString('base64url'),
      csrfToken: crypto.randomBytes(24).toString('base64url'),
      username: params.username,
      timeZone: params.timeZone,
      userInfo: params.userInfo,
      upstreamCookies: { ...params.upstreamCookies },
      integerKeys: params.integerKeys ?? [],
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.sessions.set(record.sessionId, record);
    this.persistToDisk();
    return record;
  }

  get(sessionId: string | undefined | null): SessionRecord | null {
    if (!sessionId) return null;
    const rec = this.sessions.get(sessionId);
    if (!rec) return null;
    if (rec.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      this.persistToDisk();
      return null;
    }
    return rec;
  }

  update(
    sessionId: string,
    patch: Partial<Pick<SessionRecord, 'userInfo' | 'upstreamCookies' | 'integerKeys'>>
  ): SessionRecord | null {
    const rec = this.get(sessionId);
    if (!rec) return null;
    if (patch.userInfo !== undefined) rec.userInfo = patch.userInfo;
    if (patch.upstreamCookies !== undefined) {
      rec.upstreamCookies = { ...rec.upstreamCookies, ...patch.upstreamCookies };
    }
    if (patch.integerKeys !== undefined) {
      const merged = new Set([...rec.integerKeys, ...patch.integerKeys]);
      rec.integerKeys = Array.from(merged);
    }
    rec.expiresAt = Date.now() + this.ttlMs;
    this.persistToDisk();
    return rec;
  }

  delete(sessionId: string | undefined | null): void {
    if (!sessionId) return;
    if (this.sessions.delete(sessionId)) {
      this.persistToDisk();
    }
  }
}
