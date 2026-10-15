require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Store = require('./data/store');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple Auth Helper
async function getUserFromAuth(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  return await Store.findUserById(token);
}

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, course, avatar } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Por favor completá nombre, email y contraseña.' });
    }

    const existing = await Store.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'El email ya se encuentra registrado.' });
    }

    const isTeacher = email.toLowerCase().includes('franco') || email.toLowerCase().includes('profe');
    const role = isTeacher ? 'teacher' : 'student';

    const user = await Store.createUser({
      name,
      email,
      password,
      role,
      course: course || (role === 'teacher' ? 'Docente Incuyo' : 'Estudiante Incuyo'),
      avatar: avatar || (role === 'teacher' ? '👨‍🏫' : '🎧')
    });

    const { password: _, ...safeUser } = user;
    return res.status(201).json({
      message: '¡Registro exitoso!',
      user: safeUser,
      token: user.id
    });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Ingresá email y contraseña.' });
    }

    const user = await Store.findUserByEmail(email);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Credenciales inválidas. Verificá tu correo o contraseña.' });
    }

    const { password: _, ...safeUser } = user;
    return res.json({
      message: '¡Bienvenido de vuelta!',
      user: safeUser,
      token: user.id
    });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/auth/demo-users', async (req, res) => {
  try {
    const usersRaw = await Store.getUsers();
    const users = usersRaw.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      course: u.course,
      avatar: u.avatar
    }));
    return res.json({ users });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ==================== SONGS ROUTES ====================

app.get('/api/songs', async (req, res) => {
  try {
    const songs = await Store.getSongs();
    const config = await Store.getConfig();

    const stats = {
      total: songs.length,
      pending: songs.filter(s => s.status === 'pending').length,
      playing: songs.find(s => s.status === 'playing') || null,
      played: songs.filter(s => s.status === 'played').length
    };

    return res.json({ songs, stats, config });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/songs', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) {
      return res.status(401).json({ error: 'Debes iniciar sesión para solicitar una canción.' });
    }

    const config = await Store.getConfig();
    if (!config.acceptingRequests && user.role !== 'teacher') {
      return res.status(403).json({ error: 'Los pedidos de canciones están pausados temporalmente por el Profe Franco.' });
    }

    const { title, artist, link, note } = req.body;

    if (!title && !link) {
      return res.status(400).json({ error: 'Debes ingresar el nombre de la canción o un link de YouTube/Spotify.' });
    }

    const newSong = await Store.addSong({
      title,
      artist,
      link,
      note,
      requestedBy: user
    });

    return res.status(201).json({
      message: '¡Canción solicitada con éxito! Ya está en la lista de Franco Profe 🎵',
      song: newSong
    });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.patch('/api/songs/:id/status', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    if (user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo el Profe Franco puede cambiar el estado de las canciones.' });
    }

    const { status } = req.body;
    const validStatuses = ['pending', 'playing', 'played', 'skipped'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido.' });
    }

    const updatedSong = await Store.updateSongStatus(req.params.id, status);
    if (!updatedSong) {
      return res.status(404).json({ error: 'Canción no encontrada.' });
    }

    return res.json({
      message: `Estado actualizado a "${status}"`,
      song: updatedSong
    });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/songs/:id/vote', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) {
      return res.status(401).json({ error: 'Iniciá sesión para votar canciones.' });
    }

    const song = await Store.toggleVote(req.params.id, user.id);
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada.' });
    }

    const hasVoted = song.voters.includes(user.id);

    return res.json({
      message: hasVoted ? '¡Voto registrado! 🔥' : 'Voto eliminado',
      song,
      hasVoted
    });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.delete('/api/songs/:id', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }

    const song = await Store.getSongById(req.params.id);
    if (!song) {
      return res.status(404).json({ error: 'Canción no encontrada.' });
    }

    if (user.role !== 'teacher' && song.requestedBy.id !== user.id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este pedido.' });
    }

    const deleted = await Store.deleteSong(req.params.id);
    return res.json({
      message: 'Canción eliminada de la lista.',
      deleted
    });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ==================== CONFIG & CONTROLS ====================

app.get('/api/config', async (req, res) => {
  try {
    const config = await Store.getConfig();
    return res.json(config);
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user || user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo el Profe Franco puede modificar las opciones globales.' });
    }

    const { announcement, acceptingRequests, currentMode } = req.body;
    const updated = await Store.updateConfig({ announcement, acceptingRequests, currentMode });
    return res.json({ message: 'Configuración actualizada.', config: updated });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    const user = await getUserFromAuth(req);
    if (!user || user.role !== 'teacher') {
      return res.status(403).json({ error: 'Solo el Profe Franco puede restablecer los datos.' });
    }

    await Store.resetData();
    return res.json({ message: 'Datos de prueba restablecidos con éxito.' });
  } catch(err) {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// Serve frontend for all SPA routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start local server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 CancionesEstudiantes Server escuchando en http://localhost:${PORT}`);
    console.log(`👨‍🏫 Profe Franco & Estudiantes Incuyo listos para pedir temas.`);
  });
}

module.exports = app;
