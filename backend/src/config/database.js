const { Pool } = require("pg");
const logger = require("./logger");

const pool = new Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "5432"),
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME     || "taskmanager",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  logger.error("Unexpected error on idle client", { error: err.message });
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    logger.info("PostgreSQL connected successfully");
    client.release();
  } catch (err) {
    logger.error("Failed to connect to PostgreSQL", { error: err.message });
    process.exit(1);
  }
};

module.exports = { pool, connectDB };
