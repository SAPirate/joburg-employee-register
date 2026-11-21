const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcryptjs');
const db = require('../lib/database');

async function main() {
  if (db.prepare("SELECT id FROM employees WHERE role = 'admin' LIMIT 1").get()) {
    throw new Error('An administrator already exists. Ask an existing admin to create accounts.');
  }

  const terminal = readline.createInterface({ input: stdin, output: stdout });
  try {
    const fullName = (await terminal.question('Administrator full name: ')).trim();
    const employeeNumber = (await terminal.question('Employee number: ')).trim();
    const email = (await terminal.question('Email address: ')).trim().toLowerCase();
    const password = await terminal.question('Password (minimum 12 characters): ');
    if (!fullName || !employeeNumber || !/^\S+@\S+\.\S+$/.test(email) || password.length < 12) {
      throw new Error('Provide a name, employee number, valid email, and a password of at least 12 characters.');
    }

    db.prepare(`INSERT INTO employees (full_name, employee_number, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, 'admin', ?)`).run(
      fullName,
      employeeNumber,
      email,
      await bcrypt.hash(password, 12),
      new Date().toISOString()
    );
    console.log(`Administrator account created for ${email}.`);
  } finally {
    terminal.close();
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});