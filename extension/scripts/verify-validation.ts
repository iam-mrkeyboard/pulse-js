
import { PulseValidator } from '../client/src/validator';
import { FileSystem } from '../client/src/validator';

// Mock FS that only finds existing files
class MockFileSystem implements FileSystem {
  async exists(path: string): Promise<boolean> {
    // For testing, only allow known paths
    if (path.endsWith('Button.pulse')) return true;
    if (path.endsWith('BaseLayout.pulse')) return true;
    return false;
  }
}

const validator = new PulseValidator(new MockFileSystem());

const code = `
import Layout from '../layouts/BaseLayout.pulse'; // Valid (mocked)
import Button from './components/Button.pulse'; // Valid (mocked)
import Missing from './components/Missing.pulse'; // Invalid
import BadExt from './components/Icon.svg'; // Extension warning (+ missing?)

<Layout>
  <Button />
  <Missing />
</Layout>
`;

async function run() {
  console.log('Running Validation Verification...');
  // Pass dummy file path for resolution context
  const errors = await validator.validate(code, '/home/user/project/src/pages/index.pulse');

  // Check for Module Not Found (PULSE001) for 'Missing'
  const missingErr = errors.find(e => e.code === 'PULSE001' && e.message.includes('Missing.pulse'));
  if (missingErr) {
    console.log('✅ PASS: Caught missing import.');
  } else {
    console.log('❌ FAIL: Did not catch missing import.');
    console.log(JSON.stringify(errors, null, 2));
  }

  // Check for Extension Warning (PULSE007)
  const extErr = errors.find(e => e.code === 'PULSE007');
  if (extErr) {
    console.log('✅ PASS: Caught invalid extension.');
  } else {
    console.log('❌ FAIL: Did not catch bad extension.');
  }
}

run();
