import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { compareSync, genSaltSync, hashSync } from 'bcrypt';
import {
  PASSWORD_ALGORITHM,
  SALT_ROUNDS,
  SCRYPT_SALT_LENGTH,
  SCRYPT_KEY_LENGTH,
  SCRYPT_COST_PARAMETER,
  SCRYPT_BLOCK_SIZE,
  SCRYPT_PARALLELIZATION
} from './config.js';

/**
 * Hash a password using the configured algorithm (scrypt or bcrypt)
 * @param password - The plain text password to hash
 * @returns Promise<string> - The hashed password in format: algorithm:salt:hash
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      if (PASSWORD_ALGORITHM === 'bcrypt') {
        // Use bcrypt with configured salt rounds
        const salt = genSaltSync(SALT_ROUNDS);
        const hash = hashSync(password, salt);
        // Return in format: bcrypt:salt:hash
        resolve(`bcrypt:${salt}:${hash}`);
      } else {
        // Use scrypt with configured parameters (default)
        const salt = randomBytes(SCRYPT_SALT_LENGTH).toString('hex');
        const hash = scryptSync(
          password, 
          salt, 
          SCRYPT_KEY_LENGTH,
          {
            cost: SCRYPT_COST_PARAMETER,
            blockSize: SCRYPT_BLOCK_SIZE,
            parallelization: SCRYPT_PARALLELIZATION
          }
        ).toString('hex');
        // Return in format: scrypt:salt:hash
        resolve(`scrypt:${salt}:${hash}`);
      }
    } catch (error) {
      reject(new Error('Failed to hash password'));
    }
  });
}

/**
 * Verify a password against a stored hash
 * @param password - The plain text password to verify
 * @param storedHash - The stored hash in format: algorithm:salt:hash
 * @returns Promise<boolean> - True if the password matches, false otherwise
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      // Split the stored hash into components
      const [algorithm, salt, hash] = storedHash.split(':');
      
      if (!algorithm || !salt || !hash) {
        resolve(false); // Invalid format
        return;
      }
      
      if (algorithm === 'bcrypt') {
        // Verify using bcrypt
        const isValid = compareSync(password, hash);
        resolve(isValid);
      } else if (algorithm === 'scrypt') {
        // Verify using scrypt
        const newHash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
          cost: SCRYPT_COST_PARAMETER,
          blockSize: SCRYPT_BLOCK_SIZE,
          parallelization: SCRYPT_PARALLELIZATION
        }).toString('hex');
        
        // Use timingSafeEqual to prevent timing attacks
        const isValid = timingSafeEqual(Buffer.from(hash), Buffer.from(newHash));
        resolve(isValid);
      } else {
        resolve(false); // Unsupported algorithm
      }
    } catch (error) {
      reject(new Error('Failed to verify password'));
    }
  });
}

/**
 * Generate a random password
 * @param length - Length of the password to generate (default: 12)
 * @returns string - A randomly generated password
 */
export function generateRandomPassword(length: number = 12): string {
  const charset: string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  const values = randomBytes(length);
  
  let password = '';
  for (let i = 0; i < length; i++) {
    const byteValue = values.readUInt8(i);
    const index = byteValue % charset.length;
    password += charset[index];
  }
  
  return password;
}