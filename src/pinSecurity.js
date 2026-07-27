const PIN_HASH_PREFIX = "pbkdf2-sha256";
const PIN_HASH_VERSION = "v1";
const PIN_HASH_ITERATIONS = 120_000;
const PIN_SALT_BYTES = 16;
const PIN_HASH_BYTES = 32;

function cryptoApi() {
  const api = globalThis.crypto;
  if (!api?.subtle || typeof api.getRandomValues !== "function") {
    throw new Error("この端末では安全なPIN保存を利用できません");
  }
  return api;
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return globalThis.btoa(binary);
}

function base64ToBytes(value) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function isHashedPin(value) {
  return String(value || "").startsWith(`${PIN_HASH_PREFIX}$${PIN_HASH_VERSION}$`);
}

export function isValidPin(value) {
  return /^\d{4}$/.test(String(value || ""));
}

async function derivePinHash(pin, salt, iterations) {
  const api = cryptoApi();
  const material = await api.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await api.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    material,
    PIN_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin) {
  if (!isValidPin(pin)) throw new Error("PINは4桁の数字で設定してください");
  const salt = cryptoApi().getRandomValues(new Uint8Array(PIN_SALT_BYTES));
  const hash = await derivePinHash(String(pin), salt, PIN_HASH_ITERATIONS);
  return [
    PIN_HASH_PREFIX,
    PIN_HASH_VERSION,
    String(PIN_HASH_ITERATIONS),
    bytesToBase64(salt),
    bytesToBase64(hash),
  ].join("$");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

export async function verifyPin(pin, storedValue) {
  if (!isValidPin(pin) || !storedValue) return false;
  if (!isHashedPin(storedValue)) {
    // 旧版の平文PINは、起動後の移行が完了するまで照合だけ許可する。
    return String(pin) === String(storedValue);
  }

  const parts = String(storedValue).split("$");
  if (parts.length !== 5) return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  try {
    const salt = base64ToBytes(parts[3]);
    const expected = base64ToBytes(parts[4]);
    const actual = await derivePinHash(String(pin), salt, iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function migrateLegacyPin(storedValue) {
  if (!storedValue || isHashedPin(storedValue)) return storedValue || "";
  if (!isValidPin(storedValue)) return "";
  return hashPin(String(storedValue));
}
