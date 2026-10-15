# 🎵 CancionesEstudiantes - Incuyo & Franco Profe

Plataforma web construida con **Node.js, Express y Vanilla CSS**, optimizada para despliegue instantáneo en **Vercel**, diseñada para que los estudiantes de **Incuyo** soliciten y voten canciones de **YouTube** o **Spotify** durante las clases de programación con el **Profe Franco**.

---

## 🌟 Características Principales

1. **🎧 Playlist Colaborativa en Vivo**:
   - Los estudiantes pueden enviar canciones pegando enlaces directos de **YouTube**, **Spotify** o escribiendo el **nombre/artista** del tema.
   - Detección automática de plataforma y enlace.
   - Dedicatorias y notas personalizadas por alumno ("para desbugear CSS", "modo concentración").

2. **🔐 Autenticación para Estudiantes y Docente**:
   - Registro con Nombre, Correo, Carrera/Curso de Incuyo y Avatar.
   - Inicio de sesión rápido para pruebas (Franco Profe, Matías, Sofía).
   - Identificación visible de cada petición: Franco Profe siempre sabe qué estudiante pidió cada canción.

3. **👨‍🏫 Panel de Control Exclusivo para Franco Profe**:
   - Marcador de canciones: *Sonando Ahora ▶️*, *Reproducida ✅*, *En Cola 🕒*.
   - Botón directo para abrir el video en YouTube / Spotify o escuchar la vista previa.
   - Barra de Anuncios en vivo para la clase (ej: "¡Hoy es clase de React, manden synthwave!").
   - Interruptor para habilitar o pausar la recepción de nuevas canciones.

4. **🔥 Sistema de Votación Comunitaria**:
   - Los estudiantes pueden votar sus temas favoritos para que suban en la lista de espera.

5. **⚡ Reproductor Integrado y Animaciones**:
   - Disco de vinilo animado en el reproductor principal.
   - Visualizador de frecuencias y ecualizador en vivo.
   - Modales interactivos usando la API nativa de `<dialog>`.
   - Diseño moderno Dark Mode con estética Glassmorphism y neón.

---

## 🚀 Despliegue en Vercel (Paso a Paso)

El proyecto incluye la configuración lista en `vercel.json` y el endpoint en `api/index.js`.

### Opción 1: Con Vercel CLI
```bash
npm i -g vercel
vercel
```

### Opción 2: Con GitHub y el Dashboard de Vercel
1. Subí este proyecto a un repositorio de GitHub / GitLab.
2. Ingresá a [vercel.com](https://vercel.com) e importá el repositorio.
3. El framework preset se detectará automáticamente (Node.js). Hacé clic en **Deploy**.

---

## 💻 Ejecución Local

Para ejecutar el servidor localmente:

```bash
# Instalar dependencias
npm install

# Iniciar servidor
npm start
# o en modo desarrollo con recarga automática:
npm run dev
```

Abrí tu navegador en: [http://localhost:3005](http://localhost:3005)

---

## 📺 Reproductor HDMI para el Televisor de la Clase (`clientMusic.py`)

Si tenés una computadora conectada por HDMI al televisor del aula, ejecutá el cliente de reproducción sincronizado en tiempo real con la web:

```bash
# Instalar dependencias de Python (yt-dlp):
pip install -r requirements.txt

# Iniciar reproductor (conectado por defecto a Producción en Vercel):
python3 clientMusic.py

# O conectar al servidor local si estás desarrollando:
python3 clientMusic.py --url http://localhost:3005

# Opciones útiles:
python3 clientMusic.py --player vlc --debug   # Modo depuración con VLC
python3 clientMusic.py --player vlc --test "https://www.youtube.com/watch?v=..."  # Prueba inmediata
```

### Requisitos del Sistema para HDMI:
- **Python 3.10+**
- **VLC** (`sudo apt install vlc`)
- **Node.js** (`sudo apt install nodejs`) – Necesario para resolver firmas JavaScript de YouTube en streams HLS
- **yt-dlp** (`pip install -r requirements.txt` o `sudo apt install yt-dlp`)

### Características del Cliente HDMI:
- **Pantalla Completa Automática:** Inicia el video de YouTube a pantalla completa en el televisor usando `mpv` (o VLC/Navegador).
- **Cartel en Pantalla (OSD):** Muestra el título del tema, artista y el estudiante que lo solicitó.
- **Modo DJ / Auto-Next:** Al terminar la canción, avanza automáticamente al siguiente tema más votado de la cola y actualiza el servidor.
- **Control Remoto desde la Web:** Cada vez que el Profe Franco presiona *Reproducir ▶️* desde su celular o laptop, el televisor cambia de tema inmediatamente.

---

## 👥 Cuentas de Demostración Iniciales

| Rol | Nombre | Correo | Contraseña |
|---|---|---|---|
| **Docente** | Franco (Profe) | `franco@incuyo.edu.ar` | `profe123` |
| **Estudiante** | Matías Rodríguez | `matias@estudiante.incuyo.edu.ar` | `123` |
| **Estudiante** | Sofía Álvarez | `sofia@estudiante.incuyo.edu.ar` | `123` |
| **Estudiante** | Lucas Benítez | `lucas@estudiante.incuyo.edu.ar` | `123` |

*(También podés crear nuevas cuentas de estudiantes desde el botón de Registro en la interfaz).*

---

## 📁 Estructura del Proyecto

```
CancionesEstudiantes/
├── api/
│   └── index.js             # Función serverless para Vercel
├── data/
│   └── store.js             # Almacén de usuarios, canciones y configuración
├── public/
│   ├── css/
│   │   └── style.css        # Sistema de diseño, Glassmorphism, animaciones
│   ├── js/
│   │   └── app.js           # Lógica frontend, sincronización en tiempo real y audio
│   └── index.html           # Landing page y vistas interactivas
├── server.js                # Servidor Express local y API REST
├── vercel.json              # Configuración de rutas y servidor para Vercel
├── package.json
└── README.md
```
