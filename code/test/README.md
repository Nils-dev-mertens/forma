# Forma Test Suite

This directory contains comprehensive tests for the Forma application suite.

## 🗂️ Structure

```
test/
├── auth/              # Authentication system tests
├── api/               # API endpoint tests
├── db/                # Database tests
├── integration/       # Integration tests
└── utils/             # Test utilities and helpers
```

## 🚀 Running Tests

### All Tests
```bash
bun run test
```

### Specific Test Suite
```bash
bun run test:auth
bun run test:api
bun run test:db
```

### Watch Mode
```bash
bun run test:watch
```

### With Coverage
```bash
bun run test:coverage
```

## 📋 Test Categories

### 1. Authentication Tests (`test/auth/`)
- API key generation and validation
- Database integration
- Middleware behavior
- User locals population

### 2. API Tests (`test/api/`)
- Endpoint functionality
- Authentication requirements
- Response formats
- Error handling

### 3. Database Tests (`test/db/`)
- Schema validation
- CRUD operations
- Query performance
- Data integrity

### 4. Integration Tests (`test/integration/`)
- End-to-end workflows
- Cross-package interactions
- Real-world scenarios

## 🎯 Test Philosophy

1. **Isolated**: Tests run in isolation
2. **Deterministic**: Same input → same output
3. **Fast**: Quick feedback loop
4. **Comprehensive**: Cover all major functionality
5. **Maintainable**: Easy to understand and update

## 🔧 Setup

### Dependencies
```bash
bun add -d jest @types/jest ts-jest supertest
```

### Configuration
- Jest config: `jest.config.js`
- TypeScript support via `ts-jest`
- Test match pattern: `**/*.test.ts`

## 📚 Best Practices

1. **Descriptive Names**: `shouldValidateApiKey.test.ts`
2. **Single Responsibility**: One concept per test file
3. **Clear Structure**: Arrange-Act-Assert pattern
4. **Mock External Services**: Isolate tests
5. **Clean Up**: Reset state after tests

## 🔍 Test Coverage Goals

- **Unit Tests**: 80%+ coverage
- **Integration Tests**: Critical paths covered
- **E2E Tests**: Major user flows covered

## 🎉 Contributing

1. Add tests for new features
2. Update tests when behavior changes
3. Run tests before committing
4. Keep tests fast and reliable