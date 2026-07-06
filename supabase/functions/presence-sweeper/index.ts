// Manual trigger for the departure timers — pg_cron runs sweep_presence()
// every minute in production; this endpoint exists for demos and tests
// ("make the board flip right now").
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (_req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const { error } = await admin.rpc('sweep_presence');
  return new Response(JSON.stringify(error ? { error: error.message } : { ok: true }), {
    status: error ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
