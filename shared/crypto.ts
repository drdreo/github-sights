import { decodeBase64, encodeBase64 } from "jsr:@std/encoding/base64";

const GITHUB_TOKEN_PREFIXES = ["ghp_", "gho_", "github_pat_", "ghs_", "ghr_"];

function looksLikeGitHubToken(value: string): boolean {
    return GITHUB_TOKEN_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Derives a CryptoKey from a hex-encoded 32-byte key string.
 */
async function importKey(hexKey: string): Promise<CryptoKey> {
    const keyBytes = new Uint8Array(hexKey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    if (keyBytes.length !== 32) {
        throw new Error(`ENCRYPTION_KEY must be 32 bytes (64 hex chars), got ${keyBytes.length}`);
    }
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt"
    ]);
}

/**
 * Returns null if not set (plaintext mode).
 */
let warnedMissingKey = false;
export function getEncryptionKey(): string | null {
    const key = Deno.env.get("ENCRYPTION_KEY");
    if (!key) {
        if (!warnedMissingKey) {
            console.warn(
                "[crypto] WARNING: ENCRYPTION_KEY is not set. Tokens will be stored as plaintext."
            );
            warnedMissingKey = true;
        }
        return null;
    }
    return key;
}

/** Encrypt a token for storage. Falls back to plaintext if no key is configured. */
export async function encryptToken(token: string): Promise<string> {
    const key = getEncryptionKey();
    if (!key) return token;
    return encrypt(token, key);
}

export async function decryptToken(encrypted: string): Promise<string> {
    const key = getEncryptionKey();
    if (!key) return encrypted;

    // Pre-encryption plaintext still in the DB — return as-is for migration
    if (looksLikeGitHubToken(encrypted)) {
        console.warn("[crypto] Found unencrypted token in DB — will be encrypted on next write");
        return encrypted;
    }

    return decrypt(encrypted, key);
}

export async function encrypt(plaintext: string, hexKey: string): Promise<string> {
    const key = await importKey(hexKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

    // Combine IV + ciphertext (which includes the 16-byte auth tag appended by Web Crypto)
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return encodeBase64(combined);
}

export async function decrypt(ciphertext: string, hexKey: string): Promise<string> {
    const combined = decodeBase64(ciphertext);
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const key = await importKey(hexKey);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(plaintext);
}
