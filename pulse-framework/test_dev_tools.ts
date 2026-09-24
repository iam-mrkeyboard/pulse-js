
import { AutoFixer } from './src/dev/auto-fixer';
import { CompilationError } from './src/bundler/compiler/errors';

console.log('--- Testing DevTools ---');

const fixer = new AutoFixer();
const source = `<script>\n  const x = 1;\n</script>\n<div>{y}</div>`;

const error = new CompilationError({
  message: 'Undefined variables referenced in template: y',
  code: 'UNDEFINED_REFERENCE',
  file: 'test.pulse',
  suggestion: 'Define y in the <script> block...'
});

const fixes = fixer.getFixes(error, source);

console.log('Fixes found:', fixes.length);

if (fixes.length > 0) {
  console.log('First fix description:', fixes[0].description);
  const newSource = fixes[0].apply();
  console.log('Applied Fix Query:', newSource.includes('const [y, setY] = createSignal(0)'));

  if (newSource.includes('const [y, setY] = createSignal(0)')) {
    console.log('✅ Auto-Fix applied correctly');
  } else {
    console.error('❌ Auto-Fix application failed');
  }
} else {
  console.error('❌ No fixes found for UNDEFINED_REFERENCE');
}
