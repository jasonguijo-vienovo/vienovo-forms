const pages = [
  { path: '/admin/lookups', mustInclude: ['Scan roles', 'Add from approver role', 'Add value'] },
  { path: '/admin/approvers', mustInclude: ['Add approver'] },
  { path: '/admin/forms', mustInclude: ['Form registry', 'Save changes'] },
  { path: '/forms', mustInclude: ['Request forms'] },
];

const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

async function run() {
  let failed = false;

  for (const page of pages) {
    const url = `${base}${page.path}`;
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const text = await res.text();
      if (res.status >= 400) {
        console.error(`FAIL ${page.path}: HTTP ${res.status}`);
        failed = true;
        continue;
      }

      for (const token of page.mustInclude) {
        if (!text.includes(token)) {
          console.error(`FAIL ${page.path}: missing text "${token}"`);
          failed = true;
        }
      }

      if (!failed) {
        console.log(`OK   ${page.path}`);
      }
    } catch (error) {
      console.error(`FAIL ${page.path}: ${(error && error.message) || error}`);
      failed = true;
    }
  }

  if (failed) process.exit(1);
  console.log('Smoke checks passed.');
}

run();
