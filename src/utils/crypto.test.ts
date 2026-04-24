import { describe, it } from 'node:test';
import assert from 'node:assert';
import { encrypt, decrypt } from './crypto.ts';

describe('Crypto utils (AES-256-CBC)', () => {
  it('should encrypt and decrypt correctly', () => {
    const originalText = 'Hello, this is a secret message!';
    const encrypted = encrypt(originalText);

    // We expect the result to have the format iv:encrypted
    assert.ok(encrypted.includes(':'));
    assert.notStrictEqual(encrypted, originalText);

    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, originalText);
  });

  it('should produce different ciphertexts for the same plaintext due to random IV', () => {
    const originalText = 'Same text';
    const encrypted1 = encrypt(originalText);
    const encrypted2 = encrypt(originalText);

    // Because IV is random, the output should differ even for same text
    assert.notStrictEqual(encrypted1, encrypted2);

    // Both should still decrypt to the original
    assert.strictEqual(decrypt(encrypted1), originalText);
    assert.strictEqual(decrypt(encrypted2), originalText);
  });

  it('should throw an error or handle invalid encrypted data format during decryption', () => {
    // The current decrypt implementation expects an IV and encrypted text separated by :
    // Let's pass something invalid and see it fails gracefully or throws
    assert.throws(() => {
      decrypt('invalidformatwithoutcolon');
    }); // we just test it throws, actual error depends on node crypto
  });
});
