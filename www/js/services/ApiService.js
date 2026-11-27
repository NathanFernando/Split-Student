class ApiService {
    static BASE_URL = 'https://split-student.onrender.com/api';

    static registrarUsuario(nombre, correo, password) {
        return this.peticion('/registro', {
            method: 'POST',
            body: JSON.stringify({ nombre, correo, password })
        });
    }

    static login(correo, password) {
        return this.peticion('/login', { method: 'POST', body: JSON.stringify({ correo, password }) });
    }

    static async peticion(endpoint, opciones = {}) {
        try {
            const respuesta = await fetch(`${this.BASE_URL}${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                ...opciones
            });
            const datos = await respuesta.json();
            if (!respuesta.ok) {
                throw new Error(datos.mensaje || 'Error en la comunicación con el servidor');
            }
            return datos;
        } catch (error) {
            console.error(`Error API [${endpoint}]:`, error);
            throw error;
        }
    }

    static obtenerGrupos(usuarioId) {
        return this.peticion(`/grupos/${usuarioId}`);
    }

    static crearGrupo(payload) {
        return this.peticion('/grupos', { method: 'POST', body: JSON.stringify(payload) });
    }

    static eliminarGrupo(idGrupo, usuarioId) {
        return this.peticion(`/grupos/${idGrupo}/${usuarioId}`, { method: 'DELETE' });
    }

    static obtenerGastos() {
        return this.peticion('/gastos');
    }

    static crearGasto(payload) {
        return this.peticion('/gastos', { method: 'POST', body: JSON.stringify(payload) });
    }

    static editarGasto(id, payload) {
        return this.peticion(`/gastos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    }

    static alternarLiquidado(id) {
        return this.peticion(`/gastos/${id}/liquidar`, { method: 'PATCH' });
    }

    static eliminarGasto(id, usuarioId) {
        return this.peticion(`/gastos/${id}/${usuarioId}`, { method: 'DELETE' });
    }
    
    static unirseAGrupo(codigo, id_usuario) {
        return this.peticion('/grupos/unirse', {
            method: 'POST',
            body: JSON.stringify({ codigo, id_usuario })
        });
    }
}