#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log("Usage: node manage.js <command> [args...]");
  console.log("Available commands: makemigrations, migrate, createsuperuser, startapp");
  process.exit(1);
}

const validCommands = ['makemigrations', 'migrate', 'createsuperuser', 'startapp'];

if (!validCommands.includes(command)) {
  console.log(`Unknown command: ${command}`);
  process.exit(1);
}

const apiPath = path.join(__dirname, 'api');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const child = spawn(npmCommand, ['run', command, '--', ...args.slice(1)], {
  cwd: apiPath,
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  process.exit(code);
});
