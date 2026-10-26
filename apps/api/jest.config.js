module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.test\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  setupFiles: ['reflect-metadata'],
  moduleNameMapper: {
    '^@heals/types$': '<rootDir>/../../../packages/types/src/index.ts',
    '^@heals/constants$': '<rootDir>/../../../packages/constants/src/index.ts',
    '^@repo/types$': '<rootDir>/../../../packages/types/src/index.ts',
    '^@repo/constants$': '<rootDir>/../../../packages/constants/src/index.ts',
  },
};
