import { defineConfig } from '@hey-api/openapi-ts'

const input = './spec/generated/openapi.yaml'

export default defineConfig([
  {
    input,
    output: './src/api',
    plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch', '@hey-api/schemas'],
  },
  {
    input,
    output: { path: './server/api', importFileExtension: '.ts' },
    plugins: ['@hey-api/typescript', 'fastify'],
  },
])
