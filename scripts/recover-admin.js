const path = require('node:path');
const fs = require('node:fs');
const { randomBytes, scryptSync } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createInterface } = require('node:readline/promises');

const databasePath = process.env.ASPECT_DATA_DIR
  ? path.join(path.resolve(process.env.ASPECT_DATA_DIR), 'portal.sqlite')
  : path.resolve(__dirname, '..', 'data', 'portal.sqlite');
const prompt = createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  if (!fs.existsSync(databasePath)) {
    console.error('The portal database was not found. Start the portal once, then run this recovery tool again.');
    process.exitCode = 1;
    return;
  }

  const email = (await prompt.question('Administrator email: ')).trim().toLowerCase();
  const db = new DatabaseSync(databasePath);
  try {
    const account = db.prepare("SELECT id,name,email FROM users WHERE lower(email)=? AND role='admin' AND active=1").get(email);
    if (!account) {
      console.error('No active administrator account matches that email. No changes were made.');
      process.exitCode = 1;
      return;
    }

    console.log(`\nThis will reset the password for ${account.name} (${account.email}), sign out their active sessions, and require a password change at next sign-in.`);
    const confirmation = await prompt.question('Type RESET to continue: ');
    if (confirmation !== 'RESET') {
      console.log('Recovery cancelled. No changes were made.');
      return;
    }

    const temporaryPassword = randomBytes(18).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(temporaryPassword, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(`${salt}:${derived}`, account.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    console.log('\nOne-time password (copy it now):');
    console.log(temporaryPassword);
    console.log('\nSign in with this password. The portal will ask you to choose a new one. This temporary password is not saved in a file.');
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(`Recovery failed: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prompt.close());
