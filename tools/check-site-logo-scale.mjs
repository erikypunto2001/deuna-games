import assert from 'node:assert/strict';
import { frontendSiteConfigFormSchema } from '../src/lib/admin/frontend-content-forms.ts';
import { editorialSiteConfigSchema } from '../src/lib/admin/content-validation.ts';
import { siteConfig } from '../src/lib/site.ts';


const form = {...siteConfig, expectedRevision: '1', logoAsset: ''};
for (const scale of [50, 100, 137, 200]) {
  const parsed = frontendSiteConfigFormSchema.parse({...form, logoScale: String(scale)});
  assert.equal(parsed.logoScale, scale);
  const {expectedRevision, ...payload} = parsed;
  assert.equal(expectedRevision, 1);
  assert.equal(editorialSiteConfigSchema.parse(JSON.parse(JSON.stringify(payload))).logoScale, scale);
}
for (const scale of ['', '0', '49', '201', '100.5', 'abc', 'Infinity']) {
  assert.equal(frontendSiteConfigFormSchema.safeParse({...form, logoScale: scale}).success, false);
}
const {logoScale, ...legacy} = siteConfig;
assert.equal(logoScale, 100);
assert.equal(editorialSiteConfigSchema.safeParse(legacy).success, true);
console.log('Logo size: OK (form conversion, validation, serialized payload and legacy payload compatibility).');