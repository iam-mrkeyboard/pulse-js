
import { UnifiedParser } from './src/bundler/compiler/unified-parser';

const parser = new UnifiedParser();

const source = `
<script>
  import { createSignal } from 'pulse';
  const [count, setCount] = createSignal(0);
</script>

<style>
  .btn { color: red; }
</style>

<div class="container">
  <button onClick={() => setCount(count() + 1)}>
    Count is {count()}
  </button>
</div>
`;

try {
  const ast = parser.parse(source, 'test.pulse');
  console.log('✅ Parse Successful');

  console.log('--- Script AST ---');
  console.log('Type:', ast.script.type);
  if (ast.script.type === 'valid') {
    console.log('Imports:', (ast.script.ast as any).body.length > 0);
  }

  console.log('--- Template AST ---');
  console.log('Type:', ast.template.type);
  if (ast.template.type === 'valid') {
    console.log('Bindings found:', ast.template.bindings.length);
    console.log('First binding:', ast.template.bindings[0]);
  }

  console.log('--- Styles AST ---');
  console.log('Type:', ast.styles.type);

} catch (e) {
  console.error('❌ Parse Failed', e);
}
