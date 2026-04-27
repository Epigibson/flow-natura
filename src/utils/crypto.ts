import crypto from 'node:crypto';

const algorithm = 'aes-256-cbc';

/**
 * Get the encryption key from environment.
 * NEVER falls back to a dummy key — if the key is missing, operations will fail
 * with a clear error message instead of silently using an insecure default.
 */
function getKeyBuffer(): Buffer {
  const secretKey = process.env.VITE_ENCRYPTION_KEY;

  if (!secretKey) {
    throw new Error(
      '[SECURITY] VITE_ENCRYPTION_KEY no está configurada. ' +
      'Define esta variable de entorno con exactamente 32 caracteres antes de usar cifrado.'
    );
  }

  if (secretKey.length < 32) {
    throw new Error(
      `[SECURITY] VITE_ENCRYPTION_KEY debe tener al menos 32 caracteres (actual: ${secretKey.length}).`
    );
  }

  const keyBuffer = Buffer.alloc(32);
  keyBuffer.write(secretKey, 'utf-8');
  return keyBuffer;
}

export function encrypt(text: string): string {
  const keyBuffer = getKeyBuffer();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Format: iv:encrypted_text
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(hash: string): string {
  const keyBuffer = getKeyBuffer();
  const parts = hash.split(':');
  if (parts.length !== 2) {
    throw new Error('Formato de cifrado inválido. Se esperaba "iv:ciphertext".');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}
