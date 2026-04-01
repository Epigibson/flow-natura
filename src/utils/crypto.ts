import crypto from 'node:crypto';

// Utiliza una clave de 32 bytes (256 bits). Si no existe VITE_ENCRYPTION_KEY, usa un string base para desarrollo
const algorithm = 'aes-256-cbc';
// Debe ser exactamente 32 caracteres. Para dev usamos un dummy, en prod deberás de tener VITE_ENCRYPTION_KEY="32_caracteres_exactos"
const secretKey = process.env.VITE_ENCRYPTION_KEY || 'NaturaFlow_Dummy_Key_Development!'; // 32 bytes

// Convierte la string a un Buffer de 32 bytes de forma estricta (por si sobra longitud)
const keyBuffer = Buffer.alloc(32);
keyBuffer.write(secretKey, 'utf-8');

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Guardamos formato: iv:encrypted_text para poder desencriptarlo después
    return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(hash: string): string {
    const parts = hash.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
}
