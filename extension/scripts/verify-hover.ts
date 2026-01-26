import { PulseHoverEngine } from '../client/src/hover';

const engine = new PulseHoverEngine();

function testHover(desc: string, content: string, word: string, expectedStart: string) {
  // Find offset of word in content (simple search)
  const offset = content.indexOf(word);
  if (offset === -1) {
    console.log(`\nTest: ${desc} -> SETUP ERROR: Word not found`);
    return;
  }

  const hover = engine.getHover(content, offset, word);
  console.log(`\nTest: ${desc}`);
  if (hover) {
    // Just print first line of content for verification
    const firstLine = hover.contents[0].split('\n')[0];
    console.log(`Found: ${firstLine}...`);

    if (hover.contents.some(c => c.includes(expectedStart))) {
      console.log('✅ PASS');
    } else {
      console.log(`❌ FAIL. Expected to contain "${expectedStart}"`);
      console.log('Got:', hover.contents);
    }
  } else {
    console.log('❌ FAIL. No hover found.');
  }
}

// 1. Primitive
testHover('Primitive List', '<List each={items}></List>', 'List', 'Pulse: List');

// 2. Component (Imported)
// Mock parser import extraction or rely on real parsing if simple
const compCode = `
import Button from './Button.pulse';
<Button />
`;
testHover('Component Import', compCode, 'Button', '**Component**');

// 3. HTML (Lowecase)
testHover('HTML Div', '<div></div>', 'div', 'Generic container');

// 4. State Variable
const stateCode = `
let count = 0;
<button>{count}</button>
`;
// Need to find usage of count
const valOffset = stateCode.indexOf('{count}') + 1; // inside {
const valHover = engine.getHover(stateCode, valOffset, 'count');
console.log('\nTest: State Variable');
if (valHover && valHover.contents[1] === '**Reactive State Variable**') {
  console.log('✅ PASS');
} else {
  console.log('❌ FAIL');
}

// 5. Attribute
testHover('Attribute Class', '<div class="foo">', 'class', 'Space-separated CSS');
