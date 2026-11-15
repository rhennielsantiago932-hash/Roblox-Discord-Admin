const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_links (
      discord_id VARCHAR(32) PRIMARY KEY,
      roblox_id VARCHAR(32) UNIQUE NOT NULL,
      roblox_username VARCHAR(50) NOT NULL,
      linked_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state VARCHAR(128) PRIMARY KEY,
      discord_id VARCHAR(32) NOT NULL,
      code_verifier VARCHAR(128) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("DATABASE CONNECTION SUCCESS!");
}

module.exports = {
  pool,
  initializeDatabase
};
