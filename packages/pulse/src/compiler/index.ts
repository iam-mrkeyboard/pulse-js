/**
 * Single Pulse SFC compiler (dev + build).
 * Restructure layout: server/component-compiler.ts is canonical.
 * Bundler interactive path should delegate here.
 */
export { ComponentCompiler } from '../server/component-compiler';
export { TemplateTransformer } from '../server/template-transformer';
