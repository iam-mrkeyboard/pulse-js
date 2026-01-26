
import { ScriptParser } from './src/server/script-parser';

const parser = new ScriptParser();
const content = `
const state = {
  count: 0
};

function increment() {
  state.count = state.count + 1;
}

function decrement() {
  state.count = state.count - 1;
}
`;

console.log('Parsing script...');
// ScriptParser.parse expects the script content only, not the full HTML file?
// PageCompiler extracts <script> content manually.
// So we pass the JS content.
const result = parser.parse(content);
console.log('State Vars:', result.stateVars);
console.log('Functions:', result.functions);
console.log('Imports:', result.imports);
