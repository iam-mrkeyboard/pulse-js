
import { SafeCompiler } from './src/bundler/compiler/safe-compiler';

// Mock Legacy Compiler
const mockLegacy = {
  compile: (file, source) => `console.log("Compiled ${file}")`
};

const compiler = new SafeCompiler(mockLegacy);

const invalidSource = `
<script>
  const x = 1;
</script>
<div>
  {y}
</div>
`;

const validSource = `
<script>
  const x = 1;
</script>
<div>
  {x}
</div>
`;

async function test() {
  console.log('--- Testing Invalid Component ---');
  const res1 = await compiler.compile(invalidSource, 'invalid.pulse');
  if (res1.isErr()) {
    console.log('✅ Error correctly caught:');
    console.log('Message:', res1.error.message);
    console.log('Suggestion:', res1.error.suggestion);
  } else {
    console.error('❌ Expected error but got success');
  }

  console.log('\n--- Testing Valid Component ---');
  const res2 = await compiler.compile(validSource, 'valid.pulse');
  if (res2.isOk()) {
    console.log('✅ Compile success');
  } else {
    console.error('❌ Expected success but got error:', res2.error);
  }
}

test();
