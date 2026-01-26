
import { PulseValidator, ValidationSeverity } from '../client/src/validator';

const code = `
<script>
  let x = 10;
  const arr = [
     x, // defined
     undefinedVar // should be error
  ];
  console.log(x); // Global + defined
</script>
<div></div>
`;

const validator = new PulseValidator();

(async () => {
  // Debug
  const p = (validator as any).parser;
  const dbgRoot = p.parse(code);
  console.log('R:', dbgRoot.children?.map((c: any) => `${c.type}<${c.tag}>`));
  const sc = dbgRoot.children?.find((c: any) => c.tag === 'script');
  console.log('Script Content:', sc?.children?.[0]?.content);

  const errors = await validator.validate(code);
  const syntaxErrors = errors.filter(e => e.code === 'PULSE020' || e.code === 'PULSE021');

  if (syntaxErrors.length > 0) {
    console.log('✅ Syntax/Semantic validation working!');
    syntaxErrors.forEach(e => console.log(`[${e.range.start}] ${e.message}`));
  } else {
    console.log('❌ Syntax validation FAILED. No errors found.');
    console.log('All errors:', errors);
  }
})();
