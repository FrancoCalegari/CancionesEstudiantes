require('dotenv').config();

const API_URL = 'https://spiderwebargapi.com.ar/api/v1/query';

async function queryDB(queryText) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.SPIDER_API_KEY
      },
      body: JSON.stringify({
        database: process.env.SPIDERWEB_DB,
        query: queryText
      })
    });
    const data = await res.json();
    if (data.error) {
       console.error("DB Query Error:", data);
       throw new Error(data.message || data.error);
    }
    return data.result || [];
  } catch (error) {
    console.error("Fetch DB error:", error);
    throw error;
  }
}

// Function to escape strings to prevent basic SQL injection issues,
// since we can't use parameterized queries directly with this API easily without stringifying them.
function escapeSQL(str) {
  if (str === null || str === undefined) return 'NULL';
  if (typeof str === 'number' || typeof str === 'boolean') return str;
  return "'" + String(str).replace(/'/g, "''") + "'";
}

module.exports = {
  query: queryDB,
  escape: escapeSQL
};
