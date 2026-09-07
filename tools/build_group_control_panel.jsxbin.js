'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const bundleScript = path.join(__dirname, 'build_group_control_panel_bundle.js');
const inputPath = path.join(projectRoot, 'build', 'distribution', 'NGS_GroupControl.jsx');
const outputPath = path.join(projectRoot, 'build', 'distribution', 'NGS_GroupControl.jsxbin');

const bundle = spawnSync(process.execPath, [bundleScript, inputPath], { stdio: 'inherit' });
if (bundle.status !== 0) process.exit(bundle.status || 1);

const result = spawnSync('npx.cmd', [ '--yes', 'jsxbin', '-i', inputPath, '-o', outputPath, '-v' ], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
});
if (result.error) {
  console.error('JSXBIN compiler could not be started:', result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
if (!fs.existsSync(outputPath)) {
  console.error('JSXBIN compiler did not create:', outputPath);
  process.exit(1);
}
console.log(`Wrote ${outputPath}`);
