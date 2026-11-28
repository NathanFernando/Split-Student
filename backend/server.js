const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Soporta imágenes Base64 de tickets

// ==========================================
// ENDPOINTS DE GRUPOS
// ==========================================

// GET: Consultar grupos donde el usuario es admin o invitado
app.get('/api/grupos/:usuarioId', async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const [grupos] = await pool.query(`
            SELECT g.id_grupo AS id, g.nombre_grupo AS nombre, g.descripcion,
                   g.codigo_invitacion AS codigo, u.nombre AS creador, mg.rol
            FROM grupos g
            INNER JOIN miembros_grupo mg ON g.id_grupo = mg.id_grupo
            INNER JOIN usuarios u ON g.id_creador = u.id_usuario
            WHERE mg.id_usuario = ?
            ORDER BY g.id_grupo DESC
        `, [usuarioId]);

        for (let grupo of grupos) {
            const [miembros] = await pool.query(`
                SELECT u.id_usuario, u.nombre
                FROM miembros_grupo mg
                INNER JOIN usuarios u ON mg.id_usuario = u.id_usuario
                WHERE mg.id_grupo = ?
            `, [grupo.id]);
            grupo.miembros = miembros.map(m => m.nombre);
        }

        res.json({ ok: true, data: grupos });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al consultar grupos', error: error.message });
    }
});

// POST: Registrar un nuevo grupo
app.post('/api/grupos', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const codigoGenerado = Math.random().toString(36).substring(2, 8).toUpperCase();
        if (!nombre || !id_creador || !Array.isArray(miembros_nombres) || miembros_nombres.length < 1) {
            return res.status(400).json({ ok: false, mensaje: 'Datos incompletos o menos de 1 integrantes.' });
        }

        await conn.beginTransaction();
        const [resGrupo] = await conn.query(
            'INSERT INTO grupos (nombre_grupo, descripcion, codigo_invitacion, id_creador) VALUES (?, ?, ?, ?)',
            [nombre, descripcion || 'Grupo compartido', codigoGenerado, id_creador]
        );
        const nuevoGrupoId = resGrupo.insertId;

        for (const nombreMiembro of miembros_nombres) {
            const [users] = await conn.query('SELECT id_usuario FROM usuarios WHERE LOWER(nombre) = LOWER(?)', [nombreMiembro.trim()]);
            let uid;
            if (users.length > 0) {
                uid = users[0].id_usuario;
            } else {
                const correoTemp = `${nombreMiembro.trim().toLowerCase().replace(/\s+/g, '')}_${Date.now()}@splitstudent.local`;
                const [newU] = await conn.query(
                    'INSERT INTO usuarios (nombre, correo, password_hash) VALUES (?, ?, ?)',
                    [nombreMiembro.trim(), correoTemp, 'invitado_local']
                );
                uid = newU.insertId;
            }
            const rol = (uid === parseInt(id_creador)) ? 'admin' : 'invitado';
            await conn.query('INSERT IGNORE INTO miembros_grupo (id_grupo, id_usuario, rol) VALUES (?, ?, ?)', [nuevoGrupoId, uid, rol]);
        }

        await conn.commit();
        res.status(201).json({ ok: true, id_grupo: nuevoGrupoId, mensaje: 'Grupo creado en SQL.' });
    } catch (error) {
        await conn.rollback();
        res.status(500).json({ ok: false, mensaje: 'Error al crear grupo', error: error.message });
    } finally {
        conn.release();
    }
});

// ==========================================
// Generador de código de invitación
// ==========================================
function generarCodigoInvitacion(longitud = 6) {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codigo = '';
    for (let i = 0; i < longitud; i++) {
        codigo += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return codigo;
}

// POST: Registrar un nuevo grupo
app.post('/api/grupos', async (req, res) => {
    const { nombre, descripcion, id_creador, miembros_nombres } = req.body;

    if (!nombre || !String(nombre).trim() || !id_creador) {
        return res.status(400).json({ ok: false, mensaje: 'Se requiere el nombre del grupo y el ID del creador.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // Verificar que el creador exista
        const [creadores] = await conn.query(
            'SELECT id_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1',
            [id_creador]
        );
        if (creadores.length === 0) {
            await conn.rollback();
            return res.status(404).json({ ok: false, mensaje: 'El usuario creador no existe.' });
        }

        // Insertar grupo (reintenta si el código generado ya existe)
        let idGrupo, codigo;
        for (let intento = 0; intento < 5; intento++) {
            codigo = generarCodigoInvitacion();
            try {
                const [resGrupo] = await conn.query(
                    'INSERT INTO grupos (nombre_grupo, descripcion, codigo_invitacion, id_creador) VALUES (?, ?, ?, ?)',
                    [String(nombre).trim(), (descripcion || 'Grupo compartido').trim(), codigo, id_creador]
                );
                idGrupo = resGrupo.insertId;
                break;
            } catch (err) {
                if (err.code !== 'ER_DUP_ENTRY' || intento === 4) throw err;
            }
        }

        // El creador siempre es admin del grupo
        await conn.query(
            'INSERT INTO miembros_grupo (id_grupo, id_usuario, rol) VALUES (?, ?, ?)',
            [idGrupo, id_creador, 'admin']
        );

        // Resto de integrantes (si no existen, se crean como invitados locales)
        const lista = Array.isArray(miembros_nombres) ? miembros_nombres : [];
        for (const rawNombre of lista) {
            const nombreMiembro = String(rawNombre || '').trim();
            if (!nombreMiembro) continue;

            const [users] = await conn.query(
                'SELECT id_usuario FROM usuarios WHERE LOWER(nombre) = LOWER(?) LIMIT 1',
                [nombreMiembro]
            );

            let uid;
            if (users.length > 0) {
                uid = users[0].id_usuario;
            } else {
                const correoTemp = `${nombreMiembro.toLowerCase().replace(/\s+/g, '')}_${Date.now()}@splitstudent.local`;
                const [newU] = await conn.query(
                    'INSERT INTO usuarios (nombre, correo, password_hash) VALUES (?, ?, ?)',
                    [nombreMiembro, correoTemp, 'invitado_local']
                );
                uid = newU.insertId;
            }

            const rol = Number(uid) === Number(id_creador) ? 'admin' : 'invitado';
            await conn.query(
                'INSERT IGNORE INTO miembros_grupo (id_grupo, id_usuario, rol) VALUES (?, ?, ?)',
                [idGrupo, uid, rol]
            );
        }

        await conn.commit();
        res.status(201).json({
            ok: true,
            mensaje: 'Grupo creado correctamente.',
            id_grupo: idGrupo,
            codigo_invitacion: codigo
        });
    } catch (error) {
        await conn.rollback();
        res.status(500).json({ ok: false, mensaje: 'Error al crear grupo', error: error.message });
    } finally {
        conn.release();
    }
});

// POST: Unirse a un grupo con código de invitación
app.post('/api/grupos/unirse', async (req, res) => {
    try {
        const { codigo, id_usuario } = req.body;
        if (!codigo || !id_usuario) {
            return res.status(400).json({ ok: false, mensaje: 'Código y usuario son requeridos.' });
        }

        const [grupos] = await pool.query(
            'SELECT id_grupo, nombre_grupo FROM grupos WHERE codigo_invitacion = ? LIMIT 1',
            [String(codigo).trim().toUpperCase()]
        );
        if (grupos.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Código de invitación no válido.' });
        }

        const [yaMiembro] = await pool.query(
            'SELECT id_membresia FROM miembros_grupo WHERE id_grupo = ? AND id_usuario = ?',
            [grupos[0].id_grupo, id_usuario]
        );
        if (yaMiembro.length > 0) {
            return res.status(409).json({ ok: false, mensaje: 'Ya eres integrante de este grupo.' });
        }

        await pool.query(
            'INSERT INTO miembros_grupo (id_grupo, id_usuario, rol) VALUES (?, ?, ?)',
            [grupos[0].id_grupo, id_usuario, 'invitado']
        );
        res.json({ ok: true, mensaje: `Te uniste al grupo "${grupos[0].nombre_grupo}".` });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al unirse al grupo', error: error.message });
    }
});

// DELETE: Eliminar grupo con candado de seguridad (solo admin y sin deudas pendientes)
app.delete('/api/grupos/:idGrupo/:usuarioId', async (req, res) => {
    try {
        const { idGrupo, usuarioId } = req.params;

        const [grupoRows] = await pool.query('SELECT id_creador, nombre_grupo FROM grupos WHERE id_grupo = ?', [idGrupo]);
        if (grupoRows.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Grupo no encontrado.' });
        }

        // 1. Verificar que sea administrador
        if (grupoRows[0].id_creador !== parseInt(usuarioId)) {
            return res.status(403).json({ ok: false, mensaje: 'Solo el administrador puede eliminar este grupo.' });
        }

        // 2. Verificar que no existan gastos sin saldar (liquidado = 0)
        const [pendientes] = await pool.query(
            'SELECT COUNT(*) AS total, COALESCE(SUM(monto), 0) AS deuda FROM gastos WHERE id_grupo = ? AND liquidado = 0',
            [idGrupo]
        );

        if (pendientes[0].total > 0) {
            return res.status(409).json({
                ok: false,
                mensaje: `Bloqueado: Existen ${pendientes[0].total} gasto(s) sin saldar por $${pendientes[0].deuda} MXN.`
            });
        }

        await pool.query('DELETE FROM grupos WHERE id_grupo = ?', [idGrupo]);
        res.json({ ok: true, mensaje: 'Grupo eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al eliminar grupo', error: error.message });
    }
});

// ==========================================
// ENDPOINTS DE GASTOS (CRUD COMPLETO)
// ==========================================

// GET: Consultar todos los gastos y abonos
app.get('/api/gastos', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT g.id_gasto AS id, g.id_grupo AS grupoId, g.tipo, g.concepto, g.monto,
                   u.nombre AS pagadoPor, r.nombre AS receptor,
                   DATE_FORMAT(g.fecha_gasto, '%Y-%m-%d') AS fecha,
                   g.foto_ticket AS fotoTicket, g.liquidado
            FROM gastos g
            INNER JOIN usuarios u ON g.id_pagador = u.id_usuario
            LEFT JOIN usuarios r ON g.id_receptor = r.id_usuario
            ORDER BY g.id_gasto DESC
        `);
        res.json({
            ok: true,
            data: rows.map(r => ({ ...r, monto: parseFloat(r.monto), liquidado: Boolean(r.liquidado) }))
        });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al consultar gastos', error: error.message });
    }
});

// POST: Registrar nuevo gasto o abono
app.post('/api/gastos', async (req, res) => {
    try {
        const { grupoId, tipo = 'gasto', concepto, monto, pagadoPor, receptor, fotoTicket } = req.body;
        if (!grupoId || !concepto || !monto || monto <= 0 || !pagadoPor) {
            return res.status(400).json({ ok: false, mensaje: 'Campos inválidos o monto menor/igual a 0.' });
        }

        const [userRows] = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(nombre) = LOWER(?)', [pagadoPor.trim()]);
        if (userRows.length === 0) {
            return res.status(404).json({ ok: false, mensaje: `El usuario "${pagadoPor}" no existe.` });
        }

        let idReceptor = null;
        if (tipo === 'abono') {
            if (!receptor) {
                return res.status(400).json({ ok: false, mensaje: 'Debes indicar a quién se realiza el abono.' });
            }
            const [recRows] = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(nombre) = LOWER(?)', [receptor.trim()]);
            if (recRows.length === 0) {
                return res.status(404).json({ ok: false, mensaje: `El receptor "${receptor}" no existe.` });
            }
            idReceptor = recRows[0].id_usuario;
        }

        const [result] = await pool.query(
            'INSERT INTO gastos (id_grupo, id_pagador, tipo, id_receptor, concepto, monto, foto_ticket, fecha_gasto) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())',
            [grupoId, userRows[0].id_usuario, tipo, idReceptor, concepto.trim(), monto, fotoTicket || null]
        );

        res.status(201).json({ ok: true, id_gasto: result.insertId, mensaje: tipo === 'abono' ? 'Abono registrado.' : 'Gasto registrado.' });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al registrar movimiento', error: error.message });
    }
});

// PUT: Editar gasto existente
app.put('/api/gastos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { grupoId, concepto, monto, pagadoPor } = req.body;

        const [userRows] = await pool.query('SELECT id_usuario FROM usuarios WHERE LOWER(nombre) = LOWER(?)', [pagadoPor.trim()]);
        if (userRows.length === 0) {
            return res.status(404).json({ ok: false, mensaje: `Pagador "${pagadoPor}" no encontrado.` });
        }

        await pool.query(
            'UPDATE gastos SET id_grupo = ?, concepto = ?, monto = ?, id_pagador = ? WHERE id_gasto = ?',
            [grupoId, concepto.trim(), monto, userRows[0].id_usuario, id]
        );
        res.json({ ok: true, mensaje: 'Gasto actualizado correctamente.' });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al actualizar gasto', error: error.message });
    }
});

// PATCH: Saldar o reabrir un gasto
app.patch('/api/gastos/:id/liquidar', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE gastos SET liquidado = NOT liquidado WHERE id_gasto = ?', [id]);
        res.json({ ok: true, mensaje: 'Estado de liquidación actualizado.' });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al cambiar estado de liquidación', error: error.message });
    }
});

// DELETE: Eliminar gasto o abono (solo el autor del registro o el administrador del grupo)
app.delete('/api/gastos/:id/:usuarioId', async (req, res) => {
    try {
        const { id, usuarioId } = req.params;
        const uid = parseInt(usuarioId);

        const [rows] = await pool.query(`
            SELECT g.id_pagador, gr.id_creador
            FROM gastos g
            INNER JOIN grupos gr ON g.id_grupo = gr.id_grupo
            WHERE g.id_gasto = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado.' });
        }

        const esAutor = rows[0].id_pagador === uid;
        const esAdminGrupo = rows[0].id_creador === uid;

        if (!esAutor && !esAdminGrupo) {
            return res.status(403).json({
                ok: false,
                mensaje: 'No tienes permiso: solo el administrador del grupo o quien registró este movimiento puede eliminarlo.'
            });
        }

        await pool.query('DELETE FROM gastos WHERE id_gasto = ?', [id]);
        res.json({ ok: true, mensaje: 'Registro eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al eliminar registro', error: error.message });
    }
});

// POST: Iniciar sesión de usuario
app.post('/api/login', async (req, res) => {
    try {
        const { correo, password } = req.body;
        if (!correo || !password) {
            return res.status(400).json({ ok: false, mensaje: 'Ingresa correo y contraseña.' });
        }

        const [rows] = await pool.query(
            'SELECT id_usuario, nombre, correo FROM usuarios WHERE LOWER(correo) = LOWER(?) AND password_hash = ?',
            [correo.trim(), password.trim()]
        );

        if (rows.length === 0) {
            return res.status(401).json({ ok: false, mensaje: 'Correo o contraseña incorrectos.' });
        }

        res.json({ ok: true, usuario: rows[0] });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al iniciar sesión', error: error.message });
    }
});

// POST: Registro rápido de usuario (sin verificación de correo)
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, correo, password } = req.body;
        if (!nombre || !correo || !password) {
            return res.status(400).json({ ok: false, mensaje: 'Completa usuario, correo electrónico y contraseña.' });
        }

        const nombreLimpio = nombre.trim();
        const correoLimpio = correo.trim().toLowerCase();

        // Verifica si el correo ya está registrado por otro usuario
        const [existeCorreo] = await pool.query(
            'SELECT id_usuario FROM usuarios WHERE LOWER(correo) = ?',
            [correoLimpio]
        );
        if (existeCorreo.length > 0) {
            return res.status(409).json({ ok: false, mensaje: 'Ese correo electrónico ya está registrado.' });
        }

        // Si el usuario fue agregado como invitado provisional previamente, reclama su cuenta
        const [invitadoPrevio] = await pool.query(
            "SELECT id_usuario FROM usuarios WHERE LOWER(nombre) = LOWER(?) AND password_hash = 'invitado_local'",
            [nombreLimpio]
        );

        let usuarioCreado;
        if (invitadoPrevio.length > 0) {
            const idExistente = invitadoPrevio[0].id_usuario;
            await pool.query(
                'UPDATE usuarios SET correo = ?, password_hash = ? WHERE id_usuario = ?',
                [correoLimpio, password.trim(), idExistente]
            );
            usuarioCreado = { id_usuario: idExistente, nombre: nombreLimpio, correo: correoLimpio };
        } else {
            const [result] = await pool.query(
                'INSERT INTO usuarios (nombre, correo, password_hash) VALUES (?, ?, ?)',
                [nombreLimpio, correoLimpio, password.trim()]
            );
            usuarioCreado = { id_usuario: result.insertId, nombre: nombreLimpio, correo: correoLimpio };
        }

        res.status(201).json({ ok: true, usuario: usuarioCreado, mensaje: 'Cuenta creada correctamente.' });
    } catch (error) {
        res.status(500).json({ ok: false, mensaje: 'Error al registrar cuenta', error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API SplitStudent ejecutándose en http://localhost:${PORT}`));