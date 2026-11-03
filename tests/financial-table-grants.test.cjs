const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261103172000_revoke_direct_financial_table_writes.sql'),
    'utf8'
);
const client = fs.readFileSync(path.join(root, 'js/supabase.js'), 'utf8');

test('resident, income and expense writes are restricted to the atomic persistence RPC', () => {
    assert.match(
        migration,
        /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*ON TABLE public\.residents, public\.income, public\.expenses[\s\S]*FROM PUBLIC, anon, authenticated/i
    );
    assert.match(client, /supabaseClient\.rpc\('persist_building_snapshot'/);
    assert.doesNotMatch(
        client,
        /from\(['"](?:residents|income|expenses)['"]\)[\s\S]{0,180}?\.(?:insert|update|upsert|delete)\(/i
    );
});
