// Clase base Usuario (Unidad 2: Clases y Objetos)
class Usuario {
    constructor(id, nombre, correo) {
        this.id = id;
        this.nombre = nombre;
        this.correo = correo;
    }

    obtenerIniciales() {
        return this.nombre
            .split(' ')
            .map(palabra => palabra[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }
}

// Subclase que hereda de Usuario (Unidad 2: Herencia)
class MiembroGrupo extends Usuario {
    constructor(id, nombre, correo, rol = 'Integrante', saldo = 0) {
        super(id, nombre, correo);
        this.rol = rol;
        this.saldo = parseFloat(saldo);
    }

    actualizarSaldo(monto) {
        this.saldo += parseFloat(monto);
    }
}