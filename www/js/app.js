// Estado de sesión del usuario activo
let usuarioSesion = JSON.parse(localStorage.getItem('splitstudent_sesion')) || null;
let fotoTicketActual = null;

// Estado global de la aplicación
let grupos = [];
let gastos = [];
let grupoSeleccionadoId = 'todos';
let modoPrivacidad = false;

// --- SENSORES NATIVOS CORDOVA ---
document.addEventListener('deviceready', () => {
    HardwareManager.inicializarSensores({
        // Sensor 1 (Acelerómetro): al agitar el teléfono, abre el modal de registro rápido
        onShake: () => {
            if (!usuarioSesion) return;
            const modalGasto = document.getElementById('modal-gasto');
            if (!modalGasto.isOpen) {
                abrirModalNuevoGasto();
                mostrarToast('¡Movimiento detectado! Registro rápido abierto.', 'secondary');
            }
        },
        // Sensor 2 (Proximidad): al acercar la mano, alterna el modo privacidad
        onProximidadCambio: () => {
            if (!usuarioSesion) return;
            alternarModoPrivacidad(!modoPrivacidad);
            mostrarToast(
                modoPrivacidad ? 'Modo privacidad activado' : 'Saldos visibles',
                'primary'
            );
        }
    });
}, false);

document.addEventListener('DOMContentLoaded', () => {
    configurarLogin();
    configurarEventosNavegacion();
    configurarModalesYFormularios();

    if (usuarioSesion) {
        mostrarAppPrincipal();
    }
});

// --- INICIO Y CIERRE DE SESIÓN ---
function autocompletarLogin(correo) {
    document.getElementById('login-correo').value = correo;
    document.getElementById('login-password').value = 'hash_prueba_123';
}

function configurarLogin() {
    const formLogin = document.getElementById('form-login');
    const formRegistro = document.getElementById('form-registro');

    // 1. Alternar entre Login y Registro rápido
    document.getElementById('btn-ir-registro').addEventListener('click', () => {
        formLogin.classList.add('oculto');
        formRegistro.classList.remove('oculto');
    });

    document.getElementById('btn-ir-login').addEventListener('click', () => {
        formRegistro.classList.add('oculto');
        formLogin.classList.remove('oculto');
    });

    // 2. Enviar Inicio de Sesión
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const correo = document.getElementById('login-correo').value.trim();
        const password = document.getElementById('login-password').value.trim();

        if (!correo || !password) {
            mostrarToast('Ingresa tu correo electrónico y contraseña.', 'warning');
            return;
        }

        try {
            const res = await ApiService.login(correo, password);
            usuarioSesion = res.usuario;
            localStorage.setItem('splitstudent_sesion', JSON.stringify(usuarioSesion));
            await mostrarAppPrincipal();
            mostrarToast(`Bienvenido, ${usuarioSesion.nombre}`, 'success');
        } catch (error) {
            mostrarToast(error.message, 'danger');
        }
    });

    // 3. Enviar Registro Rápido
    formRegistro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('reg-nombre').value.trim();
        const correo = document.getElementById('reg-correo').value.trim();
        const password = document.getElementById('reg-password').value.trim();

        if (!nombre || !correo || !password) {
            mostrarToast('Completa usuario, correo electrónico y contraseña.', 'warning');
            return;
        }

        try {
            const res = await ApiService.registrarUsuario(nombre, correo, password);
            usuarioSesion = res.usuario;
            localStorage.setItem('splitstudent_sesion', JSON.stringify(usuarioSesion));
            formRegistro.reset();
            await mostrarAppPrincipal();
            mostrarToast(`¡Cuenta creada! Bienvenido, ${usuarioSesion.nombre}`, 'success');
        } catch (error) {
            mostrarToast(error.message, 'danger');
        }
    });

    // 4. Cerrar Sesión (restaura siempre la vista de Login por defecto)
    document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
        localStorage.removeItem('splitstudent_sesion');
        usuarioSesion = null;
        grupos = [];
        gastos = [];
        grupoSeleccionadoId = 'todos';

        document.getElementById('contenedor-app').classList.add('oculto');
        document.getElementById('vista-login').classList.remove('oculto');

        formRegistro.classList.add('oculto');
        formLogin.classList.remove('oculto');
        formLogin.reset();
        formRegistro.reset();
    });
}

async function mostrarAppPrincipal() {
    document.getElementById('vista-login').classList.add('oculto');
    document.getElementById('contenedor-app').classList.remove('oculto');
    await sincronizarDatosConServidor();
    renderizarTodo();
}

function calcularLiquidacionesExactas(grupo) {
    const activos = gastos.filter(g => g.grupoId === grupo.id && !g.liquidado);
    const gastosComunes = activos.filter(g => g.tipo !== 'abono');
    const abonosDirectos = activos.filter(g => g.tipo === 'abono');

    const total = gastosComunes.reduce((acc, g) => acc + g.monto, 0);
    const cuotaPorPersona = grupo.miembros.length > 0 ? total / grupo.miembros.length : 0;

    const saldos = {};
    const deudores = [];
    const acreedores = [];

    grupo.miembros.forEach(miembro => {
        const mLower = miembro.toLowerCase();
        const pagoGastos = gastosComunes
            .filter(g => g.pagadoPor.toLowerCase() === mLower)
            .reduce((acc, g) => acc + g.monto, 0);
        const abonosEnviados = abonosDirectos
            .filter(a => a.pagadoPor.toLowerCase() === mLower)
            .reduce((acc, a) => acc + a.monto, 0);
        const abonosRecibidos = abonosDirectos
            .filter(a => a.receptor && a.receptor.toLowerCase() === mLower)
            .reduce((acc, a) => acc + a.monto, 0);

        // Positivo = le deben dinero; Negativo = debe dinero
        const neto = Number(((pagoGastos + abonosEnviados - abonosRecibidos) - cuotaPorPersona).toFixed(2));
        saldos[miembro] = neto;

        if (neto < -0.01) {
            deudores.push({ nombre: miembro, restante: Math.abs(neto) });
        } else if (neto > 0.01) {
            acreedores.push({ nombre: miembro, restante: neto });
        }
    });

    // Empareja exactamente cuánto le debe cada deudor a cada acreedor
    const transferencias = [];
    let i = 0, j = 0;
    while (i < deudores.length && j < acreedores.length) {
        const montoAPagar = Number(Math.min(deudores[i].restante, acreedores[j].restante).toFixed(2));
        if (montoAPagar > 0) {
            transferencias.push({
                de: deudores[i].nombre,
                para: acreedores[j].nombre,
                monto: montoAPagar
            });
        }
        deudores[i].restante = Number((deudores[i].restante - montoAPagar).toFixed(2));
        acreedores[j].restante = Number((acreedores[j].restante - montoAPagar).toFixed(2));

        if (deudores[i].restante <= 0.01) i++;
        if (acreedores[j].restante <= 0.01) j++;
    }

    return { total, cuotaPorPersona, saldos, transferencias };
}


async function sincronizarDatosConServidor(silencioso = false) {
    if (!usuarioSesion) return;
    try {
        const [resGrupos, resGastos] = await Promise.all([
            ApiService.obtenerGrupos(usuarioSesion.id_usuario),
            ApiService.obtenerGastos(usuarioSesion.id_usuario)
        ]);
        grupos = resGrupos.data;
        gastos = resGastos.data.map(g => {
            const instancia = new Gasto(
                g.id, g.grupoId, g.concepto, g.monto,
                g.pagadoPor, g.fecha, g.fotoTicket, g.liquidado
            );
            instancia.tipo = g.tipo || 'gasto';
            instancia.receptor = g.receptor || null;
            return instancia;
        });
        StorageService.guardarGrupos(grupos);
        StorageService.guardarGastos(gastos);
    } catch (error) {
        if (silencioso) return; // conserva lo que ya está en pantalla
        grupos = StorageService.obtenerGrupos();
        gastos = StorageService.obtenerGastos();
        mostrarToast('Modo sin conexión: mostrando respaldo local.', 'warning');
    }
}

// Sincroniza sin bloquear la pantalla; cuando termina, redibuja con los datos reales
function sincronizarEnSegundoPlano() {
    sincronizarDatosConServidor(true).then(renderizarTodo);
}

// --- NAVEGACIÓN ENTRE VISTAS ---
function configurarEventosNavegacion() {
    const itemsMenu = document.querySelectorAll('.nav-item[data-vista]');
    itemsMenu.forEach(item => {
        item.addEventListener('click', () => {
            const vistaDestino = item.getAttribute('data-vista');
            cambiarVista(vistaDestino);

            itemsMenu.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });

    document.getElementById('btn-privacidad').addEventListener('click', () => {
        alternarModoPrivacidad(!modoPrivacidad);
    });

    document.getElementById('filtro-grupo').addEventListener('ionChange', (e) => {
        grupoSeleccionadoId = e.detail.value;
        renderizarGastosYBalances();
    });
}

function cambiarVista(idVista) {
    document.querySelectorAll('.vista-seccion').forEach(sec => sec.classList.add('oculto'));

    const vistaActiva = document.getElementById(idVista);
    vistaActiva.classList.remove('oculto');

    vistaActiva.style.animation = 'none';
    vistaActiva.offsetHeight;
    vistaActiva.style.animation = null;

    const titulo = idVista === 'vista-grupos' ? 'Mis Grupos' : 'Gastos y Saldos';
    document.getElementById('titulo-vista').textContent = titulo;
}

function alternarModoPrivacidad(activar) {
    modoPrivacidad = activar;
    const icono = document.getElementById('icono-privacidad');
    const badge = document.getElementById('badge-modo-privacidad');

    if (modoPrivacidad) {
        document.body.classList.add('modo-privacidad-activo');
        icono.setAttribute('name', 'eye-off-outline');
        badge.textContent = 'Oculto';
        badge.setAttribute('color', 'warning');
    } else {
        document.body.classList.remove('modo-privacidad-activo');
        icono.setAttribute('name', 'eye-outline');
        badge.textContent = 'Visible';
        badge.setAttribute('color', 'light');
    }
}
let deudaMaximaActual = 0;

// --- MODALES, FORMULARIOS Y VALIDACIONES ---
function configurarModalesYFormularios() {
    const modalGasto = document.getElementById('modal-gasto');
    const modalGrupo = document.getElementById('modal-grupo');
    const modalAbono = document.getElementById('modal-abono');
    const modalUnirse = document.getElementById('modal-unirse');
    let deudaMaximaActual = 0;

    // 1. Captura de foto con cámara nativa
    document.getElementById('btn-tomar-foto').addEventListener('click', async () => {
        try {
            const fotoDataUrl = await HardwareManager.capturarComprobante();
            fotoTicketActual = fotoDataUrl;
            document.getElementById('img-preview-ticket').src = fotoDataUrl;
            document.getElementById('contenedor-preview-ticket').classList.remove('oculto');
            mostrarToast('Comprobante capturado correctamente.', 'success');
        } catch (error) {
            mostrarToast(error.message, 'warning');
        }
    });

    // 2. Apertura y cierre de modales de Gasto y Grupo
    document.getElementById('btn-abrir-modal-gasto').addEventListener('click', () => abrirModalNuevoGasto());
    document.getElementById('btn-cerrar-modal-gasto').addEventListener('click', () => modalGasto.dismiss());

    document.getElementById('btn-abrir-modal-grupo').addEventListener('click', () => {
        document.getElementById('form-grupo').reset();
        modalGrupo.present();
    });
    document.getElementById('btn-cerrar-modal-grupo').addEventListener('click', () => modalGrupo.dismiss());

    // 3. Lógica dinámica del Modal de Abonos (cálculo exacto y tope máximo)
    const actualizarOpcionesAbono = () => {
        const gId = parseInt(document.getElementById('abono-grupo').value);
        const selectReceptor = document.getElementById('abono-receptor');
        const infoDiv = document.getElementById('info-deuda-exacta');
        selectReceptor.innerHTML = '';
        deudaMaximaActual = 0;

        const grupo = grupos.find(g => g.id === gId);
        if (!grupo) return;

        const { transferencias } = calcularLiquidacionesExactas(grupo);
        const misDeudas = transferencias.filter(
            t => t.de.toLowerCase() === usuarioSesion.nombre.toLowerCase()
        );

        if (misDeudas.length === 0) {
            infoDiv.textContent = 'No tienes deudas pendientes en este grupo ($0.00).';
            document.getElementById('abono-monto').value = '';
            return;
        }

        misDeudas.forEach(d => {
            const opt = document.createElement('ion-select-option');
            opt.value = d.para;
            opt.textContent = `${d.para} (Le debes $${d.monto.toFixed(2)})`;
            selectReceptor.appendChild(opt);
        });

        selectReceptor.value = misDeudas[0].para;
        deudaMaximaActual = misDeudas[0].monto;
        document.getElementById('abono-monto').value = deudaMaximaActual.toFixed(2);
        infoDiv.textContent = `Deuda exacta con ${misDeudas[0].para}: $${deudaMaximaActual.toFixed(2)} MXN`;
    };

    document.getElementById('btn-abrir-modal-abono').addEventListener('click', () => {
        document.getElementById('form-abono').reset();
        llenarSelectGrupos('abono-grupo');
        if (grupoSeleccionadoId !== 'todos') {
            document.getElementById('abono-grupo').value = parseInt(grupoSeleccionadoId);
        } else if (grupos.length > 0) {
            document.getElementById('abono-grupo').value = grupos[0].id;
        }
        document.getElementById('abono-pagador').value = usuarioSesion.nombre;
        actualizarOpcionesAbono();
        modalAbono.present();
    });

    document.getElementById('abono-grupo').addEventListener('ionChange', actualizarOpcionesAbono);

    document.getElementById('abono-receptor').addEventListener('ionChange', (e) => {
        const gId = parseInt(document.getElementById('abono-grupo').value);
        const receptorSel = e.detail.value;
        const grupo = grupos.find(g => g.id === gId);
        if (!grupo || !receptorSel) return;

        const { transferencias } = calcularLiquidacionesExactas(grupo);
        const deuda = transferencias.find(
            t => t.de.toLowerCase() === usuarioSesion.nombre.toLowerCase() &&
                 t.para.toLowerCase() === receptorSel.toLowerCase()
        );
        deudaMaximaActual = deuda ? deuda.monto : 0;
        document.getElementById('abono-monto').value = deudaMaximaActual > 0 ? deudaMaximaActual.toFixed(2) : '';
        document.getElementById('info-deuda-exacta').textContent = deudaMaximaActual > 0
            ? `Deuda exacta con ${receptorSel}: $${deudaMaximaActual.toFixed(2)} MXN`
            : `No le debes dinero a ${receptorSel}.`;
    });

    document.getElementById('btn-cerrar-modal-abono').addEventListener('click', () => modalAbono.dismiss());

    // 4. Submit Crear Grupo (conectado a API SQL)
    document.getElementById('form-grupo').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombre = document.getElementById('grupo-nombre').value.trim();
        const descripcion = document.getElementById('grupo-descripcion').value.trim();
        const miembrosTexto = document.getElementById('grupo-miembros').value.trim();

        if (!nombre) {
            mostrarToast('Escribe un nombre para el grupo.', 'warning');
            return;
        }

        const miembros = miembrosTexto
            ? miembrosTexto.split(',').map(m => m.trim()).filter(m => m !== '')
            : [];

        if (!miembros.some(m => m.toLowerCase() === usuarioSesion.nombre.toLowerCase())) {
            miembros.unshift(usuarioSesion.nombre);
        }

                try {
            const res = await ApiService.crearGrupo({
                nombre,
                descripcion: descripcion || 'Grupo de gastos compartidos',
                id_creador: usuarioSesion.id_usuario,
                miembros_nombres: miembros
            });
            grupos.unshift({
                id: res.id_grupo,
                nombre,
                descripcion: descripcion || 'Grupo de gastos compartidos',
                codigo: res.codigo_invitacion,
                creador: usuarioSesion.nombre,
                rol: 'admin',
                miembros
            });
            modalGrupo.dismiss();
            renderizarTodo();
            sincronizarEnSegundoPlano();
            mostrarToast('Grupo creado. ¡Comparte el código para invitar!', 'success');
        } catch (error) {
            mostrarToast(error.message, 'danger');
        }
    });

    // 5. Submit Registrar / Editar Gasto (conectado a API SQL)
    document.getElementById('form-gasto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const idExistente = document.getElementById('gasto-id').value;
        const grupoId = parseInt(document.getElementById('gasto-grupo').value);
        const concepto = document.getElementById('gasto-concepto').value.trim();
        const monto = parseFloat(document.getElementById('gasto-monto').value);
        const pagadoPor = document.getElementById('gasto-pagador').value.trim();

        if (!grupoId || !concepto || isNaN(monto) || monto <= 0 || !pagadoPor) {
            mostrarToast('Verifica que todos los campos sean válidos y el monto sea mayor a 0.', 'danger');
            return;
        }

                try {
            if (idExistente) {
                await ApiService.editarGasto(idExistente, { grupoId, concepto, monto, pagadoPor });
                const g = gastos.find(x => x.id === parseInt(idExistente));
                if (g) { g.grupoId = grupoId; g.concepto = concepto; g.monto = monto; g.pagadoPor = pagadoPor; }
                mostrarToast('Gasto actualizado correctamente.', 'success');
            } else {
                const res = await ApiService.crearGasto({
                    grupoId,
                    tipo: 'gasto',
                    concepto,
                    monto,
                    pagadoPor,
                    fotoTicket: fotoTicketActual
                });
                const nuevo = new Gasto(res.id_gasto, grupoId, concepto, monto, pagadoPor, null, fotoTicketActual, false);
                nuevo.tipo = 'gasto';
                nuevo.receptor = null;
                gastos.unshift(nuevo);
                mostrarToast('Gasto registrado en el grupo.', 'success');
            }

            fotoTicketActual = null;
            document.getElementById('contenedor-preview-ticket').classList.add('oculto');
            modalGasto.dismiss();
            renderizarTodo();
            sincronizarEnSegundoPlano();
        } catch (error) {
            mostrarToast(error.message, 'danger');
        }
    });

    // 6. Submit Registrar Abono / Liquidar Deuda (con candado de deuda exacta)
    document.getElementById('form-abono').addEventListener('submit', async (e) => {
        e.preventDefault();
        const grupoId = parseInt(document.getElementById('abono-grupo').value);
        const pagadoPor = document.getElementById('abono-pagador').value.trim();
        const receptor = document.getElementById('abono-receptor').value;
        const monto = parseFloat(document.getElementById('abono-monto').value);

        if (!grupoId || !receptor || isNaN(monto) || monto <= 0) {
            mostrarToast('Selecciona a quién le debes e ingresa un monto válido.', 'warning');
            return;
        }

        if (monto > deudaMaximaActual + 0.01) {
            mostrarToast(`Solo le debes $${deudaMaximaActual.toFixed(2)} MXN a ${receptor}. No puedes abonar de más.`, 'danger');
            return;
        }

                try {
            const res = await ApiService.crearGasto({
                grupoId,
                tipo: 'abono',
                concepto: `Abono de ${pagadoPor} a ${receptor}`,
                monto,
                pagadoPor,
                receptor
            });
            const nuevo = new Gasto(res.id_gasto, grupoId, `Abono de ${pagadoPor} a ${receptor}`, monto, pagadoPor, null, null, false);
            nuevo.tipo = 'abono';
            nuevo.receptor = receptor;
            gastos.unshift(nuevo);

            modalAbono.dismiss();
            renderizarTodo();
            sincronizarEnSegundoPlano();
            mostrarToast('Abono registrado y saldo actualizado.', 'success');
        } catch (error) {
            mostrarToast(error.message, 'danger');
        }
    });
    // 7. Apertura, cierre y envío de Unirse a Grupo por Código
    document.getElementById('btn-abrir-modal-unirse').addEventListener('click', () => {
        document.getElementById('form-unirse').reset();
        modalUnirse.present();
    });

    document.getElementById('btn-cerrar-modal-unirse').addEventListener('click', () => modalUnirse.dismiss());

    document.getElementById('form-unirse').addEventListener('submit', async (e) => {
        e.preventDefault();
        const codigo = document.getElementById('unirse-codigo').value.trim().toUpperCase();
        if (!codigo) {
            mostrarToast('Ingresa un código de invitación válido.', 'warning');
            return;
        }

        try {
            const res = await ApiService.unirseAGrupo(codigo, usuarioSesion.id_usuario);
            modalUnirse.dismiss();
            await sincronizarDatosConServidor();
            renderizarTodo();
            mostrarToast(res.mensaje, 'success');
        } catch (error) {
            mostrarToast(error.message, 'danger');
        }
    });
}

function abrirModalNuevoGasto() {
    document.getElementById('form-gasto').reset();
    document.getElementById('gasto-id').value = '';
    fotoTicketActual = null;
    document.getElementById('contenedor-preview-ticket').classList.add('oculto');
    document.getElementById('titulo-modal-gasto').textContent = 'Registrar Gasto';
    llenarSelectGrupos('gasto-grupo');
    if (grupoSeleccionadoId !== 'todos') {
        document.getElementById('gasto-grupo').value = parseInt(grupoSeleccionadoId);
    }
    if (usuarioSesion) {
        document.getElementById('gasto-pagador').value = usuarioSesion.nombre;
    }
    document.getElementById('modal-gasto').present();
}

function editarGasto(id) {
    const gasto = gastos.find(g => g.id === id);
    if (!gasto) return;

    llenarSelectGrupos('gasto-grupo');
    document.getElementById('gasto-id').value = gasto.id;
    document.getElementById('gasto-grupo').value = gasto.grupoId;
    document.getElementById('gasto-concepto').value = gasto.concepto;
    document.getElementById('gasto-monto').value = gasto.monto;
    document.getElementById('gasto-pagador').value = gasto.pagadoPor;
    document.getElementById('titulo-modal-gasto').textContent = 'Editar Gasto';
    document.getElementById('modal-gasto').present();
}

async function eliminarGasto(id) {
    const alert = document.createElement('ion-alert');
    alert.header = 'Confirmar eliminación';
    alert.message = '¿Deseas eliminar este registro?';
    alert.buttons = [
        { text: 'Cancelar', role: 'cancel' },
        {
            text: 'Eliminar',
            role: 'destructive',
                        handler: async () => {
                try {
                    await ApiService.eliminarGasto(id, usuarioSesion.id_usuario);
                    gastos = gastos.filter(g => g.id !== id);
                    renderizarTodo();
                    sincronizarEnSegundoPlano();
                    mostrarToast('Registro eliminado.', 'medium');
                } catch (error) {
                    mostrarToast(error.message, 'danger');
                }
            }
        }
    ];
    document.body.appendChild(alert);
    await alert.present();
}

async function alternarLiquidado(id) {
    try {
        await ApiService.alternarLiquidado(id);
        const g = gastos.find(x => x.id === id);
        if (g) g.liquidado = !g.liquidado;
        renderizarTodo();
        sincronizarEnSegundoPlano();
        mostrarToast('Estado de liquidación actualizado.', 'success');
    } catch (error) {
        mostrarToast(error.message, 'danger');
    }
}

// --- RENDERIZADO DE INTERFAZ Y CÁLCULO DE SALDOS ---
function renderizarTodo() {
    const totalActivo = gastos
        .filter(g => !g.liquidado && g.tipo !== 'abono')
        .reduce((acc, g) => acc + g.monto, 0);
    document.getElementById('total-general').textContent = `$${totalActivo.toFixed(2)} MXN`;

    renderizarGrupos();
    llenarSelectGrupos('filtro-grupo', true);
    renderizarGastosYBalances();
}

function renderizarGrupos() {
    const contAdmin = document.getElementById('contenedor-mis-grupos');
    const contInvitado = document.getElementById('contenedor-grupos-invitado');
    contAdmin.innerHTML = '';
    contInvitado.innerHTML = '';

    const misGrupos = grupos.filter(g => g.creador.toLowerCase() === usuarioSesion.nombre.toLowerCase());
    const gruposInvitado = grupos.filter(g => g.creador.toLowerCase() !== usuarioSesion.nombre.toLowerCase());

    if (misGrupos.length === 0) {
        contAdmin.innerHTML = '<ion-col size="12"><p class="ion-padding-start">Aún no has creado ningún grupo.</p></ion-col>';
    } else {
        misGrupos.forEach(grupo => contAdmin.appendChild(crearTarjetaGrupo(grupo, true)));
    }

    if (gruposInvitado.length === 0) {
        contInvitado.innerHTML = '<ion-col size="12"><p class="ion-padding-start">No participas como invitado en otros grupos.</p></ion-col>';
    } else {
        gruposInvitado.forEach(grupo => contInvitado.appendChild(crearTarjetaGrupo(grupo, false)));
    }
}

function crearTarjetaGrupo(grupo, esAdmin) {
    const gastosPendientes = gastos.filter(g => g.grupoId === grupo.id && !g.liquidado && g.tipo !== 'abono');
    const sumaPendiente = gastosPendientes.reduce((acc, g) => acc + g.monto, 0);

    const col = document.createElement('ion-col');
    col.setAttribute('size', '12');
    col.setAttribute('size-md', '6');
    col.setAttribute('size-lg', '4');

    const bloqueCodigoHTML = grupo.codigo
        ? `<div style="display:flex; justify-content:space-between; align-items:center; background:#f1f5f9; padding:6px 12px; border-radius:12px; margin-top:10px;">
               <span style="font-size:0.82rem; color:#475569;">Código: <strong style="color:#0f172a; letter-spacing:1px;">${grupo.codigo}</strong></span>
               <ion-button size="small" fill="clear" color="secondary" class="btn-compartir-codigo" style="margin:0; height:28px;">
                   <ion-icon slot="start" name="share-social-outline"></ion-icon>
                   Invitar
               </ion-button>
           </div>`
        : '';

    const botonEliminarHTML = esAdmin
        ? `<ion-button fill="clear" color="danger" size="small" class="btn-eliminar-grupo" title="Eliminar grupo">
               <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
           </ion-button>`
        : `<ion-badge color="medium">Invitado</ion-badge>`;

    col.innerHTML = `
        <ion-card button class="card-grupo" data-id="${grupo.id}">
            <ion-card-header>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <ion-card-subtitle>${grupo.miembros.length} integrantes • Admin: ${grupo.creador}</ion-card-subtitle>
                    ${botonEliminarHTML}
                </div>
                <ion-card-title>${grupo.nombre}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
                <p>${grupo.descripcion}</p>
                <p class="ion-margin-top"><strong>Integrantes:</strong> ${grupo.miembros.join(', ')}</p>
                <h3 class="monto-sensible" style="color:${sumaPendiente > 0 ? '#d90429' : '#0f172a'}; margin-top:10px;">
                    Gasto acumulado: $${sumaPendiente.toFixed(2)}
                </h3>
                ${bloqueCodigoHTML}
            </ion-card-content>
        </ion-card>
    `;

    col.querySelector('.card-grupo').addEventListener('click', () => {
        grupoSeleccionadoId = grupo.id;
        cambiarVista('vista-gastos');
        renderizarGastosYBalances();
    });

    if (esAdmin) {
        col.querySelector('.btn-eliminar-grupo').addEventListener('click', (e) => {
            e.stopPropagation();
            eliminarGrupo(grupo.id);
        });
    }

    const btnCompartir = col.querySelector('.btn-compartir-codigo');
    if (btnCompartir) {
        btnCompartir.addEventListener('click', async (e) => {
            e.stopPropagation(); // Evita que se abra la vista de gastos al tocar Invitar
            const textoInvitacion = `¡Únete a mi grupo "${grupo.nombre}" en SplitStudent para dividir gastos! Usa el código: ${grupo.codigo}`;
            
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Invitación SplitStudent',
                        text: textoInvitacion
                    });
                } catch (err) {
                    // El usuario canceló el menú de compartir
                }
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(textoInvitacion);
                mostrarToast(`Código ${grupo.codigo} copiado al portapapeles.`, 'secondary');
            }
        });
    }
    return col;
    
}

async function eliminarGrupo(id) {
    const grupo = grupos.find(g => g.id === id);
    if (!grupo) return;

    const alert = document.createElement('ion-alert');
    alert.header = 'Eliminar grupo';
    alert.message = `¿Deseas eliminar "${grupo.nombre}"? (El servidor bloqueará la acción si existen gastos sin saldar).`;
    alert.buttons = [
        { text: 'Cancelar', role: 'cancel' },
        {
            text: 'Eliminar',
            role: 'destructive',
            handler: async () => {
                try {
                    await ApiService.eliminarGrupo(id, usuarioSesion.id_usuario);
                    if (grupoSeleccionadoId === id) {
                        grupoSeleccionadoId = 'todos';
                    }
                    await sincronizarDatosConServidor();
                    renderizarTodo();
                    mostrarToast('Grupo eliminado correctamente.', 'success');
                } catch (error) {
                    mostrarToast(error.message, 'danger');
                }
            }
        }
    ];
    document.body.appendChild(alert);
    await alert.present();
}

function renderizarGastosYBalances() {
    const contenedorGastos = document.getElementById('contenedor-gastos');
    const contenedorBalances = document.getElementById('contenedor-balances');
    contenedorGastos.innerHTML = '';

    const gastosFiltrados = grupoSeleccionadoId === 'todos'
        ? gastos
        : gastos.filter(g => g.grupoId === parseInt(grupoSeleccionadoId));

    // Cálculo de saldos por integrante (sin mostrar cuota c/u)
    if (grupoSeleccionadoId !== 'todos') {
        const grupo = grupos.find(g => g.id === parseInt(grupoSeleccionadoId));
        if (grupo) {
            document.getElementById('subtitulo-grupo-actual').textContent = `Gastos: ${grupo.nombre}`;
            const { total, saldos, transferencias } = calcularLiquidacionesExactas(grupo);

            let htmlBalances = `<p><strong>Gasto del grupo:</strong> <span class="monto-sensible">$${total.toFixed(2)}</span></p>`;

            grupo.miembros.forEach(miembro => {
                const diferencia = saldos[miembro] || 0;
                const color = Math.abs(diferencia) <= 0.01 ? 'medium' : (diferencia > 0 ? 'success' : 'danger');
                const textoEstado = Math.abs(diferencia) <= 0.01
                    ? 'Al corriente ($0.00)'
                    : (diferencia > 0 ? `Le deben $${diferencia.toFixed(2)}` : `Debe $${Math.abs(diferencia).toFixed(2)}`);

                htmlBalances += `
                    <ion-chip color="${color}">
                        <ion-label>${miembro}: <span class="monto-sensible">${textoEstado}</span></ion-label>
                    </ion-chip>
                `;
            });

            htmlBalances += `<div class="ion-margin-top" style="border-top: 1px solid #e2e8f0; padding-top: 10px;">
                <p style="margin:0 0 6px 0; font-weight:700; color:#0f172a;">Pagos exactos para liquidar:</p>`;

            if (transferencias.length === 0) {
                htmlBalances += `<p style="margin:0; color:#15803d; font-weight:600;">Todas las cuentas están saldadas ($0.00).</p>`;
            } else {
                transferencias.forEach(t => {
                    htmlBalances += `<p style="margin:4px 0; font-size:0.92rem;">• <strong>${t.de}</strong> debe pagar <span class="monto-sensible" style="color:#0369a1; font-weight:700;">$${t.monto.toFixed(2)}</span> a <strong>${t.para}</strong></p>`;
                });
            }
            htmlBalances += `</div>`;
            contenedorBalances.innerHTML = htmlBalances;
        }
    } else {
        document.getElementById('subtitulo-grupo-actual').textContent = 'Todos los Gastos';
        contenedorBalances.innerHTML = '<p>Selecciona un grupo específico para ver el desglose individual.</p>';
    }

    // Renderizar tarjetas de gastos y abonos con control de permisos para eliminar
    const usuarioActualLower = usuarioSesion.nombre.toLowerCase();

    gastosFiltrados.forEach(gasto => {
        const grupo = grupos.find(gr => gr.id === gasto.grupoId);
        const esAbono = gasto.tipo === 'abono';

        // Permiso: solo el creador del gasto/abono o el admin del grupo puede eliminarlo
        const esAdminGrupo = grupo && grupo.creador.toLowerCase() === usuarioActualLower;
        const esAutorRegistro = gasto.pagadoPor.toLowerCase() === usuarioActualLower;
        const puedeEliminar = esAdminGrupo || esAutorRegistro;

        const col = document.createElement('ion-col');
        col.setAttribute('size', '12');
        col.setAttribute('size-md', '6');

        const imagenTicketHTML = gasto.fotoTicket
            ? `<div class="ion-margin-top"><img src="${gasto.fotoTicket}" alt="Ticket" style="max-height: 120px; border-radius: 12px; border: 1px solid #e2e8f0;"></div>`
            : '';

        const botonEliminarHTML = puedeEliminar
            ? `<ion-button size="small" fill="outline" color="danger" onclick="eliminarGasto(${gasto.id})">
                   Eliminar
               </ion-button>`
            : '';

        col.innerHTML = `
            <ion-card class="card-gasto ${gasto.liquidado ? 'badge-liquidado' : ''}">
                <ion-card-header>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <ion-card-subtitle>${grupo ? grupo.nombre : 'Grupo'} • ${gasto.fecha}</ion-card-subtitle>
                        <ion-badge color="${esAbono ? 'secondary' : 'light'}">${esAbono ? 'Abono' : 'Gasto'}</ion-badge>
                    </div>
                    <ion-card-title>${gasto.concepto}</ion-card-title>
                </ion-card-header>
                <ion-card-content>
                    <p><strong>${esAbono ? 'Abonó:' : 'Pagó:'}</strong> ${gasto.pagadoPor} ${esAbono && gasto.receptor ? `→ <strong>Recibió:</strong> ${gasto.receptor}` : ''}</p>
                    <h2 class="monto-sensible" style="color:${esAbono ? '#0ea5e9' : '#0f172a'};">$${gasto.monto.toFixed(2)} MXN</h2>
                    ${imagenTicketHTML}
                    <div class="ion-margin-top">
                        ${!esAbono ? `
                            <ion-button size="small" fill="outline" color="success" onclick="alternarLiquidado(${gasto.id})">
                                ${gasto.liquidado ? 'Reabrir' : 'Saldar'}
                            </ion-button>
                            <ion-button size="small" fill="outline" color="primary" onclick="editarGasto(${gasto.id})">
                                Editar
                            </ion-button>
                        ` : ''}
                        ${botonEliminarHTML}
                    </div>
                </ion-card-content>
            </ion-card>
        `;
        contenedorGastos.appendChild(col);
    });
}

function llenarSelectGrupos(idSelect, incluirTodos = false) {
    const select = document.getElementById(idSelect);
    select.innerHTML = '';
    if (incluirTodos) {
        const optTodos = document.createElement('ion-select-option');
        optTodos.value = 'todos';
        optTodos.textContent = 'Todos los grupos';
        select.appendChild(optTodos);
    }
    grupos.forEach(g => {
        const opt = document.createElement('ion-select-option');
        opt.value = g.id;
        opt.textContent = g.nombre;
        select.appendChild(opt);
    });
    if (incluirTodos) select.value = grupoSeleccionadoId;
}

async function mostrarToast(mensaje, color = 'dark') {
    const toast = document.createElement('ion-toast');
    toast.message = mensaje;
    toast.duration = 2200;
    toast.color = color;
    toast.position = 'bottom';
    document.body.appendChild(toast);
    await toast.present();
}