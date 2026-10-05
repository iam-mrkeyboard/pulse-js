#!/usr/bin/env bun
// Stable CLI entry: exists before `dist/` is built so workspace installs can link it.
import "../dist/cli/index.js";
