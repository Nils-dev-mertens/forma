// Password hashing algorithm configuration
export const PASSWORD_ALGORITHM = process.env.PASSWORD_ALGORITHM ?? 'scrypt'; // 'bcrypt' or 'scrypt'

// Bcrypt configuration (used when PASSWORD_ALGORITHM = 'bcrypt')
export const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

// Scrypt configuration (used when PASSWORD_ALGORITHM = 'scrypt')
export const SCRYPT_SALT_LENGTH = Number(process.env.SCRYPT_SALT_LENGTH ?? 16); // bytes
export const SCRYPT_KEY_LENGTH = Number(process.env.SCRYPT_KEY_LENGTH ?? 64); // bytes
export const SCRYPT_COST_PARAMETER = Number(process.env.SCRYPT_COST_PARAMETER ?? 16384);
export const SCRYPT_BLOCK_SIZE = Number(process.env.SCRYPT_BLOCK_SIZE ?? 8);
export const SCRYPT_PARALLELIZATION = Number(process.env.SCRYPT_PARALLELIZATION ?? 1);