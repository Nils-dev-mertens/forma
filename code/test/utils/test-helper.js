/**
 * Test Helper - Properly loads workspace packages for testing
 * Handles the ES Module / CommonJS compatibility issues
 */

// Dynamically load packages from the workspace
function loadPackage(packageName) {
  try {
    // Try direct require first
    return require(`@repo/${packageName}`);
  } catch (error) {
    // Fallback: try to load from the packages directory
    try {
      const path = require('path');
      const packagePath = path.resolve(__dirname, '../../packages', packageName, 'src');
      return require(packagePath);
    } catch (fallbackError) {
      console.warn(`Could not load package @repo/${packageName}:`, fallbackError.message);
      throw new Error(`Package @repo/${packageName} not found`);
    }
  }
}

// Export all packages
module.exports = {
  auth: loadPackage('auth'),
  db: loadPackage('db'),
  logger: loadPackage('logger'),
  generation: loadPackage('generation'),
  storage: loadPackage('storage'),
  loadPackage
};