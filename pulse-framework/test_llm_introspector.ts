
import { ComponentIntrospector } from './src/llm/code-understanding';

console.log('--- Testing LLM Introspector ---');

const introspector = new ComponentIntrospector();

const source = `
<script>
  import { createSignal } from 'pulse';
  import Button from './Button.pulse';

  const [count, setCount] = createSignal(0);
  
  function increment() {
    setCount(count() + 1);
  }
</script>

<template>
  <Button onClick={increment}>
    Count is {count()}
  </Button>
</template>
`;

const model = introspector.introspect(source, 'Counter.pulse');

console.log('Model Name:', model.name);
console.log('Complexity:', model.complexity);
console.log('State (Signals):', model.state);
console.log('Dependencies:', model.dependencies);

if (model.name === 'Counter' &&
  model.state.includes('count') &&
  model.dependencies.includes('pulse') &&
  model.dependencies.includes('./Button.pulse')) {
  console.log('✅ Introspection successful');
} else {
  console.error('❌ Introspection failed', model);
}
