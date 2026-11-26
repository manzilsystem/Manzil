const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const crud = fs.readFileSync('js/crud.js', 'utf8');

test('resident form validates owner and tenant phones with the field named', () => {
    assert.match(crud, /function validateResidentPhoneFields\(requireOwnerPhone\)/);
    assert.match(crud, /\{ id: 'residentPhone', label: 'هاتف المالك', active: true \}/);
    assert.match(crud, /\{ id: 'residentTenantPhone', label: 'هاتف المستأجر', active: isRented \}/);
    assert.match(crud, /field\.focus\(\)/);
    assert.match(crud, /return validateResidentPhoneFields\(false\);/);
    assert.match(crud, /if \(!validateResidentPhoneFields\(true\)\) return;/);
});

test('submit keeps a safety net for both phones and uses one international hint', () => {
    assert.match(crud, /toast\('هاتف المالك غير صحيح\. ' \+ RESIDENT_PHONE_HINT/);
    assert.match(crud, /isRented && tenantPhone && !normalizeOwnerPhone\(tenantPhone\)/);
    assert.match(crud, /RESIDENT_PHONE_HINT = 'اكتب رقمًا مصريًا \(01012345678\) أو دوليًا يبدأ بـ \+'/);
});
