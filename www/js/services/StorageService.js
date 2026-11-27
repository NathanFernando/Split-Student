class StorageService {
    static CLAVE_GRUPOS = 'splitstudent_grupos';
    static CLAVE_GASTOS = 'splitstudent_gastos';

    static guardarGrupos(grupos) {
        localStorage.setItem(this.CLAVE_GRUPOS, JSON.stringify(grupos));
    }

    static obtenerGrupos() {
        const datos = localStorage.getItem(this.CLAVE_GRUPOS);
        if (!datos) {
            // Datos iniciales de prueba
            const iniciales = [
                {
                    id: 1,
                    nombre: 'Proyecto Apps Híbridas',
                    descripcion: 'Impresiones, materiales y café de equipo',
                    creador: 'Nathan', //admin
                    miembros: ['Nathan', 'Ana', 'Luis', 'Carlos']
                },
                {
                    id: 2,
                    nombre: 'Gastos Depa 302',
                    descripcion: 'Internet, luz y despensa compartida',
                    creador: 'Luis', //eres integrante
                    miembros: ['Nathan', 'Luis']
                }
            ];
            this.guardarGrupos(iniciales);
            return iniciales;
        }
        return JSON.parse(datos);
    }

    static guardarGastos(gastos) {
        localStorage.setItem(this.CLAVE_GASTOS, JSON.stringify(gastos));
    }


    static obtenerGastos() {
        const datos = localStorage.getItem(this.CLAVE_GASTOS);
        if (!datos) {
            const iniciales = [
                new Gasto(101, 1, 'Impresión de planos y brief', 160.00, 'Nathan'),
                new Gasto(102, 1, 'Compra de cables USB y adaptador', 240.00, 'Ana')
            ];
            this.guardarGastos(iniciales);
            return iniciales;
        }
        return JSON.parse(datos).map(
            g => new Gasto(g.id, g.grupoId, g.concepto, g.monto, g.pagadoPor, g.fecha, g.fotoTicket, g.liquidado)
        );
    }
}