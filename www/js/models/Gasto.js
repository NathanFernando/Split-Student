class Gasto {
    constructor(id, grupoId, concepto, monto, pagadoPor, fecha = null, fotoTicket = null, liquidado = false) {
        this.id = id;
        this.grupoId = grupoId;
        this.concepto = concepto;
        this.monto = parseFloat(monto);
        this.pagadoPor = pagadoPor;
        this.fecha = fecha || new Date().toISOString().split('T')[0];
        this.fotoTicket = fotoTicket;
        this.liquidado = liquidado;
    }

    calcularParteIndividual(totalIntegrantes) {
        if (totalIntegrantes <= 0) return 0;
        return this.monto / totalIntegrantes;
    }
}