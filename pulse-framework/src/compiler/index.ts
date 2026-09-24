/**
 * Single Pulse SFC compiler (dev + build).
 * Measured create path: cloneNode + path walk (SFC-native; createElement was ~20% faster on
 * tiny rows but HTML SFCs compile naturally to <template> clone — see bench/RESULTS.md).
 */
export { ComponentCompiler } from '../server/compiler/component-compiler';
export { TemplateTransformer } from '../server/compiler/template-transformer';
