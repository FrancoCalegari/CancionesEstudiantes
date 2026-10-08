require('dotenv').config();
const db = require('./data/db');

async function clearTestData() {
  console.log("Limpiando datos de prueba...");
  try {
    // 1. Eliminar votos
    await db.query(`DELETE FROM song_voters`);
    
    // 2. Eliminar canciones
    await db.query(`DELETE FROM songs`);
    
    // 3. Eliminar estudiantes (mantener solo al administrador / profesor)
    await db.query(`DELETE FROM users WHERE role != 'teacher'`);
    
    // 4. Si por alguna razón no existe el admin, lo re-creamos para asegurar acceso
    const adminCheck = await db.query(`SELECT * FROM users WHERE email = 'franco@incuyo.edu.ar'`);
    if (adminCheck.length === 0) {
      await db.query(`
        INSERT INTO users (id, name, email, password, role, course, avatar, createdAt) VALUES 
        ('user-profe', 'Franco (Profe)', 'franco@incuyo.edu.ar', 'profe123', 'teacher', 'Docente Incuyo', '👨‍🏫', NOW())
      `);
    }

    console.log("✅ Datos de prueba (estudiantes y canciones) eliminados con éxito.");
    console.log("👨‍🏫 La cuenta de administrador (Franco Profe) sigue activa.");
  } catch (err) {
    console.error("Error al limpiar la base de datos:", err);
  }
}

clearTestData();
