class HardwareManager {
    static watchIdAcelerometro = null;
    static intervaloProximidad = null;
    static ultimaAgitacion = 0;
    static estadoPrevioProximidad = false;
    static ultimoCambioProximidad = 0;

    // Inicializa ambos sensores cuando Cordova dispara 'deviceready'
    static inicializarSensores(callbacks) {
        if (!window.cordova) {
            console.warn('Entorno navegador detectado: los sensores nativos se probarán en dispositivo físico.');
            return;
        }

        this.iniciarAcelerometro(callbacks.onShake);
        this.iniciarSensorProximidad(callbacks.onProximidadCambio);
    }

    // =========================================================
    // SENSOR 1: ACELERÓMETRO (Gesto de agitación / Shake)
    // =========================================================
    static iniciarAcelerometro(onShakeCallback) {
        if (!navigator.accelerometer) {
            console.warn('Plugin de acelerómetro no disponible en este dispositivo.');
            return;
        }

        let ultimoX = null, ultimoY = null, ultimoZ = null;
        const UMBRAL_AGITACION = 18; // Sensibilidad del movimiento (m/s²)

        this.watchIdAcelerometro = navigator.accelerometer.watchAcceleration(
            (aceleracion) => {
                if (ultimoX !== null) {
                    const deltaX = Math.abs(ultimoX - aceleracion.x);
                    const deltaY = Math.abs(ultimoY - aceleracion.y);
                    const deltaZ = Math.abs(ultimoZ - aceleracion.z);

                    if ((deltaX + deltaY + deltaZ) > UMBRAL_AGITACION) {
                        const ahora = Date.now();
                        // Evita disparos múltiples en menos de 2 segundos
                        if (ahora - this.ultimaAgitacion > 2000) {
                            this.ultimaAgitacion = ahora;
                            if (typeof onShakeCallback === 'function') {
                                onShakeCallback(aceleracion);
                            }
                        }
                    }
                }
                ultimoX = aceleracion.x;
                ultimoY = aceleracion.y;
                ultimoZ = aceleracion.z;
            },
            (error) => console.error('Error leyendo acelerómetro:', error),
            { frequency: 250 } // Lectura cada 250 ms
        );
    }

    // =========================================================
    // SENSOR 2: SENSOR DE PROXIMIDAD (Modo Privacidad Rápida)
    // =========================================================
    static iniciarSensorProximidad(onProximidadCallback) {
        if (navigator.proximity) {
            navigator.proximity.enableSensor();
            this.intervaloProximidad = setInterval(() => {
                navigator.proximity.getProximityState((estadoCercano) => {
                    const cercaAhora = Boolean(estadoCercano);
                    const ahora = Date.now();

                    // Detecta el momento exacto en que acercas la mano (transición false -> true)
                    if (cercaAhora && !this.estadoPrevioProximidad && (ahora - this.ultimoCambioProximidad > 1500)) {
                        this.ultimoCambioProximidad = ahora;
                        if (typeof onProximidadCallback === 'function') {
                            onProximidadCallback();
                        }
                    }
                    this.estadoPrevioProximidad = cercaAhora;
                });
            }, 300);
        }

        // 2. Respaldo mediante evento estándar Web/Android deviceproximity
        window.addEventListener('deviceproximity', (evento) => {
            const estaCerca = evento.value <= 5; // Menos de 5 cm de distancia
            if (typeof onProximidadCallback === 'function') {
                onProximidadCallback(estaCerca);
            }
        });
    }

    // =========================================================
    // COMPONENTE ADICIONAL: CÁMARA NATIVA (Captura de Ticket)
    // =========================================================
    static capturarComprobante() {
        return new Promise((resolve, reject) => {
            if (!navigator.camera) {
                reject(new Error('La cámara nativa solo está disponible en el dispositivo móvil.'));
                return;
            }

            navigator.camera.getPicture(
                (imagenBase64) => {
                    const dataUrl = `data:image/jpeg;base64,${imagenBase64}`;
                    resolve(dataUrl);
                },
                (mensajeError) => {
                    reject(new Error(`Captura cancelada o fallida: ${mensajeError}`));
                },
                {
                    quality: 50, // Comprime calidad para envío rápido JSON a MySQL
                    destinationType: Camera.DestinationType.DATA_URL,
                    sourceType: Camera.PictureSourceType.CAMERA,
                    encodingType: Camera.EncodingType.JPEG,
                    targetWidth: 800,
                    targetHeight: 800,
                    correctOrientation: true
                }
            );
        });
    }
}