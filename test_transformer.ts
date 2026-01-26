
import { TemplateTransformer } from './pulse-v5/src/server/compiler/template-transformer';

const transformer = new TemplateTransformer();
const template = `
  <input value="{name}" />
  <p>Hello, {name}!</p>
`;
const stateVars = [
  { name: 'name', value: "'Pulse User'" }
];

const result = transformer.transform(template, stateVars);
console.log('HTML:', result.html);
console.log('Bindings:', JSON.stringify(result.bindings, null, 2));
