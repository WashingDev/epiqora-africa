import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);

const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'membership-roles\\.transaction\\.integration\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ES2023',
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    ...pathsToModuleNameMapper(paths, {
      prefix: '<rootDir>/',
    }),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
};

export default config;
