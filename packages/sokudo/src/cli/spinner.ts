// ============================================================================
// FILE: src/cli/utils/spinner.ts
// Loading spinner for long operations
// ============================================================================
import pc from 'picocolors';
export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private intervalId: Timer | null = null;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start() {
    process.stdout.write('\x1B[?25l'); // Hide cursor

    this.intervalId = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      process.stdout.write(`\r${pc.cyan(frame)} ${this.message}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  succeed(message?: string) {
    this.stop();
    console.log(pc.green('✔'), message || this.message);
  }

  fail(message?: string) {
    this.stop();
    console.log(pc.red('✖'), message || this.message);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    process.stdout.write('\r\x1B[K'); // Clear line
    process.stdout.write('\x1B[?25h'); // Show cursor
  }

  updateMessage(message: string) {
    this.message = message;
  }
}
