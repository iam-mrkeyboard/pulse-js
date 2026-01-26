
const Parser = require('web-tree-sitter');
const path = require('path');

async function debug() {
    await Parser.init();
    const parser = new Parser();
    const lang = await Parser.Language.load(path.join(__dirname, 'tree-sitter-html.wasm'));
    parser.setLanguage(lang);

    const code = `
<script>
  console.log()
</script>

<Navbar />
`;
    const tree = parser.parse(code);
    console.log(tree.rootNode.toString());
    
    const script = tree.rootNode.descendantForIndex(5);
    console.log('Script Node Type:', script.type);
}

debug().catch(console.error);
