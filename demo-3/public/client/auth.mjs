const encoder = new TextEncoder();

// Do the expensive password work on the device. Treat the proof exactly like
// a password: send it only to the same-origin API and never store or log it.
export async function derivePasswordProof(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string' || password.length < 12 || password.length > 128 || !password.trim()) {
    throw new Error('Use a password with 12–128 characters.');
  }
  if (!globalThis.crypto?.subtle) throw new Error('Open Evergreen on its secure website to sign in.');
  const salt = encoder.encode('evergreen-team2-capstone-client-v1\u0000' + email.trim().toLowerCase());
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const proof = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000}, key, 256);
  return Array.from(new Uint8Array(proof), byte => byte.toString(16).padStart(2,'0')).join('');
}
