
import { ScriptParser } from './pulse-v5/src/server/script-parser';

const parser = new ScriptParser();
const script = `
  const [name, setName] = createSignal('Pulse User');
  const [email, setEmail] = createSignal('');
`;

const result = parser.parse(script);
console.log('State Vars:', JSON.stringify(result.stateVars, null, 2));
