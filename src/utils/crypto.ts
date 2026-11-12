import crypto from 'node:crypto';

const GCM_PREFIX = 'v2:';

/**
 * Get the encryption key from environment.
 * NEVER falls back to a dummy key — if the key is missing, operations will fail
 * with a clear error message instead of silently using an insecure default.
 */
function getKeyBuffer(): Buffer {
  // ENCRYPTION_KEY is the canonical name. VITE_ENCRYPTION_KEY is the legacy
  // name kept only as a deploy transition: the VITE_ prefix is Vite's
  // client-exposure convention and must never carry a secret.
  const secretKey = process.env.ENCRYPTION_KEY || process.env.VITE_ENCRYPTION_KEY;

  if (!secretKey) {
    throw new Error(
      '[SECURITY] ENCRYPTION_KEY no está configurada. ' +
      'Define esta variable de entorno con exactamente 32 caracteres antes de usar cifrado.'
    );
  }

  if (secretKey.length < 32) {
    throw new Error(
      `[SECURITY] ENCRYPTION_KEY debe tener al menos 32 caracteres (actual: ${secretKey.length}).`
    );
  }

  const keyBuffer = Buffer.alloc(32);
  keyBuffer.write(secretKey, 'utf-8');
  return keyBuffer;
}

/** AES-256-GCM. Format: v2:<iv hex>:<auth tag hex>:<ciphertext hex> */
export function encrypt(text: string): string {
  const keyBuffer = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${GCM_PREFIX}${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypts v2 (GCM) payloads and legacy aes-256-cbc "iv:ciphertext" payloads,
 * so credentials stored before the GCM migration keep working until they are
 * re-saved (connect-natura re-encrypts them on update).
 */
export function decrypt(hash: string): string {
  const keyBuffer = getKeyBuffer();

  if (hash.startsWith(GCM_PREFIX)) {
    const [ivHex, tagHex, ctHex] = hash.slice(GCM_PREFIX.length).split(':');
    if (!ivHex || !tagHex || !ctHex) {
      throw new Error('Formato de cifrado v2 inválido. Se esperaba "v2:iv:tag:ciphertext".');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(Buffer.from(ctHex, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }

  const parts = hash.split(':');
  if (parts.length !== 2) {
    throw new Error('Formato de cifrado inválido. Se esperaba "v2:iv:tag:ciphertext" o "iv:ciphertext".');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

/** True when the payload still uses the legacy unauthenticated CBC format. */
export function isLegacyFormat(hash: string): boolean {
  return !hash.startsWith(GCM_PREFIX);
}
