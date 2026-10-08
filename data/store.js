const db = require('./db');

// Detect platform from URL or search string
function detectPlatform(link) {
  if (!link) return 'search';
  const l = link.toLowerCase();
  if (l.includes('youtube.com') || l.includes('youtu.be')) return 'youtube';
  if (l.includes('spotify.com')) return 'spotify';
  if (l.includes('soundcloud.com')) return 'soundcloud';
  return 'search';
}

const Store = {
  // Users
  getUsers: async () => {
    return await db.query(`SELECT * FROM users`);
  },
  
  findUserByEmail: async (email) => {
    if (!email) return null;
    const res = await db.query(`SELECT * FROM users WHERE email = ${db.escape(email.toLowerCase().trim())}`);
    return res.length > 0 ? res[0] : null;
  },
  
  findUserById: async (id) => {
    if (!id) return null;
    const res = await db.query(`SELECT * FROM users WHERE id = ${db.escape(id)}`);
    return res.length > 0 ? res[0] : null;
  },
  
  createUser: async (userData) => {
    const id = 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const name = db.escape(userData.name.trim());
    const email = db.escape(userData.email.toLowerCase().trim());
    const password = db.escape(userData.password);
    const role = db.escape(userData.role || 'student');
    const course = db.escape(userData.course || 'Estudiante Incuyo');
    const avatar = db.escape(userData.avatar || '🎧');
    
    await db.query(`
      INSERT INTO users (id, name, email, password, role, course, avatar, createdAt)
      VALUES ('${id}', ${name}, ${email}, ${password}, ${role}, ${course}, ${avatar}, NOW())
    `);
    
    return await Store.findUserById(id);
  },

  // Songs
  getSongs: async () => {
    // We need to join with users and aggregate voters
    const query = `
      SELECT 
        s.*, 
        u.name as requestedBy_name, u.course as requestedBy_course, u.avatar as requestedBy_avatar,
        (SELECT COUNT(*) FROM song_voters WHERE song_id = s.id) as votes,
        (SELECT GROUP_CONCAT(user_id) FROM song_voters WHERE song_id = s.id) as voters_csv
      FROM songs s
      JOIN users u ON s.requestedBy_id = u.id
      ORDER BY 
        CASE s.status
          WHEN 'playing' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'played' THEN 3
          WHEN 'skipped' THEN 4
          ELSE 5
        END ASC,
        (SELECT COUNT(*) FROM song_voters WHERE song_id = s.id) DESC,
        s.createdAt DESC
    `;
    const rows = await db.query(query);
    
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      artist: r.artist,
      link: r.link,
      platform: r.platform,
      note: r.note,
      status: r.status,
      votes: parseInt(r.votes) || 0,
      voters: r.voters_csv ? r.voters_csv.split(',') : [],
      createdAt: r.createdAt,
      requestedBy: {
        id: r.requestedBy_id,
        name: r.requestedBy_name,
        course: r.requestedBy_course,
        avatar: r.requestedBy_avatar
      }
    }));
  },

  getSongById: async (id) => {
    const songs = await Store.getSongs();
    return songs.find(s => s.id === id) || null;
  },

  addSong: async ({ title, artist, link, requestedBy, note }) => {
    const id = 'song-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const safeTitle = db.escape(title ? title.trim() : (link || 'Canción sugerida'));
    const safeArtist = db.escape(artist ? artist.trim() : '');
    const safeLink = db.escape(link ? link.trim() : '');
    const platform = db.escape(detectPlatform(link));
    const safeNote = db.escape(note ? note.trim() : '');
    const reqBy = db.escape(requestedBy.id);

    await db.query(`
      INSERT INTO songs (id, title, artist, link, platform, requestedBy_id, note, status, createdAt)
      VALUES ('${id}', ${safeTitle}, ${safeArtist}, ${safeLink}, ${platform}, ${reqBy}, ${safeNote}, 'pending', NOW())
    `);
    
    // Auto vote by requester
    await db.query(`INSERT INTO song_voters (song_id, user_id) VALUES ('${id}', ${reqBy})`);
    
    return await Store.getSongById(id);
  },

  updateSongStatus: async (id, status) => {
    if (status === 'playing') {
      await db.query(`UPDATE songs SET status = 'played' WHERE status = 'playing'`);
    }
    await db.query(`UPDATE songs SET status = ${db.escape(status)} WHERE id = ${db.escape(id)}`);
    return await Store.getSongById(id);
  },

  toggleVote: async (songId, userId) => {
    const safeSongId = db.escape(songId);
    const safeUserId = db.escape(userId);
    
    const check = await db.query(`SELECT * FROM song_voters WHERE song_id = ${safeSongId} AND user_id = ${safeUserId}`);
    if (check.length > 0) {
      await db.query(`DELETE FROM song_voters WHERE song_id = ${safeSongId} AND user_id = ${safeUserId}`);
    } else {
      await db.query(`INSERT INTO song_voters (song_id, user_id) VALUES (${safeSongId}, ${safeUserId})`);
    }
    
    return await Store.getSongById(songId);
  },

  deleteSong: async (id) => {
    const song = await Store.getSongById(id);
    if (song) {
      await db.query(`DELETE FROM songs WHERE id = ${db.escape(id)}`);
    }
    return song;
  },

  // Config
  getConfig: async () => {
    const res = await db.query(`SELECT * FROM config WHERE id = 1`);
    if (res.length > 0) {
       // Convert TinyInt/Boolean to actual boolean for acceptingRequests
       const r = res[0];
       return {
         ...r,
         acceptingRequests: r.acceptingRequests == 1 || r.acceptingRequests === true
       };
    }
    return null;
  },
  
  updateConfig: async ({ announcement, acceptingRequests, currentMode }) => {
    const safeAnn = db.escape(announcement);
    const safeMode = db.escape(currentMode);
    const acc = acceptingRequests ? 1 : 0;
    
    await db.query(`
      UPDATE config 
      SET announcement = ${safeAnn}, acceptingRequests = ${acc}, currentMode = ${safeMode} 
      WHERE id = 1
    `);
    return await Store.getConfig();
  },

  resetData: async () => {
    // Instead of dropping tables which is destructive, we can delete all rows
    // and re-run init. But for now, we'll just delete and re-seed from init_db.js logic
    await db.query(`DELETE FROM song_voters`);
    await db.query(`DELETE FROM songs`);
    await db.query(`DELETE FROM users`);
    await db.query(`DELETE FROM config`);
    
    const initDb = require('./init_db');
    await initDb();
    return true;
  }
};

module.exports = Store;
