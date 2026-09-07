'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const panelRoot = path.join(projectRoot, 'panel');
const inputPath = path.join(panelRoot, 'GroupControl.jsx');
const defaultOutputPath = path.join(projectRoot, 'build', 'distribution', 'NGS_GroupControl.jsx');
const outputPath = path.resolve(process.argv[2] || defaultOutputPath);

const includePattern = /#include\s+["']([^"']+)["']/g;
const source = fs.readFileSync(inputPath, 'utf8');
const includedFiles = [];
const bundle = source.replace(includePattern, (directive, includeName) => {
  const includePath = path.resolve(panelRoot, includeName);
  if (path.dirname(includePath) !== panelRoot || !fs.existsSync(includePath)) {
    throw new Error(`Missing panel include: ${includeName}`);
  }
  includedFiles.push(includeName);
  return [
    `/* BEGIN INCLUDED ${includeName} */`,
    fs.readFileSync(includePath, 'utf8'),
    `/* END INCLUDED ${includeName} */`,
  ].join('\n');
});

if (/#include\s+["']/.test(bundle)) {
  throw new Error('The generated panel bundle still contains an #include directive.');
}

if (bundle.indexOf('var GroupControlPanel = buildUI(this);') === -1) {
  throw new Error('The generated panel bundle has no ScriptUI entry point.');
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, bundle, 'utf8');
process.stdout.write(`Wrote ${outputPath}\n`);
process.stdout.write(`Included: ${includedFiles.join(', ')}\n`);
