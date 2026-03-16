/**
 * AST No-Network Audit Core
 *
 * Shared analysis logic for the AST-based no-network audit.
 * Single source of truth for all forbidden-pattern rules.
 */

import ts from 'typescript';

// -------------------------------------------------------------------------
// Forbidden patterns (AST-level)
// -------------------------------------------------------------------------

export const FORBIDDEN_MODULES = new Set([
  'http',
  'node:http',
  'https',
  'node:https',
  'net',
  'node:net',
  'tls',
  'node:tls',
  'dgram',
  'node:dgram',
  'http2',
  'node:http2',
  'child_process',
  'node:child_process',
  'dns',
  'node:dns',
  'undici',
  'node-fetch',
  'axios',
  'got',
  'ky',
  'superagent',
]);

export const FORBIDDEN_GLOBAL_CALLS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
]);

export const FORBIDDEN_PROPERTY_BASES = new Map<string, Set<string>>([
  ['globalThis', new Set(['fetch'])],
  ['window', new Set(['fetch'])],
  ['global', new Set(['fetch'])],
]);

export const FORBIDDEN_CONSTRUCTORS = new Set(['WebSocket', 'XMLHttpRequest', 'EventSource']);

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface Violation {
  file: string;
  line: number;
  column: number;
  kind: string;
  detail: string;
}

// -------------------------------------------------------------------------
// AST analysis
// -------------------------------------------------------------------------

function getPosition(sourceFile: ts.SourceFile, pos: number): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, column: character + 1 };
}

/**
 * Audit a single TypeScript source string for network I/O patterns.
 * Returns an array of violations (empty = clean).
 */
export function auditSourceText(sourceText: string, filePath: string = 'input.ts'): Violation[] {
  const violations: Violation[] = [];
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true
  );

  function addViolation(node: ts.Node, kind: string, detail: string) {
    const pos = getPosition(sourceFile, node.getStart(sourceFile));
    violations.push({ file: filePath, line: pos.line, column: pos.column, kind, detail });
  }

  function visit(node: ts.Node) {
    // 1. Import declarations: import ... from 'module'
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly) return;
      const specifier = node.moduleSpecifier;
      if (ts.isStringLiteral(specifier) && FORBIDDEN_MODULES.has(specifier.text)) {
        addViolation(node, 'import-declaration', `imports forbidden module '${specifier.text}'`);
      }
      return;
    }

    // 2. Export declarations: export { ... } from 'module'
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (node.isTypeOnly) return;
      if (
        ts.isStringLiteral(node.moduleSpecifier) &&
        FORBIDDEN_MODULES.has(node.moduleSpecifier.text)
      ) {
        addViolation(
          node,
          'export-declaration',
          `re-exports from forbidden module '${node.moduleSpecifier.text}'`
        );
      }
    }

    // 3. Require calls: require('module')
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const mod = node.arguments[0].text;
      if (FORBIDDEN_MODULES.has(mod)) {
        addViolation(node, 'require-call', `requires forbidden module '${mod}'`);
      }
    }

    // 4. Dynamic imports: import('module')
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const mod = node.arguments[0].text;
      if (FORBIDDEN_MODULES.has(mod)) {
        addViolation(node, 'dynamic-import', `dynamically imports forbidden module '${mod}'`);
      }
    }

    // 5. Forbidden global calls: fetch(), XMLHttpRequest()
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      FORBIDDEN_GLOBAL_CALLS.has(node.expression.text)
    ) {
      addViolation(node, 'forbidden-call', `calls forbidden global '${node.expression.text}()'`);
    }

    // 6. Forbidden constructors: new WebSocket(), new XMLHttpRequest()
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      FORBIDDEN_CONSTRUCTORS.has(node.expression.text)
    ) {
      addViolation(node, 'forbidden-constructor', `constructs forbidden '${node.expression.text}'`);
    }

    // 7. Forbidden property access: globalThis.fetch, window.fetch
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const obj = node.expression.text;
      const prop = node.name.text;
      const forbiddenProps = FORBIDDEN_PROPERTY_BASES.get(obj);
      if (forbiddenProps?.has(prop)) {
        addViolation(
          node,
          'forbidden-property-access',
          `accesses forbidden property '${obj}.${prop}'`
        );
      }
    }

    // 8. createServer: strong signal of server binding
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createServer'
    ) {
      addViolation(node, 'server-creation', 'calls createServer() directly');
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'createServer'
    ) {
      addViolation(
        node,
        'server-creation',
        `calls .createServer() on '${node.expression.expression.getText(sourceFile)}'`
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}
