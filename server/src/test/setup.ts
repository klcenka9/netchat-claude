import os from 'os';
import path from 'path';
import crypto from 'crypto';

// Isolated, throwaway DB per test file. Must be set BEFORE any import of
// db/client.ts (which reads env.DB_PATH at module load). vitest runs setupFiles
// before the test file's own imports, so this is the right place.
const tmp = path.join(os.tmpdir(), `netchat-test-${process.pid}-${crypto.randomBytes(6).toString('hex')}.db`);
process.env.DB_PATH = tmp;
process.env.JWT_SECRET ??= 'test_jwt_secret_test_jwt_secret_32xx';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_test_refresh_32x';
process.env.REGISTRATION_CODE ??= 'test-code';
process.env.NODE_ENV = 'test';

// Remove the throwaway DB (and its WAL/SHM sidecars) when the worker exits so
// nothing accumulates in the OS temp dir.
import fs from 'fs';
process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(tmp + suffix);
    } catch {
      /* already gone */
    }
  }
});
