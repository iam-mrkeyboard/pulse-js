// ============================================================================
// FILE: src/cli/commands/dev.ts - FULLY FIXED
// ============================================================================

import pc from 'picocolors';
import type { PulseConfig } from '../../bundler/types';
import { DevServer } from '../../server/dev-server';

export async function devCommand(config: PulseConfig): Promise<void> {
  console.log(pc.bold(pc.magenta('\n⚡ Pulse v5.0 Development Server\n')));

  const server = new DevServer(config);
  await server.start();

  const port = config.devServer.port;

  console.log(pc.gray('  Local:    ') + pc.cyan(`http://localhost:${port}`));
  console.log(pc.gray('  Network:  ') + pc.cyan(`http://0.0.0.0:${port}`));
  console.log(
    pc.gray('  HMR:      ') +
      (config.devServer.hmr ? pc.green('Enabled') : pc.red('Disabled')),
  );
  console.log(pc.gray('  Source:   ') + pc.white(config.srcDir));

  console.log('\n' + pc.gray('Press Ctrl+C to stop\n'));
}
