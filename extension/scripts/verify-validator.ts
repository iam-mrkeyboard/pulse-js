
import * as fs from 'fs';
import { PulseValidator, ValidationSeverity } from '../client/src/validator';

const validator = new PulseValidator();

const fileContent = `
let count = 0;
<div class="test">
  <span>Unclosed span
  <button onclick="handle()">Click</button>
  <div className="oops"></div>
  <p>{state.missing}</p> 
</div>`;

(async () => {
  const errors = await validator.validate(fileContent);

  console.log('--- Validation Results ---');
  errors.forEach(err => {
    const severity = ValidationSeverity[err.severity];
    console.log(`[${severity}] ${err.message} (Line: ? Code: ${err.code})`);
  });

  if (errors.length === 0) {
    console.log('No errors found (Unexpected!)');
  } else {
    console.log(`\nFound ${errors.length} issues.`);
  }
})();
