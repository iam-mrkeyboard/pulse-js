
import { PulseDefinitionEngine, FileSystem } from '../client/src/definition';
import * as path from 'path';

class BunFileSystem implements FileSystem {
  async exists(path: string): Promise<boolean> {
    return await Bun.file(path).exists();
  }
}

const engine = new PulseDefinitionEngine(new BunFileSystem());

async function testDefinition(desc: string, content: string, line: number, char: number, filePath: string, expectedFiles: string[] = []) {
  const lines = content.split('\n');
  let offset = 0;
  for (let i = 0; i < line; i++) {
    offset += lines[i].length + 1;
  }
  offset += char;

  // Simulate word selection (naive)
  const lineText = lines[line];
  // assume char is inside the word
  let start = char;
  while (start > 0 && /[a-zA-Z0-9_$]/.test(lineText[start - 1])) start--;
  let end = char;
  while (end < lineText.length && /[a-zA-Z0-9_$]/.test(lineText[end])) end++;
  const word = lineText.slice(start, end);

  // Mock file existence for absolute paths logic?
  // The engine uses fs.promises.access. 
  // We can't easily mock fs here without overriding global or module.
  // However, for STATE variables, it doesn't check FS.
  // For IMPORTS, it checks FS.
  // We will test STATE variables primarily here, and structure/logic of Component resolution (path generation) if possible.

  console.log(`\nTest: ${desc}`);
  console.log(`Input: "${lineText.substring(0, char)}|${lineText.substring(char)}"`);
  console.log(`Word: "${word}"`);

  // Debug
  const parser = (engine as any).parser;
  const imports = parser.extractImports(content);
  console.log(`Debug Imports: ${JSON.stringify(imports)}`);

  const loc = await engine.getDefinition(content, offset, filePath, word);

  if (loc) {
    console.log(`Found Definition: URI=${loc.uri}, Range=${loc.range.start.line}:${loc.range.start.character}`);
  } else {
    console.log('No definition found.');
  }
}

// 1. State Definition
const stateCode = `
let count = 0;
<button>{count}</button>
`;
// Definition of count is at line 1
// Usage is at line 2
testDefinition('State Variable Lookup', stateCode, 2, 9, '/mock/path/current.pulse'); // inside {count}

// 2. Component Lookup
const tempDir = path.join(process.cwd(), 'scripts', 'temp_verify');
const componentPath = path.join(tempDir, 'Button.pulse');
const mainPath = path.join(tempDir, 'app.pulse');

// Ensure temp dir exists (using Bun APIs as requested/available in this script environment)
// Actually standard FS is easier for setup in a script, but we can use Bun.write
await Bun.write(componentPath, '<button>Click</button>');

const compCode = `
import Button from './Button.pulse';
<Button />
`;

// Run test causing lookup relative to mainPath
// The engine will resolve ./Button.pulse relative to mainPath -> componentPath
// And check fs.exists(componentPath) -> Should pass
await testDefinition('Component Import', compCode, 2, 2, mainPath, [componentPath]);

// Cleanup (optional, or leave for debug)
// await fs.promises.rm(tempDir, { recursive: true, force: true }); 

