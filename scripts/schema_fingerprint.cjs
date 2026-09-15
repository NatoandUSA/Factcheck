'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage', '.cache']);
const EXCLUDED_RELEASE_ROOT_FILES = new Set(['MANIFEST.json', 'REVISION']);
const MAX_RUNTIME_SCAN_BYTES = 2 * 1024 * 1024;
const DDL_PATTERN = /\b(?:CREATE\s+(?:(?:TEMP|TEMPORARY)\s+)?(?:(?:VIRTUAL\s+)?TABLE|VIEW|(?:UNIQUE\s+)?INDEX|TRIGGER)|ALTER\s+(?:TABLE|VIEW)|DROP\s+(?:TABLE|VIEW|INDEX|TRIGGER))\b|\bPRAGMA\s+(?:writable_schema|legacy_alter_table)\b|\bstateColumnSql\b/i;
const DEFAULT_MANIFEST = path.join(__dirname, 'schema_authority_manifest.json');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relativePath = (root, absolute) => path.relative(root, absolute).split(path.sep).join('/');

function entryBytes(absolute) {
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) return Buffer.from(`SYMLINK\0${fs.readlinkSync(absolute)}`);
  if (!stat.isFile()) throw new Error(`SCHEMA_FINGERPRINT_ENTRY_INVALID:${absolute}`);
  return fs.readFileSync(absolute);
}

function walkRelease(root) {
  const entries = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (directory === root && EXCLUDED_RELEASE_ROOT_FILES.has(entry.name)) continue;
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) {
        entries.push({ path: relativePath(root, absolute), sha256: sha256(entryBytes(absolute)) });
      }
    }
  };
  visit(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function resolveDependency(root, fromFile, request) {
  if (!request.startsWith('.')) return null;
  const unresolved = path.resolve(path.dirname(fromFile), request);
  const candidates = [unresolved, ...['.js', '.cjs', '.mjs', '.json'].map(ext => `${unresolved}${ext}`),
    ...['index.js', 'index.cjs', 'index.mjs', 'index.json'].map(name => path.join(unresolved, name))];
  const resolved = candidates.find(candidate => fs.existsSync(candidate) && fs.lstatSync(candidate).isFile());
  if (!resolved) throw new Error(`SCHEMA_DEPENDENCY_UNRESOLVED:${relativePath(root, fromFile)}:${request}`);
  if (path.relative(root, resolved).startsWith('..')) throw new Error('SCHEMA_DEPENDENCY_PATH_ESCAPE');
  return resolved;
}

function dependencyRequests(bytes) {
  const source = bytes.toString('utf8');
  const requests = [];
  const callPattern = /\b(?:require|import)\s*\(([^)]*)\)/g;
  let call;
  while ((call = callPattern.exec(source))) {
    const literal = call[1].trim().match(/^(["'])([^"']+)\1$/);
    if (!literal) throw new Error('SCHEMA_DYNAMIC_DEPENDENCY_FORBIDDEN');
    requests.push(literal[2]);
  }
  const patterns = [/\bfrom\s+["']([^"']+)["']/g, /\bimport\s*["']([^"']+)["']/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) requests.push(match[1]);
  }
  return requests;
}

function loadManifest(manifestPath) {
  const bytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.includeTrees)
    || !Array.isArray(manifest.includeFiles) || !Array.isArray(manifest.excludeFiles)
    || !Array.isArray(manifest.runtimeSchemaScanTrees) || manifest.runtimeSchemaSymlinkPolicy !== 'FORBID'
    || !manifest.bootstrapExtraction) {
    throw new Error('SCHEMA_AUTHORITY_MANIFEST_INVALID');
  }
  return { bytes, manifest };
}

function assertNoUnclassifiedRuntimeDdl(root, selected, manifest) {
  const bootstrapPath = path.resolve(root, manifest.bootstrapExtraction.path);
  const visit = absolute => {
    if (!fs.existsSync(absolute)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`SCHEMA_RUNTIME_SYMLINK_FORBIDDEN:${relativePath(root, absolute)}`);
    if (stat.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(path.basename(absolute))) return;
      for (const entry of fs.readdirSync(absolute)) visit(path.join(absolute, entry));
      return;
    }
    if (!stat.isFile() || selected.has(absolute) || absolute === bootstrapPath) return;
    if (stat.size > MAX_RUNTIME_SCAN_BYTES) {
      throw new Error(`SCHEMA_RUNTIME_FILE_TOO_LARGE:${relativePath(root, absolute)}`);
    }
    const bytes = fs.readFileSync(absolute);
    if (bytes.includes(0)) {
      throw new Error(`SCHEMA_RUNTIME_BINARY_FORBIDDEN:${relativePath(root, absolute)}`);
    }
    if (DDL_PATTERN.test(bytes.toString('utf8'))) {
      throw new Error(`UNCLASSIFIED_SCHEMA_AUTHORITY:${relativePath(root, absolute)}`);
    }
  };
  for (const scanTree of manifest.runtimeSchemaScanTrees) {
    const scanRoot = path.resolve(root, scanTree);
    if (path.relative(root, scanRoot).startsWith('..')) throw new Error('SCHEMA_RUNTIME_SCAN_PATH_ESCAPE');
    if (!fs.existsSync(scanRoot) || !fs.lstatSync(scanRoot).isDirectory()) {
      throw new Error(`SCHEMA_RUNTIME_SCAN_TREE_MISSING:${scanTree}`);
    }
    visit(scanRoot);
  }
}

function collectSchemaFiles(root, manifest) {
  const selected = new Set();
  const excluded = new Set(manifest.excludeFiles.map(file => {
    const absolute = path.resolve(root, file);
    if (path.relative(root, absolute).startsWith('..')) throw new Error('SCHEMA_AUTHORITY_EXCLUDE_PATH_ESCAPE');
    return absolute;
  }));
  const add = absolute => {
    const resolved = path.resolve(absolute);
    if (path.relative(root, resolved).startsWith('..')) throw new Error('SCHEMA_AUTHORITY_PATH_ESCAPE');
    if (excluded.has(resolved)) return;
    if (!fs.existsSync(resolved)) {
      selected.add(resolved);
      return;
    }
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink()) throw new Error(`SCHEMA_AUTHORITY_SYMLINK_FORBIDDEN:${relativePath(root, resolved)}`);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) add(path.join(resolved, entry.name));
      return;
    }
    if (stat.isFile()) selected.add(resolved);
  };
  for (const directory of manifest.includeTrees) add(path.join(root, directory));
  for (const file of manifest.includeFiles) add(path.join(root, file));

  const queue = [...selected];
  while (queue.length) {
    const current = queue.shift();
    if (!fs.existsSync(current) || !/\.(?:js|cjs|mjs)$/i.test(current)) continue;
    for (const request of dependencyRequests(fs.readFileSync(current))) {
      const dependency = resolveDependency(root, current, request);
      if (dependency && !selected.has(dependency)) {
        selected.add(dependency);
        queue.push(dependency);
      }
    }
  }
  return selected;
}

function extractBootstrap(root, extraction) {
  const absolute = path.join(root, extraction.path);
  const source = fs.readFileSync(absolute, 'utf8');
  const start = source.indexOf(extraction.startMarker);
  const end = source.indexOf(extraction.endMarker, start + extraction.startMarker.length);
  if (start < 0 || end <= start) throw new Error('SCHEMA_BOOTSTRAP_MARKERS_INVALID');
  const segment = source.slice(start, end);
  if (!DDL_PATTERN.test(segment)) throw new Error('SCHEMA_BOOTSTRAP_DDL_MISSING');
  const outside = `${source.slice(0, start)}${source.slice(end)}`;
  if (DDL_PATTERN.test(outside)) throw new Error('UNCLASSIFIED_SERVER_SCHEMA_AUTHORITY');
  return { path: `${extraction.path}#bootstrap-schema`, sha256: sha256(Buffer.from(segment)) };
}

function schemaFingerprint(releaseRoot, options = {}) {
  const root = path.resolve(releaseRoot);
  if (!fs.statSync(root).isDirectory()) throw new Error('SCHEMA_FINGERPRINT_ROOT_INVALID');
  const manifestPath = path.resolve(options.manifestPath || DEFAULT_MANIFEST);
  const { bytes: manifestBytes, manifest } = loadManifest(manifestPath);
  const selected = collectSchemaFiles(root, manifest);
  assertNoUnclassifiedRuntimeDdl(root, selected, manifest);
  const files = [{ path: 'scripts/schema_authority_manifest.json', sha256: sha256(manifestBytes) }];
  for (const absolute of selected) {
    const relative = relativePath(root, absolute);
    files.push(fs.existsSync(absolute)
      ? { path: relative, sha256: sha256(entryBytes(absolute)) }
      : { path: relative, sha256: sha256(Buffer.from('MISSING')) });
  }
  files.push(extractBootstrap(root, manifest.bootstrapExtraction));
  files.sort((a, b) => a.path.localeCompare(b.path));

  const releaseFiles = walkRelease(root);
  const schemaAuthorityFingerprint = sha256(Buffer.from(JSON.stringify(files)));
  const releaseControlFingerprint = sha256(Buffer.from(JSON.stringify(releaseFiles)));
  const gatePolicyBytes = fs.readFileSync(path.join(__dirname, 'release_gate_policy.cjs'));
  const comparatorFingerprint = sha256(Buffer.concat([
    fs.readFileSync(__filename), Buffer.from('\0'), manifestBytes, Buffer.from('\0'), gatePolicyBytes
  ]));
  return Object.freeze({
    schemaVersion: 3,
    fingerprint: schemaAuthorityFingerprint,
    schemaAuthorityFingerprint,
    releaseControlFingerprint,
    comparatorFingerprint,
    files: Object.freeze(files),
    releaseFileCount: releaseFiles.length
  });
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify(schemaFingerprint(process.argv[2]))}\n`); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = Object.freeze({
  DDL_PATTERN,
  EXCLUDED_DIRECTORIES,
  EXCLUDED_RELEASE_ROOT_FILES,
  MAX_RUNTIME_SCAN_BYTES,
  schemaFingerprint
});
