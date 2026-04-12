const Database = require('better-sqlite3');
const db = new Database('db.sqlite3');

function addColumn(table, column, type, defaultValue = null) {
  try {
    let sql = `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
    if (defaultValue !== null) {
      if (typeof defaultValue === 'string') {
        sql += ` DEFAULT '${defaultValue}'`;
      } else {
        sql += ` DEFAULT ${defaultValue}`;
      }
    }
    db.prepare(sql).run();
    console.log(`Added column ${column} to ${table}`);
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log(`Column ${column} already exists in ${table}`);
    } else {
      console.error(`Error adding ${column} to ${table}: ${err.message}`);
    }
  }
}

// Plan missing columns
addColumn('sub_plans', 'maxConcurrentDevices', 'INTEGER', 1);
addColumn('sub_plans', 'allowMultiDevice', 'BOOLEAN', 0);
addColumn('sub_plans', 'deviceLockMinutes', 'INTEGER');

// DeviceSession missing columns
addColumn('sub_device_sessions', 'lockedUntilAt', 'DATETIME');

db.close();
