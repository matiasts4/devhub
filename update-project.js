const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('projects').update({ local_path: '/home/matias/devhub' }).eq('name', 'devhub');
  console.log('Updated:', error ? error : 'success');
}
run();
