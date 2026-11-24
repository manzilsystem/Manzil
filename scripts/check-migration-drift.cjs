'use strict';

// Compares the migration versions applied to the hosted Supabase project with
// the files committed in supabase/migrations. It is deliberately read-only:
// a remote version without a local file is the drift that breaks deployments.
// A local file that is not remote yet is a pending forward migration, so it is
// reported as information rather than treated as a failure.
//
// Usage: node scripts/check-migration-drift.cjs [remote-versions.txt]
// With no argument the versions are read from stdin (one version per line).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const VERSION_PATTERN = /^\d+$/;

function readLocalFiles(migrationsDir = MIGRATIONS_DIR) {
    return fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
}

function versionOf(filename) {
    const match = /^(\d+)_/.exec(filename);
    return match ? match[1] : null;
}

function readRemoteVersions(source) {
    return source.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

function compare(remoteSource, localFiles) {
    const remote = readRemoteVersions(remoteSource);
    const invalid = remote.filter(version => !VERSION_PATTERN.test(version));
    const localVersions = localFiles.map(versionOf);
    const invalidLocal = localFiles.filter((file, index) => localVersions[index] === null);
    const validLocalVersions = localVersions.filter(version => version !== null);

    const remoteSet = new Set(remote);
    const localSet = new Set(validLocalVersions);
    const duplicates = [...localSet].filter(version =>
        validLocalVersions.filter(value => value === version).length > 1);

    return {
        remote,
        localFiles,
        invalid,
        invalidLocal,
        duplicates,
        missingLocally: remote.filter(version => !localSet.has(version)),
        pendingRemotely: validLocalVersions.filter(version => !remoteSet.has(version)),
    };
}

function report(result) {
    console.log(`Remote migration versions: ${result.remote.length}`);
    console.log(`Local migration files: ${result.localFiles.length}`);

    for (const version of result.pendingRemotely) {
        console.log(`INFO pending migration: ${version} is not applied to the hosted project yet`);
    }

    const problems = [];
    if (result.invalid.length) problems.push(`invalid remote version values: ${result.invalid.join(', ')}`);
    if (result.invalidLocal.length) problems.push(`local files without a numeric version: ${result.invalidLocal.join(', ')}`);
    if (result.duplicates.length) problems.push(`duplicated local versions: ${result.duplicates.join(', ')}`);
    if (result.missingLocally.length) {
        problems.push(`remote versions missing a local migration file: ${result.missingLocally.join(', ')}`);
    }

    if (!problems.length) {
        console.log('OK hosted migration history matches the committed migration files');
        return 0;
    }

    for (const problem of problems) console.error(`FAIL ${problem}`);
    console.error('Add the missing local migration files with the exact remote version numbers; do not edit the hosted schema_migrations table.');
    return 1;
}

function main() {
    const file = process.argv[2];
    const source = file ? fs.readFileSync(path.resolve(process.cwd(), file), 'utf8') : fs.readFileSync(0, 'utf8');
    process.exitCode = report(compare(source, readLocalFiles()));
}

if (require.main === module) main();

module.exports = { VERSION_PATTERN, compare, readLocalFiles, readRemoteVersions, report, versionOf };
