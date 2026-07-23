require('dotenv').config();
const pgPath = 'D:/code-for-life/projects/nawa-inspira-digital/products/inspira-pos/ipos-v2/ipos-cloud/node_modules/.pnpm/pg@8.22.0/node_modules/pg';
const { Client } = require(pgPath);

const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(async () => {
  console.log('DB connected OK');
  const tenants = await c.query('select id, name, plan from inspirapos.tenants limit 5').catch(e => ({ error: e.message }));
  console.log('tenants:', JSON.stringify(tenants.rows || tenants.error));
  const tables = await c.query("select table_name from information_schema.tables where table_schema='inspirapos' order by table_name");
  console.log('tables:', tables.rows.map(r => r.table_name).join(', '));
  await c.end();
}).catch(e => { console.error('DB ERROR:', e.message); process.exit(1); });
