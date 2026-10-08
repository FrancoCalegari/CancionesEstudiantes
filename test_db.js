require('dotenv').config();

const dbUrl = 'https://spiderwebargapi.com.ar/api/v1/query';

async function test() {
  const query = "SELECT sqlite_version() as version;"; // test for SQLite first
  
  const res = await fetch(dbUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': process.env.SPIDER_API_KEY
    },
    body: JSON.stringify({
      database: process.env.SPIDERWEB_DB,
      query: query
    })
  });
  
  const data = await res.json();
  console.log("SQLite Version Test:", data);
  
  if (data.error) {
    const query2 = "SELECT version();"; // test for Postgres/MySQL
    const res2 = await fetch(dbUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.SPIDER_API_KEY
      },
      body: JSON.stringify({
        database: process.env.SPIDERWEB_DB,
        query: query2
      })
    });
    const data2 = await res2.json();
    console.log("Postgres/MySQL Version Test:", data2);
  }
}

test();
