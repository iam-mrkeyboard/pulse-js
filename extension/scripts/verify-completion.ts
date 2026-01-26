import { PulseCompletionEngine } from '../client/src/completion';

const engine = new PulseCompletionEngine();

function testCompletion(desc: string, content: string, line: number, char: number) {
  const lines = content.split('\n');
  let offset = 0;
  for (let i = 0; i < line; i++) {
    offset += lines[i].length + 1;
  }
  offset += char;

  const items = engine.getCompletions(content, offset);

  console.log(`\nTest: ${desc}`);
  // Handle potential out of bounds for display
  const inputsLine = lines[line] || '';
  console.log(`Input: "${inputsLine.substring(0, char)}|${inputsLine.substring(char)}"`);

  if (items.length > 0) {
    console.log(`Found ${items.length} items. Examples: ${items.slice(0, 3).map(i => i.label).join(', ')}`);
  } else {
    console.log('No completion items found.');
  }
}

// 1. Tag Completion
testCompletion('Start of tag', '<', 0, 1);

// 2. State Completion
testCompletion('Expression State', 'let val = 1; \n<div>{', 1, 6);

// 3. Attribute Value
testCompletion('Attribute Type', '<input type="', 0, 13);

// 4. Generic Attributes
testCompletion('Generic Attributes', '<div ', 0, 5);

// 5. Script Completion
testCompletion('JS Script', '<script>\n  let local = 1;\n  ', 2, 2);
