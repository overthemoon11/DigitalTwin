/**
 * Convert LaTeX \[ \] and \( \) math in operator docs to plain Unicode / code
 * so formulas render in standard Markdown viewers (no MathJax required).
 */
import fs from 'fs';
import path from 'path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/convert-doc-math.mjs <file.md> ...');
  process.exit(1);
}

function convertLatexExpr(expr) {
  let s = expr.trim();
  s = s.replace(/\\dot\{([^}]+)\}/g, (_, c) => {
    if (c === 'V') return 'V̇';
    if (c === 'm') return 'ṁ';
    if (c === 'Q') return 'Q̇';
    return `${c}̇`;
  });
  s = s.replace(/\\text\{([^}]*)\}/g, '$1');
  s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1');
  while (s.includes('\\frac')) {
    s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  }
  s = s.replace(/\\left|\\right|\\bigl|\\bigr|\\Bigl|\\Bigr/g, '');
  s = s.replace(/\\cdot/g, '·');
  s = s.replace(/\\times/g, '×');
  s = s.replace(/\\Delta\s*/g, 'Δ');
  s = s.replace(/\\rho/g, 'ρ');
  s = s.replace(/\\varepsilon/g, 'ε');
  s = s.replace(/\\tau/g, 'τ');
  s = s.replace(/\\propto/g, '∝');
  s = s.replace(/\\lceil/g, '⌈');
  s = s.replace(/\\rceil/g, '⌉');
  s = s.replace(/\\max/g, 'max');
  s = s.replace(/\\min/g, 'min');
  s = s.replace(/\\ln/g, 'ln');
  s = s.replace(/\\exp/g, 'exp');
  s = s.replace(/\\approx/g, '≈');
  s = s.replace(/\\geq/g, '≥');
  s = s.replace(/\\leq/g, '≤');
  s = s.replace(/\\mathrel\{\+?=\}/g, '+=');
  s = s.replace(/\\qquad/g, '; ');
  s = s.replace(/\\quad/g, ' ');
  s = s.replace(/\\;/g, ' ');
  s = s.replace(/\\,/g, ' ');
  s = s.replace(/\\circ/g, '°');
  s = s.replace(/\_\{([^}]+)\}/g, '_$1');
  s = s.replace(/\^\{([^}]+)\}/g, (_, p) => {
    if (p === '2') return '²';
    if (p === '3') return '³';
    if (p === '-1') return '⁻¹';
    return `^(${p})`;
  });
  s = s.replace(/\^\\circ/g, '°');
  s = s.replace(/Δ\s+T/g, 'ΔT');
  s = s.replace(/\^°C/g, ' °C');
  s = s.replace(/\\\s+\^/g, ' ');
  s = s.replace(/\s+/g, ' ');
  return s.trim();
}

function cleanupConverted(content) {
  let out = content;
  while (out.includes('\\frac')) {
    out = out.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  }
  out = out.replace(/\\qquad/g, '; ');
  out = out.replace(/\\quad/g, ' ');
  out = out.replace(/\\mathrel\{\+?=\}/g, '+=');
  out = out.replace(/\\bigl|\\bigr|\\Bigl|\\Bigr/g, '');
  out = out.replace(/\\circ/g, '°');
  out = out.replace(/\\ /g, ' ');
  out = out.replace(/Δ\s+T/g, 'ΔT');
  out = out.replace(/\^°C/g, ' °C');
  out = out.replace(/\\\s+\^/g, ' ');
  return out;
}

function convertFile(content) {
  let out = content.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expr) => {
    const plain = convertLatexExpr(expr);
    return `\n\`\`\`text\n${plain}\n\`\`\`\n`;
  });
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_, expr) => {
    const plain = convertLatexExpr(expr);
    return `\`${plain}\``;
  });
  return cleanupConverted(out);
}

for (const file of files) {
  const abs = path.resolve(file);
  const before = fs.readFileSync(abs, 'utf8');
  const after = cleanupConverted(convertFile(before));
  if (before !== after) {
    fs.writeFileSync(abs, after, 'utf8');
    console.log('Converted:', abs);
  } else {
    console.log('No changes:', abs);
  }
}
