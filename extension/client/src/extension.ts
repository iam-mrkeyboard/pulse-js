import * as vscode from 'vscode';
import * as path from 'path';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';


const PULSE_MODE: vscode.DocumentFilter = { language: 'pulse', scheme: 'file' };

// Decoration for state variables
let stateDecorationType: vscode.TextEditorDecorationType;
let client: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
  console.log('⚡ Pulse Framework extension activated!');

  console.log('⚡ Pulse Framework extension activated!');

  // Decoration for reactive state variables
  // Wait, I need to pass it to constructor.

  // ... (re-reading context)
  // Re-instantiate properly.

  // Actually, replace instantiation at line 17 and correct usage at line 94.
  // Since I need to replace line 17 AND 94, I should use MULTI replace or structure carefully.
  // I'll do multi replace. But wait, I'm constrained to replace_file_content rules.
  // I'll replace instantiation here and then update usage in next chunk or ensure range covers both?
  // They are far apart (line 17 vs 94).
  // I will use multi_replace_file_content to handle both sites cleanly.
  // Wait, I clicked 'replace_file_content' button. I should have used multi_replace.
  // I will use multi_replace_file_content appropriately.

  // Abort this call logic, I'll use multi_replace.

  // Wait, I can't abort. I must provide valid arguments. I will use replace_file_content for line 17 first.

  // Wait, let's look at the provided tool.
  // I will just fix instantiation first.
  // line 17: const diagnosticsProvider = new PulseDiagnosticsProvider();
  // -> const diagnosticsProvider = new PulseDiagnosticsProvider(diagnosticCollection);

  // But wait, `diagnosticCollection` is defined on line 18-19. I cannot use it before declaration.
  // I must move instantiation after `diagnosticCollection` creation.

  // Original:
  // 17:   const diagnosticsProvider = new PulseDiagnosticsProvider();
  // 18:   const diagnosticCollection =
  // 19:     vscode.languages.createDiagnosticCollection('pulse');

  // New:
  // const diagnosticCollection = vscode.languages.createDiagnosticCollection('pulse');
  // const diagnosticsProvider = new PulseDiagnosticsProvider(diagnosticCollection);

  // Okay. I'll replace lines 17-19.



  // Create decoration for reactive state variables
  stateDecorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none',
    borderRadius: '2px',
    backgroundColor: 'rgba(78, 201, 176, 0.1)',
    border: '1px solid rgba(78, 201, 176, 0.3)',
    light: {
      backgroundColor: 'rgba(78, 201, 176, 0.15)',
      border: '1px solid rgba(78, 201, 176, 0.4)',
    },
  });







  function updateDecorations(editor: vscode.TextEditor) {
    if (!editor || editor.document.languageId !== 'pulse') return;

    const text = editor.document.getText();
    const stateDecorations: vscode.DecorationOptions[] = [];

    // Find all state variable usages
    const regex = /\bstate\.(\w+)/g;
    let match;

    while ((match = regex.exec(text))) {
      const startPos = editor.document.positionAt(match.index);
      const endPos = editor.document.positionAt(match.index + match[0].length);

      const decoration: vscode.DecorationOptions = {
        range: new vscode.Range(startPos, endPos),
        hoverMessage: new vscode.MarkdownString(
          `**Pulse Reactive State**\n\nVariable: \`${match[1]}\`\n\nChanges to this variable automatically update the UI.`,
        ),
      };

      stateDecorations.push(decoration);
    }

    editor.setDecorations(stateDecorationType, stateDecorations);
  }

  // Update on active editor change
  if (vscode.window.activeTextEditor) {
    updateDecorations(vscode.window.activeTextEditor);
  }



  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('pulse.createComponent', createComponent),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pulse.createPage', createPage),
  );

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = '⚡ Pulse';
  statusBarItem.tooltip = 'Pulse Framework Active';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Start the client. This will also launch the server
  const serverModule = context.asAbsolutePath(
    path.join('out', 'server.js')
  );
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'pulse' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
    }
  };

  client = new LanguageClient(
    'pulseLanguageServer',
    'Pulse Language Server',
    serverOptions,
    clientOptions
  );

  client.start();
}

async function createComponent() {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter component name',
    placeHolder: 'MyComponent',
    validateInput: (value) => {
      if (!value) return 'Component name is required';
      if (!/^[A-Z]/.test(value))
        return 'Component name must start with uppercase';
      return null;
    },
  });

  if (name) {
    const template = `<style>
  .${name.toLowerCase()} {
    /* Component styles */
  }
</style>

<div class="${name.toLowerCase()}">
  <h2>${name}</h2>
</div>`;

    const doc = await vscode.workspace.openTextDocument({
      language: 'pulse',
      content: template,
    });
    vscode.window.showTextDocument(doc);
  }
}

async function createPage() {
  const name = await vscode.window.showInputBox({
    prompt: 'Enter page name',
    placeHolder: 'about',
    validateInput: (value) => {
      if (!value) return 'Page name is required';
      if (!/^[a-z]/.test(value)) return 'Page name should be lowercase';
      return null;
    },
  });

  if (name) {
    const template = `import Layout from '../layouts/BaseLayout.pulse';

<style>
  .${name}-page {
    padding: 40px;
  }
</style>

let title = '${name.charAt(0).toUpperCase() + name.slice(1)}';

<div class="${name}-page">
  <title>{title}</title>
  <meta name="description" content="${name} page" />
  
  <h1>{title}</h1>
</div>`;

    const doc = await vscode.workspace.openTextDocument({
      language: 'pulse',
      content: template,
    });
    vscode.window.showTextDocument(doc);
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (stateDecorationType) {
    stateDecorationType.dispose();
  }
  if (!client) {
    return undefined;
  }
  return client.stop();
}
