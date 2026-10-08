const db = require('./db');

async function initDb() {
  console.log("Initializing database...");
  try {
    // Create Users Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'student',
        course VARCHAR(100),
        avatar VARCHAR(20),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create Songs Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS songs (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(200),
        artist VARCHAR(150),
        link TEXT,
        platform VARCHAR(50),
        requestedBy_id VARCHAR(50),
        note TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (requestedBy_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create Votes Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS song_voters (
        song_id VARCHAR(50),
        user_id VARCHAR(50),
        PRIMARY KEY (song_id, user_id),
        FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create Config Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS config (
        id INT PRIMARY KEY DEFAULT 1,
        announcement TEXT,
        acceptingRequests BOOLEAN DEFAULT 1,
        currentMode VARCHAR(100)
      )
    `);

    // Insert Default Config if empty
    const confRes = await db.query(`SELECT COUNT(*) as cnt FROM config`);
    if (confRes[0].cnt == 0) {
      await db.query(`
        INSERT INTO config (id, announcement, acceptingRequests, currentMode) 
        VALUES (1, '🔥 ¡Bienvenidos a la clase de Incuyo! Dejen sus temas para programar. Franco Profe irá poniendo las canciones más votadas.', 1, 'Concentración y Código')
      `);
    }

    // Insert Seed Users if empty
    const usersRes = await db.query(`SELECT COUNT(*) as cnt FROM users`);
    if (usersRes[0].cnt == 0) {
       await db.query(`
         INSERT INTO users (id, name, email, password, role, course, avatar, createdAt) VALUES 
         ('user-profe', 'Franco (Profe)', 'franco@incuyo.edu.ar', 'profe123', 'teacher', 'Docente Incuyo', '👨‍🏫', NOW() - INTERVAL 5 DAY),
         ('user-matias', 'Matías Rodríguez', 'matias@estudiante.incuyo.edu.ar', '123', 'student', 'Desarrollo Web Full Stack', '💻', NOW() - INTERVAL 3 DAY),
         ('user-sofia', 'Sofía Álvarez', 'sofia@estudiante.incuyo.edu.ar', '123', 'student', 'Programación Backend Node.js', '🚀', NOW() - INTERVAL 2 DAY),
         ('user-lucas', 'Lucas Benítez', 'lucas@estudiante.incuyo.edu.ar', '123', 'student', 'Desarrollo Web Full Stack', '🎧', NOW() - INTERVAL 1 DAY)
       `);
    }

    // Insert Seed Songs if empty
    const songsRes = await db.query(`SELECT COUNT(*) as cnt FROM songs`);
    if (songsRes[0].cnt == 0) {
        await db.query(`
          INSERT INTO songs (id, title, artist, link, platform, requestedBy_id, note, status, createdAt) VALUES
          ('song-1', 'Resonance', 'HOME', 'https://www.youtube.com/watch?v=8GW6sLrK40k', 'youtube', 'user-matias', '¡Temazo synthwave para concentrarse a full tirando código!', 'playing', NOW() - INTERVAL 2 HOUR),
          ('song-2', 'Lofi Hip Hop Radio - Beats to Relax/Study to', 'Lofi Girl', 'https://www.youtube.com/watch?v=jfKfPfyJRdk', 'youtube', 'user-sofia', 'El clásico infaltable de las tardes de laboratorio.', 'pending', NOW() - INTERVAL 90 MINUTE),
          ('song-3', 'Midnight City', 'M83', 'https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt', 'spotify', 'user-lucas', 'Para cuando llegamos al deploy de los viernes', 'pending', NOW() - INTERVAL 60 MINUTE),
          ('song-4', 'De Música Ligera', 'Soda Stereo', 'Soda Stereo - De Música Ligera', 'search', 'user-matias', 'Un clásico nacional mientras arreglamos los bugs', 'played', NOW() - INTERVAL 1 DAY)
        `);

        await db.query(`
          INSERT INTO song_voters (song_id, user_id) VALUES
          ('song-1', 'user-matias'), ('song-1', 'user-sofia'), ('song-1', 'user-lucas'),
          ('song-2', 'user-sofia'), ('song-2', 'user-matias'),
          ('song-3', 'user-lucas'),
          ('song-4', 'user-matias'), ('song-4', 'user-sofia'), ('song-4', 'user-lucas'), ('song-4', 'user-profe')
        `);
    }

    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize db:", err);
  }
}

// If run directly
if (require.main === module) {
  initDb();
}

module.exports = initDb;
