/**
 * CancionesEstudiantes - Incuyo & Franco Profe
 * Frontend Logic, State Management, and Realtime Sync
 */

const App = (() => {
  // State
  let currentUser = null;
  let songs = [];
  let stats = { total: 0, pending: 0, playing: null, played: 0 };
  let config = { announcement: '', acceptingRequests: true, currentMode: 'Concentración y Código' };
  let activeFilter = 'all';
  let searchQuery = '';
  let currentEmbedSong = null;
  let pollInterval = null;

  // Helpers
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // Initialize
  function init() {
    loadUserSession();
    fetchData();
    setupEventListeners();
    
    // Auto-sync polling every 4 seconds for live classroom experience
    pollInterval = setInterval(fetchData, 4000);
  }

  // Setup Global Events & Dialog Dismissals
  function setupEventListeners() {
    // Close dialog when clicking on backdrop
    $$('.modal-dialog').forEach(dialog => {
      dialog.addEventListener('click', (e) => {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          dialog.close();
        }
      });
    });
  }

  // ==================== AUTH & SESSION ====================

  function loadUserSession() {
    const saved = localStorage.getItem('canciones_user');
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
      } catch (e) {
        currentUser = null;
      }
    }
    renderNav();
    updateSubmitterPreview();
  }

  function saveUserSession(user) {
    currentUser = user;
    localStorage.setItem('canciones_user', JSON.stringify(user));
    renderNav();
    updateSubmitterPreview();
    renderSongs();
  }

  function logout() {
    currentUser = null;
    localStorage.removeItem('canciones_user');
    renderNav();
    updateSubmitterPreview();
    renderSongs();
    showToast('Sesión cerrada con éxito', 'info');
  }

  function renderNav() {
    const navActions = $('#nav-actions');
    const teacherPanel = $('#teacher-panel');
    const tabMine = $('#tab-mine');

    if (!currentUser) {
      navActions.innerHTML = `
        <button type="button" class="btn btn-secondary" onclick="App.openModal('login-modal')">
          Iniciar Sesión
        </button>
        <button type="button" class="btn btn-primary" onclick="App.openModal('register-modal')">
          Registrarse
        </button>
      `;
      if (teacherPanel) teacherPanel.style.display = 'none';
      if (tabMine) tabMine.style.display = 'none';
      return;
    }

    const isTeacher = currentUser.role === 'teacher';

    navActions.innerHTML = `
      <div class="user-badge-profile">
        <span class="user-avatar-tag">${currentUser.avatar || '🎧'}</span>
        <div class="user-details">
          <span class="user-name-tag">${escapeHtml(currentUser.name)}</span>
        </div>
        <span class="user-role-pill ${isTeacher ? 'role-teacher' : 'role-student'}">
          ${isTeacher ? 'Profe' : 'Estudiante'}
        </span>
      </div>
      <button type="button" class="btn btn-sm btn-glass" onclick="App.logout()" title="Cerrar sesión">
        Salir ↩
      </button>
    `;

    // Show/Hide Teacher Panel
    if (teacherPanel) {
      teacherPanel.style.display = isTeacher ? 'block' : 'none';
      if (isTeacher) {
        $('#input-announcement').value = config.announcement || '';
        $('#select-class-mode').value = config.currentMode || 'Concentración y Código';
        $('#toggle-accept-requests').checked = config.acceptingRequests !== false;
      }
    }

    // Show 'Mis Pedidos' tab for logged in students
    if (tabMine) {
      tabMine.style.display = 'inline-flex';
    }
  }

  function updateSubmitterPreview() {
    const nameEl = $('#modal-submitter-name');
    const courseEl = $('#modal-submitter-course');
    const iconEl = $('.user-id-icon');

    if (currentUser) {
      if (nameEl) nameEl.textContent = currentUser.name;
      if (courseEl) courseEl.textContent = currentUser.course || (currentUser.role === 'teacher' ? 'Docente Incuyo' : 'Estudiante Incuyo');
      if (iconEl) iconEl.textContent = currentUser.avatar || '🎓';
    } else {
      if (nameEl) nameEl.textContent = 'Estudiante Anónimo (Requiere Login)';
      if (courseEl) courseEl.textContent = 'Iniciá sesión para que Franco sepa quién sos';
      if (iconEl) iconEl.textContent = '👤';
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('#login-email').value;
    const password = $('#login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');

      saveUserSession(data.user);
      closeModal('login-modal');
      showToast(`¡Hola ${data.user.name}! Sesión iniciada.`, 'success');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const name = $('#register-name').value;
    const email = $('#register-email').value;
    const course = $('#register-course').value;
    const avatar = $('#register-avatar').value;
    const password = $('#register-password').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, course, avatar })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al registrarte');

      saveUserSession(data.user);
      closeModal('register-modal');
      showToast(`¡Bienvenido a Incuyo, ${data.user.name}!`, 'success');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function loginAsDemo(email, password) {
    fillLoginForm(email, password);
    // Directly submit login
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    .then(r => r.json())
    .then(data => {
      if (data.user) {
        saveUserSession(data.user);
        showToast(`⚡ Accediste como: ${data.user.name}`, 'success');
        fetchData();
      }
    })
    .catch(() => showToast('Error al iniciar acceso rápido', 'error'));
  }

  function fillLoginForm(email, password) {
    const eInput = $('#login-email');
    const pInput = $('#login-password');
    if (eInput && pInput) {
      eInput.value = email;
      pInput.value = password;
    }
  }

  function switchToRegister() {
    closeModal('login-modal');
    openModal('register-modal');
  }

  function switchToLogin() {
    closeModal('register-modal');
    openModal('login-modal');
  }

  // ==================== API & DATA SYNC ====================

  async function fetchData() {
    try {
      const res = await fetch('/api/songs');
      const data = await res.json();

      songs = data.songs || [];
      stats = data.stats || { total: 0, pending: 0, playing: null, played: 0 };
      config = data.config || config;

      renderStats();
      renderAnnouncement();
      renderNowPlaying();
      renderSongs();
    } catch (err) {
      console.error('Error fetching songs data:', err);
    }
  }

  function renderStats() {
    $('#stat-total').textContent = stats.total || 0;
    $('#stat-pending').textContent = stats.pending || 0;
    $('#stat-played').textContent = stats.played || 0;

    $('#count-all').textContent = songs.length;
    $('#count-pending').textContent = songs.filter(s => s.status === 'pending').length;
    $('#count-playing').textContent = songs.filter(s => s.status === 'playing').length;
    $('#count-played').textContent = songs.filter(s => s.status === 'played').length;

    if (currentUser) {
      const myCount = songs.filter(s => s.requestedBy && s.requestedBy.id === currentUser.id).length;
      const countMineEl = $('#count-mine');
      if (countMineEl) countMineEl.textContent = myCount;
    }
  }

  function renderAnnouncement() {
    const textEl = $('#announcement-text');
    const modeEl = $('#announcement-mode-badge');
    if (textEl && config.announcement) {
      textEl.textContent = config.announcement;
    }
    if (modeEl && config.currentMode) {
      modeEl.textContent = `🎧 Modo: ${config.currentMode}`;
    }
  }

  function renderNowPlaying() {
    const playingSong = songs.find(s => s.status === 'playing');
    const vinyl = $('#vinyl-disc');
    const titleEl = $('#now-playing-title');
    const artistEl = $('#now-playing-artist');
    const studentEl = $('#now-playing-student');
    const avatarEl = $('#now-playing-avatar');
    const noteEl = $('#now-playing-note');
    const linkBtn = $('#now-playing-link-btn');

    if (playingSong) {
      vinyl.classList.add('active');
      titleEl.textContent = playingSong.title;
      artistEl.textContent = playingSong.artist || (playingSong.platform === 'youtube' ? 'Video de YouTube' : 'Audio');
      studentEl.textContent = `Pedido por: ${playingSong.requestedBy.name} (${playingSong.requestedBy.course || 'Incuyo'})`;
      avatarEl.textContent = playingSong.requestedBy.avatar || '🎧';
      noteEl.textContent = playingSong.note ? `"${playingSong.note}"` : '¡Sintonizando la clase de programación!';
      
      const directUrl = getDirectPlayUrl(playingSong.link);
      linkBtn.href = directUrl;
      linkBtn.style.display = directUrl !== '#' ? 'inline-flex' : 'none';
      linkBtn.textContent = playingSong.platform === 'youtube' ? 'Abrir en YouTube ↗' : (playingSong.platform === 'spotify' ? 'Abrir en Spotify ↗' : 'Buscar Canción ↗');
    } else {
      vinyl.classList.remove('active');
      titleEl.textContent = 'Ninguna canción sonando';
      artistEl.textContent = 'Franco Profe pondrá el próximo tema pronto';
      studentEl.textContent = 'Sé el primero en pedir un tema';
      avatarEl.textContent = '⏳';
      noteEl.textContent = '¡Enviá tu tema favorito para empezar!';
      linkBtn.style.display = 'none';
    }
  }

  function renderSongs() {
    const grid = $('#songs-grid');
    if (!grid) return;

    // Filter
    let filtered = [...songs];

    if (activeFilter === 'pending') {
      filtered = filtered.filter(s => s.status === 'pending');
    } else if (activeFilter === 'playing') {
      filtered = filtered.filter(s => s.status === 'playing');
    } else if (activeFilter === 'played') {
      filtered = filtered.filter(s => s.status === 'played');
    } else if (activeFilter === 'mine' && currentUser) {
      filtered = filtered.filter(s => s.requestedBy && s.requestedBy.id === currentUser.id);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(s => 
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.artist && s.artist.toLowerCase().includes(q)) ||
        (s.requestedBy && s.requestedBy.name.toLowerCase().includes(q)) ||
        (s.note && s.note.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <span style="font-size: 2.5rem; display: block; margin-bottom: 0.5rem;">🎵</span>
          <h4>No se encontraron canciones en esta sección</h4>
          <p class="text-muted-sm mt-2">Podés pedir un nuevo tema para que Franco Profe lo agregue a la lista.</p>
          <button type="button" class="btn btn-primary mt-3" onclick="App.handleRequestSongClick()">
            ➕ Pedir Canción
          </button>
        </div>
      `;
      return;
    }

    const isTeacher = currentUser && currentUser.role === 'teacher';

    grid.innerHTML = filtered.map(song => {
      const hasVoted = currentUser && song.voters && song.voters.includes(currentUser.id);
      const isOwner = currentUser && song.requestedBy && song.requestedBy.id === currentUser.id;
      const isCurrentPlaying = song.status === 'playing';

      const platformBadge = getPlatformBadge(song.platform);
      const statusBadge = getStatusBadge(song.status);
      const playUrl = getDirectPlayUrl(song.link);

      return `
        <div class="song-card ${isCurrentPlaying ? 'status-playing' : ''}" id="song-${song.id}">
          <div class="song-card-header">
            ${platformBadge}
            ${statusBadge}
          </div>

          <div class="song-info-body">
            <h4 class="song-card-title">${escapeHtml(song.title)}</h4>
            ${song.artist ? `<p class="song-card-artist">${escapeHtml(song.artist)}</p>` : ''}
            
            ${song.note ? `<div class="song-card-note">💬 "${escapeHtml(song.note)}"</div>` : ''}

            <div class="song-submitter-row">
              <span>${song.requestedBy.avatar || '🎧'}</span>
              <span>Pedido por <strong class="submitter-name">${escapeHtml(song.requestedBy.name)}</strong></span>
              <span class="text-muted-sm">• ${escapeHtml(song.requestedBy.course || 'Incuyo')}</span>
            </div>
          </div>

          <div class="song-card-footer">
            <button 
              type="button" 
              class="vote-btn ${hasVoted ? 'voted' : ''}" 
              onclick="App.handleVote('${song.id}')"
              title="${hasVoted ? 'Quitar voto' : 'Votar este tema'}"
            >
              <span>🔥</span>
              <span class="vote-count">${song.votes || 0}</span>
            </button>

            <div class="song-actions-group">
              <button type="button" class="btn btn-sm btn-glass" onclick="App.openEmbeddedPlayer('${song.id}')" title="Ver reproductor">
                ▶️ Escuchar
              </button>
              ${playUrl !== '#' ? `
                <a href="${playUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-cyan" title="Abrir link original">
                  ↗
                </a>
              ` : ''}
              ${(isTeacher || isOwner) ? `
                <button type="button" class="btn btn-sm btn-danger-outline" onclick="App.handleDeleteSong('${song.id}')" title="Eliminar">
                  🗑️
                </button>
              ` : ''}
            </div>
          </div>

          ${isTeacher ? `
            <div class="teacher-actions-bar">
              <span class="text-muted-sm" style="font-weight: 600;">Control Franco:</span>
              <div style="display: flex; gap: 0.35rem;">
                ${song.status !== 'playing' ? `
                  <button type="button" class="teacher-action-btn" onclick="App.handleChangeStatus('${song.id}', 'playing')" style="color: var(--spotify-green);">
                    ▶️ Sonando
                  </button>
                ` : ''}
                ${song.status !== 'played' ? `
                  <button type="button" class="teacher-action-btn" onclick="App.handleChangeStatus('${song.id}', 'played')">
                    ✅ Reproducida
                  </button>
                ` : ''}
                ${song.status !== 'pending' ? `
                  <button type="button" class="teacher-action-btn" onclick="App.handleChangeStatus('${song.id}', 'pending')">
                    🕒 En Cola
                  </button>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // ==================== ACTIONS ====================

  function handleRequestSongClick() {
    if (!currentUser) {
      openModal('login-modal');
      showToast('Por favor iniciá sesión para pedir canciones al Profe Franco', 'info');
      return;
    }
    openModal('request-modal');
  }

  async function handleSubmitSong(e) {
    e.preventDefault();
    if (!currentUser) {
      openModal('login-modal');
      return;
    }

    const linkInput = $('#song-input-link');
    const titleInput = $('#song-input-title');
    const artistInput = $('#song-input-artist');
    const noteInput = $('#song-input-note');
    const submitBtn = $('#btn-submit-song');

    const linkOrTitle = linkInput.value.trim();
    let title = titleInput.value.trim();
    let artist = artistInput.value.trim();
    const note = noteInput.value.trim();

    if (!linkOrTitle) {
      showToast('Por favor ingresá un enlace o el nombre de la canción', 'error');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Identificando canción...';

      // Si no hay título y es enlace de YouTube/YT Music, resolverlo antes de subir
      if (!title && (linkOrTitle.includes('youtube.com') || linkOrTitle.includes('youtu.be') || linkOrTitle.includes('music.youtube.com'))) {
        const meta = await fetchYouTubeMetadata(linkOrTitle);
        if (meta && meta.title) {
          title = meta.title;
          if (!artist && meta.artist) artist = meta.artist;
        }
      }

      // Si aún no hay título, fallback limpio
      if (!title) {
        if (linkOrTitle.startsWith('http')) {
          title = 'Canción compartida (' + (linkOrTitle.includes('spotify') ? 'Spotify' : 'YouTube') + ')';
        } else {
          title = linkOrTitle;
        }
      }

      submitBtn.textContent = 'Enviando...';

      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({
          title,
          artist,
          link: linkOrTitle,
          note
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la canción');

      // Clear form
      linkInput.value = '';
      titleInput.value = '';
      artistInput.value = '';
      noteInput.value = '';
      $('#link-preview-badge').style.display = 'none';

      closeModal('request-modal');
      showToast(data.message || '¡Canción enviada a Franco Profe!', 'success');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '🚀 Enviar Petición al Profe';
    }
  }

  async function handleVote(songId) {
    if (!currentUser) {
      openModal('login-modal');
      showToast('Iniciá sesión para votar tus canciones favoritas', 'info');
      return;
    }

    try {
      const res = await fetch(`/api/songs/${songId}/vote`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentUser.id}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al votar');

      showToast(data.message, 'info');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleChangeStatus(songId, status) {
    if (!currentUser || currentUser.role !== 'teacher') return;

    try {
      const res = await fetch(`/api/songs/${songId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar estado');

      showToast(data.message, 'success');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDeleteSong(songId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este pedido?')) return;

    try {
      const res = await fetch(`/api/songs/${songId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${currentUser.id}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar canción');

      showToast('Pedido eliminado de la lista', 'info');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ==================== TEACHER CONTROLS ====================

  async function handleUpdateAnnouncement(e) {
    e.preventDefault();
    if (!currentUser || currentUser.role !== 'teacher') return;

    const announcement = $('#input-announcement').value;
    const currentMode = $('#select-class-mode').value;

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ announcement, currentMode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');

      showToast('¡Anuncio y modo de clase actualizados!', 'success');
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleToggleAccepting(checked) {
    if (!currentUser || currentUser.role !== 'teacher') return;

    const label = $('#accepting-label');
    if (label) {
      label.textContent = checked ? 'Aceptando pedidos de canciones' : 'Peticiones pausadas';
    }

    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ acceptingRequests: checked })
      });
      showToast(checked ? 'Pedidos de canciones habilitados' : 'Pedidos de canciones pausados', 'info');
    } catch (err) {
      showToast('Error al cambiar recepción', 'error');
    }
  }

  async function handleResetData() {
    if (!confirm('¿Restablecer las canciones de demostración iniciales de Incuyo?')) return;
    try {
      const token = getAuthToken();
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al resetear');
      }
      showToast(data.message, 'success');
      fetchData();
    } catch (e) {
      showToast(e.message || 'Error al resetear', 'error');
    }
  }

  // ==================== MEDIA EMBEDS & HELPERS ====================

  let resolveTitleTimeout = null;

  async function fetchYouTubeMetadata(url) {
    if (!url || typeof url !== 'string') return null;
    const isYt = url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com');
    if (!isYt) return null;

    try {
      const cleanUrl = url.trim().replace('music.youtube.com', 'www.youtube.com');
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        return {
          title: data.title || '',
          artist: data.author_name || ''
        };
      }
    } catch (e) {
      console.warn('No se pudo resolver metadatos de YouTube en cliente:', e);
    }
    return null;
  }

  function handleLinkInputDetection(value) {
    const badge = $('#link-preview-badge');
    const titleInput = $('#song-input-title');
    const artistInput = $('#song-input-artist');
    if (!badge) return;

    if (!value || value.trim() === '') {
      badge.style.display = 'none';
      return;
    }

    if (resolveTitleTimeout) clearTimeout(resolveTitleTimeout);

    const val = value.toLowerCase();
    const isYt = val.includes('youtube.com') || val.includes('youtu.be') || val.includes('music.youtube.com');

    if (isYt) {
      badge.style.display = 'inline-flex';
      badge.className = 'platform-detect-pill platform-youtube';
      badge.innerHTML = '🔴 YouTube Detectado • ⏳ Buscando título...';

      // Resolver en segundo plano con debounce de 350ms
      resolveTitleTimeout = setTimeout(async () => {
        const meta = await fetchYouTubeMetadata(value);
        if (meta && meta.title) {
          badge.innerHTML = `✨ <strong>${escapeHtml(meta.title.substring(0, 42))}${meta.title.length > 42 ? '...' : ''}</strong>`;
          if (titleInput && (!titleInput.value || titleInput.value.startsWith('http') || titleInput.value.startsWith('Canción'))) {
            titleInput.value = meta.title;
          }
          if (artistInput && !artistInput.value && meta.artist) {
            artistInput.value = meta.artist;
          }
        } else {
          badge.innerHTML = '🔴 Enlace de YouTube / YouTube Music';
        }
      }, 350);

    } else if (val.includes('spotify.com')) {
      badge.style.display = 'inline-flex';
      badge.className = 'platform-detect-pill platform-spotify';
      badge.innerHTML = '🟢 Enlace de Spotify Detectado';
    } else {
      badge.style.display = 'inline-flex';
      badge.className = 'platform-detect-pill platform-search';
      badge.innerHTML = '🔍 Búsqueda de Canción por Nombre';
    }
  }

  function getPlatformBadge(platform) {
    if (platform === 'youtube') {
      return '<span class="song-platform-badge platform-youtube">🔴 YouTube</span>';
    } else if (platform === 'spotify') {
      return '<span class="song-platform-badge platform-spotify">🟢 Spotify</span>';
    }
    return '<span class="song-platform-badge platform-search">🎵 Título / Tema</span>';
  }

  function getStatusBadge(status) {
    if (status === 'playing') {
      return '<span class="song-status-pill status-badge-playing">▶️ Sonando Ahora</span>';
    } else if (status === 'played') {
      return '<span class="song-status-pill status-badge-played">✅ Reproducida</span>';
    }
    return '<span class="song-status-pill status-badge-pending">🕒 En Espera</span>';
  }

  function getDirectPlayUrl(link) {
    if (!link) return '#';
    if (link.startsWith('http://') || link.startsWith('https://')) {
      return link;
    }
    // If it's a search term, create a YouTube search link
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(link)}`;
  }

  function extractYouTubeId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  function extractSpotifyId(url) {
    if (!url) return null;
    const match = url.match(/track\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  function openEmbeddedPlayer(songId) {
    const song = songs.find(s => s.id === songId);
    if (!song) return;

    const modal = $('#player-modal');
    const container = $('#player-iframe-container');
    const titleEl = $('#player-modal-title');
    const submitterEl = $('#player-requested-by');
    const externalBtn = $('#player-external-btn');

    titleEl.textContent = `${song.title} ${song.artist ? '- ' + song.artist : ''}`;
    submitterEl.textContent = `Solicitado por ${song.requestedBy.name} (${song.requestedBy.course || 'Incuyo'})`;

    const directUrl = getDirectPlayUrl(song.link);
    externalBtn.href = directUrl;

    const ytId = extractYouTubeId(song.link);
    const spotifyId = extractSpotifyId(song.link);

    if (ytId) {
      container.innerHTML = `
        <iframe 
          src="https://www.youtube.com/embed/${ytId}?autoplay=1" 
          title="YouTube Player" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      `;
    } else if (spotifyId) {
      container.innerHTML = `
        <iframe 
          src="https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator&theme=0" 
          width="100%" 
          height="100%" 
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
          loading="lazy">
        </iframe>
      `;
    } else {
      // YouTube search fallback embed
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 2rem; text-align: center;">
          <span style="font-size: 3rem; margin-bottom: 1rem;">🎵</span>
          <h4>${escapeHtml(song.title)}</h4>
          <p class="text-muted-sm" style="margin-bottom: 1.5rem;">Canción solicitada por nombre.</p>
          <a href="${directUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
            Buscar y Escuchar en YouTube ↗
          </a>
        </div>
      `;
    }

    modal.showModal();
  }

  function openEmbeddedPlayerForCurrent() {
    const playingSong = songs.find(s => s.status === 'playing');
    if (playingSong) {
      openEmbeddedPlayer(playingSong.id);
    } else if (songs.length > 0) {
      openEmbeddedPlayer(songs[0].id);
    } else {
      showToast('No hay canciones en la lista aún', 'info');
    }
  }

  function closePlayerModal() {
    const modal = $('#player-modal');
    const container = $('#player-iframe-container');
    container.innerHTML = ''; // Stop audio playback
    modal.close();
  }

  // ==================== MODAL & FILTER UTILITIES ====================

  function openModal(id) {
    const dialog = $(`#${id}`);
    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
  }

  function closeModal(id) {
    const dialog = $(`#${id}`);
    if (dialog && typeof dialog.close === 'function') {
      dialog.close();
    }
  }

  function setFilter(filterName) {
    activeFilter = filterName;
    $$('.filter-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.filter === filterName);
    });
    renderSongs();
  }

  function handleSearch(query) {
    searchQuery = query;
    renderSongs();
  }

  function showToast(message, type = 'info') {
    const container = $('#toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose public API
  return {
    init,
    openModal,
    closeModal,
    loginAsDemo,
    fillLoginForm,
    switchToLogin,
    switchToRegister,
    handleLogin,
    handleRegister,
    logout,
    handleRequestSongClick,
    handleSubmitSong,
    handleVote,
    handleChangeStatus,
    handleDeleteSong,
    handleUpdateAnnouncement,
    handleToggleAccepting,
    handleResetData,
    handleLinkInputDetection,
    openEmbeddedPlayer,
    openEmbeddedPlayerForCurrent,
    closePlayerModal,
    setFilter,
    handleSearch
  };
})();

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
