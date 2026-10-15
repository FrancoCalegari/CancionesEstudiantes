#!/usr/bin/env python3
"""
clientMusic.py - Reproductor HDMI para CancionesEstudiantes (Incuyo & Franco Profe)
===================================================================================
Este cliente se ejecuta en la computadora conectada por HDMI al televisor de la clase.
Se sincroniza en tiempo real con la plataforma web (local o Vercel), reproduciendo
automáticamente las canciones que Franco Profe o los estudiantes eligen.

Jugadores soportados:
  - mpv (Recomendado para HDMI TV: pantalla completa, aceleración por hardware y OSD)
  - vlc (Alternativa de reproductor)
  - browser (Abre el video directamente en Google Chrome / Firefox / navegador default)
"""

import os
import sys
import time
import signal
import argparse
import subprocess
import json
import urllib.request
import urllib.parse
import urllib.error
import shutil
from typing import Optional, Dict, Any

# ==================== UTILIDADES DE COLOR Y TERMINAL ====================

class Colors:
    CYAN = '\033[96m'
    MAGENTA = '\033[95m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    RESET = '\033[0m'

def load_dotenv(path: str = '.env'):
    """Carga variables simples de un archivo .env si existe, sin dependencias externas."""
    if not os.path.isfile(path):
        return
    try:
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip().strip('"\'')
                    if k not in os.environ:
                        os.environ[k] = v
    except Exception as e:
        print(f"Nota: No se pudo leer .env ({e})")

# ==================== CLASE CLIENTE DE LA API ====================

class CancionesAPI:
    def __init__(self, base_url: str, teacher_email: str = '', teacher_password: str = ''):
        self.base_url = base_url.rstrip('/')
        self.teacher_email = teacher_email
        self.teacher_password = teacher_password
        self.auth_token: Optional[str] = None

    def _request(self, endpoint: str, method: str = 'GET', data: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        url = f"{self.base_url}{endpoint}"
        headers = {
            'User-Agent': 'CancionesEstudiantes-HDMIClient/1.0',
            'Content-Type': 'application/json'
        }
        if self.auth_token:
            headers['Authorization'] = f"Bearer {self.auth_token}"

        body = json.dumps(data).encode('utf-8') if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                res_body = response.read().decode('utf-8')
                return json.loads(res_body) if res_body else {}
        except urllib.error.HTTPError as e:
            try:
                err_data = json.loads(e.read().decode('utf-8'))
                return {'error': err_data.get('error', str(e)), 'status_code': e.code}
            except Exception:
                return {'error': str(e), 'status_code': e.code}
        except Exception as e:
            return {'error': str(e)}

    def login_teacher(self) -> bool:
        """Inicia sesión con la cuenta del docente para poder actualizar estados al terminar canciones."""
        if not self.teacher_email or not self.teacher_password:
            return False
        res = self._request('/api/auth/login', method='POST', data={
            'email': self.teacher_email,
            'password': self.teacher_password
        })
        if res and res.get('user') and res.get('token'):
            self.auth_token = res.get('token')
            return True
        return False

    def fetch_state(self) -> Optional[Dict[str, Any]]:
        """Obtiene el estado actual de canciones, stats y configuración."""
        res = self._request('/api/songs')
        if not res or 'error' in res:
            return None
        return res

    def set_song_status(self, song_id: str, status: str) -> bool:
        """Actualiza el estado de una canción (ej: 'played', 'playing')."""
        if not self.auth_token:
            self.login_teacher()
        if not self.auth_token:
            return False
        res = self._request(f'/api/songs/{song_id}/status', method='PATCH', data={'status': status})
        return res and not res.get('error')

# ==================== CONTROLADOR DE REPRODUCCIÓN ====================

class MediaEngine:
    def __init__(self, player: str = 'mpv', fullscreen: bool = True, audio_only: bool = False, debug: bool = False, volume: int = 50):
        self.player_type = player.lower()
        self.fullscreen = fullscreen
        self.audio_only = audio_only
        self.debug = debug
        self.volume = max(0, min(100, volume))
        self.current_process: Optional[subprocess.Popen] = None
        self.current_song: Optional[Dict[str, Any]] = None
        self._validate_player()

    def _validate_player(self):
        """Valida si el reproductor elegido está disponible en el sistema."""
        if self.player_type == 'mpv' and not shutil.which('mpv'):
            if shutil.which('vlc'):
                print(f"{Colors.YELLOW}⚠️ mpv no encontrado. Usando VLC como alternativa.{Colors.RESET}")
                self.player_type = 'vlc'
            else:
                print(f"{Colors.YELLOW}⚠️ mpv no encontrado. Usando navegador web.{Colors.RESET}")
                self.player_type = 'browser'

        elif self.player_type == 'vlc' and not shutil.which('vlc'):
            self.player_type = 'browser'

    @staticmethod
    def is_youtube_link(link: str) -> bool:
        """Devuelve True si el link es de YouTube o YouTube Music."""
        return any(d in link for d in ('youtube.com', 'youtu.be', 'music.youtube.com'))

    @staticmethod
    def extract_stream_url(target: str, audio_only: bool = False, debug: bool = False) -> Optional[str]:
        """Usa yt-dlp como intermediario para extraer la URL directa de streaming (HLS o CDN de YouTube).
        Utiliza el solver JS remoto para evadir el error HTTP 403 Forbidden en VLC.
        """
        if not shutil.which('yt-dlp'):
            if debug:
                print(f"{Colors.YELLOW}[DEBUG] yt-dlp no encontrado en el sistema.{Colors.RESET}")
            return None

        # Detectar runtime JS disponible para yt-dlp
        node_bin = shutil.which('node') or shutil.which('nodejs')
        deno_bin = shutil.which('deno')

        # Forzar selección de stream HLS m3u8 para evitar el error 403 Forbidden que YouTube impone a peticiones externas
        fmt = 'best[protocol*=m3u8]/best[ext=mp4]/best'
        cmd = [
            'yt-dlp',
            '--no-warnings',
            '--no-playlist',
            '--no-update',
            '--remote-components', 'ejs:github',
            '-f', fmt,
            '-g', target
        ]

        if node_bin:
            cmd.extend(['--js-runtimes', f'node:{node_bin}'])
        elif deno_bin:
            cmd.extend(['--js-runtimes', f'deno:{deno_bin}'])

        if debug:
            print(f"{Colors.CYAN}[DEBUG] Ejecutando extractor yt-dlp:{Colors.RESET} {' '.join(cmd)}")

        try:
            res = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE if not debug else None,
                text=True,
                timeout=20
            )
            if res.returncode == 0 and res.stdout.strip():
                urls = [u.strip() for u in res.stdout.strip().splitlines() if u.strip().startswith('http')]
                if urls:
                    if debug:
                        print(f"{Colors.GREEN}[DEBUG] Stream resuelto con éxito:{Colors.RESET} {urls[0][:100]}...")
                    return urls[0]
            elif debug and res.stderr:
                print(f"{Colors.RED}[DEBUG] yt-dlp stderr:{Colors.RESET} {res.stderr}")
        except Exception as e:
            if debug:
                print(f"{Colors.RED}[DEBUG] Excepción en yt-dlp: {e}{Colors.RESET}")
            else:
                print(f"{Colors.YELLOW}⚠️ yt-dlp no pudo extraer el stream directo: {e}{Colors.RESET}")
        return None

    def resolve_target(self, song: Dict[str, Any]) -> str:
        """Determina la URL o término de búsqueda óptimo para reproducir la canción."""
        link = song.get('link', '').strip()
        title = song.get('title', '').strip()
        artist = song.get('artist', '').strip()

        # Si es enlace directo de YouTube / YouTube Music
        if self.is_youtube_link(link):
            return link

        # Si es enlace de Spotify o búsqueda sin link directo
        query = f"{artist} - {title}".strip(' -')
        if not query:
            query = link if link else "Lofi Hip Hop Beats"

        return f"ytsearch1:{query}"

    def _effective_player(self, song: Dict[str, Any]) -> str:
        """Determina el reproductor efectivo a usar.
        Prioriza mpv (el más ligero, estable y con OSD nativo para HDMI TV).
        Si mpv no está instalado, utiliza VLC como alternativa.
        """
        if self.player_type == 'mpv':
            if shutil.which('mpv'):
                return 'mpv'
            elif shutil.which('vlc'):
                return 'vlc'
            return 'browser'

        if self.player_type == 'vlc':
            if shutil.which('vlc'):
                return 'vlc'
            elif shutil.which('mpv'):
                return 'mpv'
            return 'browser'

        return self.player_type

    def play(self, song: Dict[str, Any]):
        """Detiene cualquier reproducción anterior y lanza el nuevo tema."""
        self.stop()
        self.current_song = song
        target = self.resolve_target(song)

        title = song.get('title', 'Canción')
        artist = song.get('artist', '')
        requester = song.get('requestedBy', {}).get('name', 'Estudiante')
        osd_text = f"🎵 {title} - {artist} | Pedido por: {requester}"

        effective = self._effective_player(song)
        if self.debug:
            print(f"{Colors.CYAN}[DEBUG] Reproductor efectivo seleccionado: {effective}{Colors.RESET}")

        cmd = []
        if effective == 'mpv':
            print(f"{Colors.DIM}⏳ Resolviendo stream HLS mediante yt-dlp...{Colors.RESET}")
            stream_url = self.extract_stream_url(target, audio_only=self.audio_only, debug=self.debug)
            mpv_target = stream_url if stream_url else target

            cmd = ['mpv', f'--volume={self.volume}']
            if self.fullscreen:
                cmd.append('--fs')
            if self.audio_only:
                cmd.append('--no-video')
            cmd.extend([
                '--no-terminal',
                f'--title={title} - Incuyo Música',
                f'--osd-msg1={osd_text}',
                '--hr-seek=yes',
                mpv_target
            ])

        elif effective == 'vlc':
            print(f"{Colors.DIM}⏳ Resolviendo stream directo mediante yt-dlp...{Colors.RESET}")
            stream_url = self.extract_stream_url(target, audio_only=self.audio_only, debug=self.debug)
            vlc_target = stream_url if stream_url else target

            cmd = [
                'vlc',
                '--play-and-exit',
                '--network-caching=1500',
                f'--gain={round(self.volume / 100.0, 2)}'
            ]
            if self.fullscreen:
                cmd.append('--fullscreen')
            if self.audio_only:
                cmd.extend(['--no-video', '--intf', 'dummy'])
            cmd.extend([
                '--meta-title', f'{title} - Incuyo Música',
                vlc_target
            ])

        else:  # browser
            browser_target = target
            if target.startswith('ytsearch1:'):
                query = target.replace('ytsearch1:', '', 1)
                browser_target = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"

            chrome_bin = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('firefox')
            if chrome_bin:
                cmd = [chrome_bin]
                if self.fullscreen:
                    cmd.append('--kiosk')
                cmd.append(browser_target)
            else:
                cmd = ['xdg-open', browser_target]

        if self.debug:
            print(f"{Colors.CYAN}[DEBUG] Lanzando reproductor ({effective}):{Colors.RESET} {' '.join(cmd[:4])} ...")

        try:
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL if not self.debug else None,
                stderr=subprocess.DEVNULL if not self.debug else None
            )
            if self.debug:
                print(f"{Colors.GREEN}[DEBUG] Proceso iniciado con PID: {self.current_process.pid}{Colors.RESET}")
        except Exception as e:
            print(f"{Colors.RED}❌ Error al iniciar reproductor: {e}{Colors.RESET}")

    def is_playing(self) -> bool:
        """Verifica si el proceso de reproducción sigue en ejecución."""
        if self.current_process is None:
            return False
        return self.current_process.poll() is None

    def stop(self):
        """Detiene la reproducción actual de manera limpia."""
        if self.current_process is not None:
            try:
                self.current_process.terminate()
                self.current_process.wait(timeout=2)
            except Exception:
                try:
                    self.current_process.kill()
                except Exception:
                    pass
            self.current_process = None
        self.current_song = None

# ==================== BUCLE PRINCIPAL Y GESTOR DE EVENTOS ====================

def print_banner(server_url: str, player: str, fullscreen: bool, auto_next: bool, volume: int = 50):
    os.system('clear' if os.name == 'posix' else 'cls')
    print(f"{Colors.CYAN}{Colors.BOLD}╔═══════════════════════════════════════════════════════════════════╗{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}║      🎵 CancionesEstudiantes - Cliente TV HDMI (Incuyo)          ║{Colors.RESET}")
    print(f"{Colors.CYAN}{Colors.BOLD}╚═══════════════════════════════════════════════════════════════════╝{Colors.RESET}")
    print(f" 🌐 Servidor Conectado:  {Colors.GREEN}{server_url}{Colors.RESET}")
    print(f" 📺 Salida HDMI:         {Colors.MAGENTA}{player.upper()}{Colors.RESET} (Pantalla Completa: {'Sí' if fullscreen else 'No'})")
    print(f" 🔊 Volumen Inicial:     {Colors.GREEN}{volume}%{Colors.RESET}")
    print(f" ⚡ Auto-Play Cola:      {Colors.YELLOW}{'Activado (Avanza automáticamente)' if auto_next else 'Desactivado (Control manual del Profe)'}{Colors.RESET}")
    print(f" 🛑 Presiona {Colors.BOLD}Ctrl + C{Colors.RESET} en esta terminal para detener el reproductor.")
    print(f"{Colors.DIM}─────────────────────────────────────────────────────────────────────{Colors.RESET}\n")

def display_status(song: Optional[Dict], pending_songs: list, config: Dict):
    anuncio = config.get('announcement', 'Clases de programación en Incuyo')
    modo = config.get('currentMode', 'Concentración y Código')

    print(f"\r{Colors.DIM}[Anuncio Actual]{Colors.RESET} {anuncio[:60]}... | {Colors.MAGENTA}Modo: {modo}{Colors.RESET}")

    if song:
        title = song.get('title', 'Sin título')
        artist = song.get('artist', 'Artista desconocido')
        req = song.get('requestedBy', {})
        req_name = req.get('name', 'Estudiante')
        req_course = req.get('course', '')
        avatar = req.get('avatar', '🎧')
        note = song.get('note', '')
        votes = song.get('votes', 0)

        print(f"\n{Colors.GREEN}{Colors.BOLD}▶️ REPRODUCIENDO EN PANTALLA HDMI:{Colors.RESET}")
        print(f"   🎵 {Colors.BOLD}{title}{Colors.RESET} - {artist}")
        print(f"   {avatar} Solicitado por: {Colors.CYAN}{req_name}{Colors.RESET} ({req_course})")
        if note:
            print(f"   💬 Nota: \"{Colors.YELLOW}{note}{Colors.RESET}\"")
        print(f"   🔥 Votos: {votes}")
    else:
        print(f"\n{Colors.YELLOW}⏸️ En espera: Ninguna canción seleccionada en 'Sonando Ahora'.{Colors.RESET}")
        print(f"{Colors.DIM}   Esperando que el Profe Franco seleccione un tema o que los alumnos voten.{Colors.RESET}")

    if pending_songs:
        print(f"\n{Colors.DIM}📋 Próximas canciones en cola ({len(pending_songs)} en espera):{Colors.RESET}")
        for i, s in enumerate(pending_songs[:3], 1):
            s_title = s.get('title', 'Tema')
            s_votes = s.get('votes', 0)
            s_user = s.get('requestedBy', {}).get('name', 'Alumno')
            print(f"   {i}. {s_title} ({s_votes} votos) - {Colors.DIM}{s_user}{Colors.RESET}")
    print(f"{Colors.DIM}─────────────────────────────────────────────────────────────────────{Colors.RESET}")

def check_system_dependencies(selected_player: str = 'mpv') -> bool:
    """Verifica si las herramientas esenciales están instaladas en Linux Mint / Ubuntu.
    Si falta alguna, muestra un mensaje con el comando exacto para instalarla.
    """
    missing_apt = []

    # 1. Reproductor (Recomendado: mpv para HDMI TV)
    if selected_player == 'mpv' and not shutil.which('mpv'):
        missing_apt.append('mpv')
    elif selected_player == 'vlc' and not shutil.which('vlc'):
        missing_apt.append('vlc')

    # 2. Extractor de streams
    if not shutil.which('yt-dlp'):
        missing_apt.append('yt-dlp')

    # 3. Runtime JS necesario para descifrar retos de firma de YouTube
    if not shutil.which('node') and not shutil.which('nodejs') and not shutil.which('deno'):
        missing_apt.append('nodejs')

    if missing_apt:
        print(f"\n{Colors.RED}{Colors.BOLD}╔═══════════════════════════════════════════════════════════════════╗{Colors.RESET}")
        print(f"{Colors.RED}{Colors.BOLD}║   ⚠️  FALTAN DEPENDENCIAS DEL SISTEMA PARA REPRODUCCIÓN HDMI      ║{Colors.RESET}")
        print(f"{Colors.RED}{Colors.BOLD}╚═══════════════════════════════════════════════════════════════════╝{Colors.RESET}")
        print(f"Para reproducir música en Linux Mint sin errores se necesitan: {Colors.YELLOW}{', '.join(missing_apt)}{Colors.RESET}\n")
        print(f"👉 {Colors.BOLD}Instalación rápida en Linux Mint (copiá y pegá en la terminal):{Colors.RESET}\n")
        print(f"   {Colors.GREEN}{Colors.BOLD}sudo apt update && sudo apt install -y {' '.join(missing_apt)}{Colors.RESET}\n")
        print(f"{Colors.DIM}💡 Tip: También podés instalar o actualizar el extractor con: pip install -r requirements.txt{Colors.RESET}")
        print(f"{Colors.DIM}─────────────────────────────────────────────────────────────────────{Colors.RESET}\n")
        time.sleep(2)
        return False
    return True

def main():
    load_dotenv()

    parser = argparse.ArgumentParser(description="Cliente reproductor HDMI para CancionesEstudiantes.")
    parser.add_argument('--url', default=os.getenv('SERVER_URL', 'https://canciones-estudiantes.vercel.app/'),
                        help="URL base del servidor (default: https://canciones-estudiantes.vercel.app/)")
    parser.add_argument('--player', default=os.getenv('PLAYER', 'mpv'), choices=['mpv', 'vlc', 'browser'],
                        help="Motor de reproducción a usar (default: mpv)")
    parser.add_argument('--fullscreen', action='store_true', default=True,
                        help="Abrir en pantalla completa (Recomendado para HDMI TV)")
    parser.add_argument('--no-fullscreen', dest='fullscreen', action='store_false',
                        help="No usar pantalla completa")
    parser.add_argument('--audio-only', action='store_true', default=os.getenv('AUDIO_ONLY', 'false').lower() == 'true',
                        help="Reproducir únicamente audio sin video")
    parser.add_argument('--auto-next', action='store_true', default=True,
                        help="Avanzar automáticamente a la siguiente canción de la cola al terminar")
    parser.add_argument('--interval', type=float, default=3.0,
                        help="Intervalo de consulta a la API en segundos (default: 3.0)")
    parser.add_argument('--teacher-email', default=os.getenv('TEACHER_EMAIL', 'franco@incuyo.edu.ar'),
                        help="Correo de Franco Profe para actualizar estados automáticamente")
    parser.add_argument('--teacher-pass', default=os.getenv('TEACHER_PASSWORD', 'profe123'),
                        help="Contraseña de Franco Profe")
    parser.add_argument('--debug', action='store_true', default=os.getenv('DEBUG', 'false').lower() == 'true',
                        help="Activar modo depuración con información detallada de comandos y streams")
    parser.add_argument('--volume', type=int, default=int(os.getenv('VOLUME', '50')),
                        help="Volumen inicial de reproducción del 0 al 100 (default: 50)")
    parser.add_argument('--test', type=str, default=None,
                        help="Probar inmediatamente la reproducción de una URL o canción y salir")

    args = parser.parse_args()

    # Comprobación de requerimientos para Linux Mint / Ubuntu
    check_system_dependencies(selected_player=args.player)

    api = CancionesAPI(args.url, args.teacher_email, args.teacher_pass)
    media = MediaEngine(
        player=args.player,
        fullscreen=args.fullscreen,
        audio_only=args.audio_only,
        debug=args.debug,
        volume=args.volume
    )

    def handle_exit(sig, frame):
        print(f"\n\n{Colors.YELLOW}Cerrando reproductor HDMI limpiamente...{Colors.RESET}")
        media.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    # Si se pasó el parámetro --test, ejecutamos la prueba directamente y esperamos
    if args.test:
        print(f"\n{Colors.BOLD}{Colors.CYAN}🧪 MODO DE PRUEBA ACTIVO:{Colors.RESET} {args.test}")
        test_song = {
            'id': 'test-song',
            'title': 'Prueba de Reproducción',
            'artist': 'VLC & yt-dlp',
            'link': args.test,
            'requestedBy': {'name': 'Test Mode', 'avatar': '🧪', 'course': 'Debug'}
        }
        media.play(test_song)
        print(f"{Colors.GREEN}▶️ Reproduciendo tema de prueba. Presiona Ctrl + C para terminar.{Colors.RESET}")
        while media.is_playing():
            time.sleep(1)
        print(f"\n{Colors.GREEN}✅ Prueba finalizada exitosamente.{Colors.RESET}")
        sys.exit(0)

    print_banner(args.url, media.player_type, args.fullscreen, args.auto_next, media.volume)

    # Intentar login del docente para modo auto-next
    if args.auto_next:
        if api.login_teacher():
            print(f"🔑 {Colors.GREEN}Autenticado como Docente (Franco Profe) para avance de cola automático.{Colors.RESET}\n")
        else:
            print(f"ℹ️ {Colors.YELLOW}Modo auto-next activo sin autenticación docente (sincronizará solo canciones en 'playing').{Colors.RESET}\n")

    current_playing_id: Optional[str] = None
    last_ui_update = 0

    while True:
        try:
            state = api.fetch_state()
            if not state:
                time.sleep(args.interval)
                continue

            stats = state.get('stats', {})
            server_playing = stats.get('playing')
            config = state.get('config', {})
            all_songs = state.get('songs', [])
            pending_songs = sorted(
                [s for s in all_songs if s.get('status') == 'pending'],
                key=lambda s: s.get('votes', 0),
                reverse=True
            )

            # CASO 1: El servidor tiene una canción en estado 'playing'
            if server_playing:
                new_id = server_playing.get('id')
                if new_id != current_playing_id:
                    current_playing_id = new_id
                    print_banner(args.url, media.player_type, args.fullscreen, args.auto_next, media.volume)
                    display_status(server_playing, pending_songs, config)
                    media.play(server_playing)

            # CASO 2: El proceso de reproducción terminó de reproducir el tema
            if media.current_song and not media.is_playing():
                finished_song = media.current_song
                print(f"\n{Colors.GREEN}✅ Tema finalizado: {finished_song.get('title')}{Colors.RESET}")

                # Marcar como reproducida en el servidor
                api.set_song_status(finished_song['id'], 'played')
                media.stop()
                current_playing_id = None

                # Si auto-next está activo y hay canciones en espera, iniciar la más votada
                if args.auto_next and pending_songs:
                    next_song = pending_songs[0]
                    print(f"⏭️ {Colors.CYAN}Iniciando siguiente tema de la cola: {next_song.get('title')}...{Colors.RESET}")
                    api.set_song_status(next_song['id'], 'playing')
                    current_playing_id = next_song['id']
                    media.play(next_song)
                    print_banner(args.url, media.player_type, args.fullscreen, args.auto_next, media.volume)
                    display_status(next_song, pending_songs[1:], config)

            # Actualizar interfaz de terminal periódicamente si cambia el estado
            now = time.time()
            if now - last_ui_update > 15:
                last_ui_update = now
                print_banner(args.url, media.player_type, args.fullscreen, args.auto_next, media.volume)
                display_status(server_playing, pending_songs, config)

        except Exception as e:
            print(f"{Colors.RED}Error en bucle de sincronización: {e}{Colors.RESET}")

        time.sleep(args.interval)

if __name__ == '__main__':
    main()
