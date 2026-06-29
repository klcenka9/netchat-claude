import { db } from './client';
import { runMigrations } from './runMigrations';

// Importing ./client already runs migrations on open; this entrypoint exists for
// the `npm run db:migrate` script and explicit re-runs. Idempotent.
export function migrate(): void {
  runMigrations(db);
  console.log('Migration complete.');
}

if (require.main === module) {
  migrate();
}
