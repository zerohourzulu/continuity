import { createRequire } from 'node:module';

// Deliberate repository-context reuse of the reader's exact installed dependency set.
// No SDK fork or download; the reader's pnpm lock remains the installation authority.
const require = createRequire(new URL('../../retained-evidence-mcp/package.json', import.meta.url));
const metadata = require('./package.json');
if (metadata.dependencies['@modelcontextprotocol/sdk'] !== '1.30.0' || metadata.dependencies.zod !== '3.25.76') {
  throw new Error('GATEWAY_DEPENDENCY_CONTEXT_CHANGED');
}
export const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
export const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
export const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
export const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
export const { ListToolsRequestSchema, CallToolResultSchema, JSONRPCMessageSchema } = require('@modelcontextprotocol/sdk/types.js');
export const { z } = require('zod');
