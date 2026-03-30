const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://kpgeyukrsydjujqouape.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwZ2V5dWtyc3lkanVqcW91YXBlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyNjM5MiwiZXhwIjoyMDkwMjAyMzkyfQ.HBLjo3Q9_yQZYtfL2Fz52dZ_jLoxcn01PVoZupgz0qE');

async function test() {
  // Query pg_policies
  let { data, error } = await supabase.rpc('get_policies', {}).catch(() => ({error: 'No RPC'}));
  if (error || !data) {
    // try to query direct via postgres if rest allows it
    const res = await supabase.from('projects').select('*'); // Service role
    console.log("Total DB projects:", res.data.length);
  }
}
test();
