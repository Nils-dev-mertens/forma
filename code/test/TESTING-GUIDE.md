# Forma Testing Guide

## 🎯 Overview

This guide explains the testing setup for the Forma application and provides solutions for common testing challenges.

## 🗂️ Current Test Structure

```
test/
├── auth/              # Authentication tests
├── api/               # API endpoint tests  
├── db/                # Database tests
├── integration/       # Integration tests
├── utils/             # Test utilities
├── *.test.js          # Test files
└── TESTING-GUIDE.md    # This file
```

## 🚧 Current Challenges

### 1. ES Modules vs CommonJS

**Problem**: The workspace packages use ES modules (`"type": "module"`), but Jest expects CommonJS by default.

**Symptoms**:
- `Cannot find module` errors
- Module mapping failures
- Import/require conflicts

### 2. Workspace Package Resolution

**Problem**: Jest cannot resolve `@repo/*` imports in the test environment.

**Symptoms**:
- `@repo/db not found` errors
- Package path resolution failures

## ✅ Working Solutions

### Solution 1: Use Minimal Tests (Recommended for Now)

Run the simple test that doesn't depend on workspace packages:

```bash
cd ./code
npx jest --config jest-minimal.config.js
```

This tests basic JavaScript functionality without module resolution issues.

### Solution 2: Direct Package Testing

For testing specific packages, use the package's own test setup:

```bash
cd ./code/packages/db
bun run check-types  # Type checking
# Add package-specific tests here
```

### Solution 3: Transpile for Testing

Create a test build that transpiles ES modules to CommonJS:

```bash
# Add this to package.json scripts
"test:build": "turbo run build && jest"
```

### Solution 4: Use ES Module Test Runner

Switch to a test runner that supports ES modules natively:

```bash
# Install Vitest (ES module compatible)
bun add -d vitest @vitest/ui

# Update test scripts
"test": "vitest run"
```

## 📋 Test Categories

### 1. Unit Tests

**Purpose**: Test individual functions in isolation
**Location**: `test/*/unit/`
**Example**: Testing `CheckKey()` function

### 2. Integration Tests

**Purpose**: Test interactions between components
**Location**: `test/integration/`
**Example**: API key generation → database storage → validation

### 3. End-to-End Tests

**Purpose**: Test complete user flows
**Location**: `test/e2e/`
**Example**: User generates key → uses key → accesses protected route

### 4. Contract Tests

**Purpose**: Test API contracts and responses
**Location**: `test/api/`
**Example**: Verify `/api/key/generate` response format

## 🧪 Test Examples

### Simple Test (Working)

```javascript
// test/simple.test.js
describe("Basic Tests", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});
```

Run with:
```bash
npx jest --config jest-minimal.config.js
```

### Package-Specific Test

```javascript
// In packages/db/test/db.test.js
import { initializeDatabase } from "../src/client";

describe("Database", () => {
  it("should initialize", async () => {
    await initializeDatabase();
    expect(true).toBe(true);
  });
});
```

Run with:
```bash
cd packages/db
bun test
```

## 🔧 Recommended Setup

### Option A: Keep It Simple (Short Term)

1. Use minimal tests for now
2. Test packages individually
3. Focus on manual testing for complex flows
4. Gradually add more automated tests

### Option B: Proper ES Module Support (Long Term)

1. Switch to Vitest (ES module compatible)
2. Or configure Jest for ES modules
3. Set up proper module resolution
4. Add transpilation step for tests

### Option C: Hybrid Approach (Recommended)

1. Use simple tests for core logic
2. Test packages in isolation
3. Add integration tests gradually
4. Use manual testing for complex workflows

## 📚 Best Practices

### 1. Test What Matters

- Focus on critical paths first
- Test business logic, not framework code
- Prioritize tests that prevent regressions

### 2. Keep Tests Fast

- Avoid database setup in every test
- Use mocks for external services
- Keep test data minimal

### 3. Make Tests Reliable

- Avoid flaky tests
- Clean up after tests
- Use deterministic data

### 4. Test Documentation

- Document test purpose
- Explain complex test setups
- Keep tests readable

## 🚀 Future Improvements

### 1. Proper ES Module Support

```bash
# Install Vitest
bun add -d vitest @vitest/ui

# Configure vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    setupFiles: ['test/setup.ts']
  }
});
```

### 2. Test Coverage

```bash
# Add coverage reporting
"test:coverage": "vitest run --coverage"
```

### 3. CI Integration

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run test
```

### 4. Test Data Management

```javascript
// Use test databases
beforeAll(() => setupTestDatabase());
afterAll(() => cleanupTestDatabase());
```

## 🎯 Summary

**Current Status**: ✅ Basic test infrastructure in place
**Working Tests**: ✅ Simple tests run successfully
**Challenge**: ⚠️ ES Module / CommonJS compatibility
**Solution**: 🔧 Use minimal tests + package-specific testing
**Future**: 🚀 Migrate to Vitest or proper ES module support

The test suite is ready for expansion! Start with simple tests and gradually add more comprehensive coverage as the module resolution is improved.