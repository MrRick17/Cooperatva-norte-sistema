document.addEventListener('DOMContentLoaded', () => {
    
    const firebaseConfig = {
        apiKey: "AIzaSyDLYshRQQn3S9Rg8Vq5BB5mEIa0PiPNuqo",
        authDomain: "cooperativa-norte.firebaseapp.com",
        projectId: "cooperativa-norte",
        storageBucket: "cooperativa-norte.firebasestorage.app",
        messagingSenderId: "325556620984",
        appId: "1:325556620984:web:25944b557a571156a82e4d"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();

    db.enablePersistence().catch((err) => {
        console.warn("Persistencia offline inactiva o con errores:", err);
    });

    let clientes = [];
    let ingresosTotalesUSD = 0;
    let historialPagos = [];

    window.mostrarToast = (titulo, mensaje) => {
        const toast = document.getElementById('toast-notificacion');
        if(!toast) return;
        document.getElementById('toast-titulo').textContent = titulo;
        document.getElementById('toast-mensaje').textContent = mensaje;
        toast.classList.add('mostrar');
        setTimeout(() => toast.classList.remove('mostrar'), 4000);
    };

    function escucharNubeEnTiempoReal() {
        db.collection("cooperativa").doc("directorio").onSnapshot((docSnap) => {
            if (docSnap.exists) {
                const data = docSnap.data();
                clientes = data.listaAfiliados || [];
                ingresosTotalesUSD = data.ingresosUSD || 0;
                historialPagos = data.historialPagos || [];
                
                const buscador = document.getElementById('buscador-clientes');
                renderizarClientes(buscador ? buscador.value : '');

                // Ocultar la pantalla de carga cuando los datos ya estén listos
                const loader = document.getElementById('global-loader');
                if (loader) loader.classList.add('oculto');
            }
        }, (error) => {
            console.error("Error Firebase:", error);
            mostrarToast("Error", "Problemas de conexión con la base de datos.");
        });
    }

    async function guardarNube() {
        if (!navigator.onLine) {
            throw new Error("No hay conexión a internet.");
        }
        await db.collection("cooperativa").doc("directorio").set({
            listaAfiliados: clientes,
            ingresosUSD: ingresosTotalesUSD,
            historialPagos: historialPagos
        });
    }

    const renderizarClientes = (filtro = '') => {
        const grid = document.getElementById('clientes-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const filtrados = clientes.filter(c => 
            (c.nombre && c.nombre.toLowerCase().includes(filtro.toLowerCase())) || 
            (c.cedula && c.cedula.toLowerCase().includes(filtro.toLowerCase()))
        );

        if (filtrados.length === 0) {
            grid.innerHTML = `<p style="text-align:center; grid-column:1/-1; padding:20px; color:#6B7280;">No hay afiliados que coincidan.</p>`;
            return;
        }

        filtrados.forEach(c => {
            let badgeClass = c.estado === 'aldia' ? 'badge-aldia' : (c.estado === 'revision' ? 'badge-revision' : 'badge-vencida');
            let estadoTexto = c.estado === 'aldia' ? 'Al Día' : (c.estado === 'revision' ? 'En Revisión' : 'Atrasado');
            let fechaF = c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString('es-ES') : 'N/A';

            grid.innerHTML += `
                <div class="cliente-card ${c.estado === 'atrasado' ? 'card-alerta' : (c.estado === 'revision' ? 'card-revision' : 'card-ok')}">
                    <div class="cliente-card__header">
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:#1F2937;">${c.nombre}</h3>
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">N° Asociado: <strong>${c.numeroAsociado || 'N/A'}</strong> | C.I: ${c.cedula}</p>
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">Registro Funerario: <strong>${c.contrato || 'N/A'}</strong></p>
                        </div>
                        <span class="badge ${badgeClass}">${estadoTexto}</span>
                    </div>
                    <div class="cliente-servicios" style="background:#F9FAFB; padding:12px; border-radius:8px; margin:15px 0;">
                        <p style="margin:0; font-size:0.85rem;"><i class="fa-solid fa-calendar" style="color:#006412;"></i> Vence: <strong>${fechaF}</strong></p>
                    </div>
                    <div class="cliente-card__actions">
                        ${c.estado !== 'revision' 
                            ? `<button class="btn-accion-cliente" onclick="abrirModalPago(${c.id}, '${(c.nombre || '').replace(/'/g, "\\'")}')" style="background:#006412; color:white; border:none; border-radius: 6px; padding: 10px 0; cursor: pointer; font-weight:600;"><i class="fa-solid fa-file-invoice-dollar"></i> Reportar Pago</button>` 
                            : `<button class="btn-accion-cliente" disabled style="background:#E5E7EB; color:#9CA3AF; border-radius: 6px; padding: 10px 0; font-weight:600;"><i class="fa-solid fa-clock"></i> Esperando Aprobación</button>`
                        }
                    </div>
                </div>
            `;
        });
    };

    const modalPago = document.getElementById('modal-pago');
    const inputUsd = document.getElementById('pago-monto-usd');
    const inputBs = document.getElementById('pago-monto-bs');
    const inputTasaManual = document.getElementById('pago-tasa-manual');
    const selectMetodo = document.getElementById('pago-metodo');
    const contenedorRef = document.getElementById('contenedor-referencia');
    const inputRef = document.getElementById('pago-referencia');
    const labelRef = document.getElementById('label-referencia');

    window.abrirModalPago = (id, nombre) => {
        const cliente = clientes.find(c => c.id === id);
        document.getElementById('pago-cliente-id').value = id;
        document.getElementById('pago-cliente-nombre').textContent = nombre;
        
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('pago-fecha-reporte').value = hoy;
        document.getElementById('pago-fecha-real').value = hoy;
        
        let cuotaMensual = 10;
        if (cliente) {
            const montoFunerario = (cliente.numeroAsociado == '1974') ? 10 : 5;
            const baseFunerario = (cliente.tieneFunerario !== false) ? montoFunerario : 0;
            cuotaMensual = baseFunerario + 2 + (cliente.tieneCremacion ? 7 : 2) + 1;
        }

        const inputMeses = document.getElementById('pago-meses');
        if(inputMeses) {
            inputMeses.value = 1;
            inputMeses.setAttribute('data-cuota', cuotaMensual);
        }
        
        if(inputUsd) inputUsd.value = cuotaMensual;
        if(inputBs) inputBs.value = '';
        if(inputTasaManual) inputTasaManual.value = '';
        if(inputRef) inputRef.value = '';
        if(document.getElementById('pago-factura')) document.getElementById('pago-factura').value = '';
        
        actualizarCamposMetodo('pago_movil');
        if(modalPago) modalPago.style.display = 'flex';
    };

    document.getElementById('pago-meses')?.addEventListener('input', (e) => {
        const meses = parseInt(e.target.value) || 1;
        const cuota = parseFloat(e.target.getAttribute('data-cuota')) || 10;
        if (inputUsd) {
            inputUsd.value = (cuota * meses).toFixed(2);
            const tasa = parseFloat(inputTasaManual.value) || 0;
            if (tasa > 0 && inputBs) inputBs.value = (parseFloat(inputUsd.value) * tasa).toFixed(2);
        }
    });

    function actualizarCamposMetodo(metodo) {
        if (metodo === 'efectivo') {
            contenedorRef.style.display = 'none';
            inputRef.removeAttribute('required');
        } else {
            contenedorRef.style.display = 'block';
            inputRef.setAttribute('required', 'true');
            if (metodo === 'pago_movil') {
                labelRef.textContent = 'Últimos 4 dígitos de Referencia';
                inputRef.placeholder = 'Ej: 4582';
                inputRef.setAttribute('maxlength', '4');
            } else {
                labelRef.textContent = 'Número Completo de Referencia';
                inputRef.placeholder = 'Ej: 000123456789';
                inputRef.removeAttribute('maxlength');
            }
        }
    }

    if(selectMetodo) selectMetodo.addEventListener('change', (e) => actualizarCamposMetodo(e.target.value));

    if(inputTasaManual) {
        inputTasaManual.addEventListener('input', () => {
            if (inputUsd.value) inputBs.value = parseFloat((parseFloat(inputUsd.value) * parseFloat(inputTasaManual.value)).toFixed(6));
        });
    }

    if(inputUsd) {
        inputUsd.addEventListener('input', () => {
            const tasa = parseFloat(inputTasaManual.value) || 0;
            if (tasa > 0) inputBs.value = parseFloat((parseFloat(inputUsd.value) * tasa).toFixed(6));
        });
    }

    if(inputBs) {
        inputBs.addEventListener('input', () => {
            const tasa = parseFloat(inputTasaManual.value) || 0;
            if (tasa > 0) inputUsd.value = parseFloat((parseFloat(inputBs.value) / tasa).toFixed(6));
        });
    }

    document.getElementById('cerrar-modal-pago')?.addEventListener('click', () => { 
        if(modalPago) modalPago.style.display = 'none'; 
    });

    // === GUARDADO PROTEGIDO PARA REPORTAR PAGO ===
    document.getElementById('form-pago')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!navigator.onLine) {
            mostrarToast("⚠️ Sin Conexión", "Conéctate a internet para enviar el pago y evitar pérdidas.");
            return;
        }

        const btnSubmit = e.target.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerHTML;

        const id = parseInt(document.getElementById('pago-cliente-id').value);
        const montoFinalUSD = parseFloat(inputUsd.value) || 0;
        const tasaManualSeleccionada = parseFloat(inputTasaManual.value) || 0;
        const fechaReporte = document.getElementById('pago-fecha-reporte').value;
        const fechaReal = document.getElementById('pago-fecha-real').value;
        const meses = parseInt(document.getElementById('pago-meses').value) || 1;
        const metodo = selectMetodo.value;
        const referencia = metodo === 'efectivo' ? 'N/A' : inputRef.value.trim();
        const numeroFactura = document.getElementById('pago-factura').value.trim();

        if (tasaManualSeleccionada <= 0) {
            mostrarToast("Error", "Ingresa una tasa válida mayor a 0.");
            return;
        }

        const index = clientes.findIndex(c => c.id === id);
        if (index > -1 && montoFinalUSD > 0) {
            
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSubmit.disabled = true;

            try {
                // Guardado de respaldo en caso de fallo
                const clienteCopia = JSON.parse(JSON.stringify(clientes[index]));

                clientes[index].estado = 'revision';
                clientes[index].montoPendiente = montoFinalUSD;
                clientes[index].fechaPagoReporte = fechaReporte;
                clientes[index].fechaPagoReal = fechaReal;
                clientes[index].mesesReportados = meses;
                clientes[index].metodoPagoReporte = metodo;
                clientes[index].referenciaReporte = referencia;
                clientes[index].tasaReporte = tasaManualSeleccionada;
                clientes[index].numeroFactura = numeroFactura;

                await guardarNube();
                
                if(modalPago) modalPago.style.display = 'none';
                mostrarToast("¡Pago Reportado!", "Se guardó en la nube y se envió a revisión.");
                e.target.reset();

            } catch (error) {
                console.error(error);
                mostrarToast("❌ Error Crítico", "No se guardó el pago. Verifica tu conexión.");
                // Si falla, revertimos el cambio para que pueda intentarlo de nuevo
                if (typeof clienteCopia !== 'undefined') clientes[index] = clienteCopia;
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        }
    });

    const modalClienteSec = document.getElementById('modal-cliente-sec');
    const formClienteSec = document.getElementById('form-cliente-sec');

    document.getElementById('btn-agregar-cliente-sec')?.addEventListener('click', () => {
        if(formClienteSec) formClienteSec.reset();
        document.getElementById('cli-funerario').value = 'si';
        document.getElementById('cli-cremacion').value = 'no';
        const inputFecha = document.getElementById('cli-vence');
        if (inputFecha) {
            inputFecha.value = new Date(Date.now() + (28 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
        }
        if(modalClienteSec) modalClienteSec.style.display = 'flex';
    });

    document.getElementById('cerrar-modal-cliente-sec')?.addEventListener('click', () => {
        if(modalClienteSec) modalClienteSec.style.display = 'none';
    });

    if(formClienteSec) {
        formClienteSec.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!navigator.onLine) {
                mostrarToast("⚠️ Sin Conexión", "Conéctate a internet para guardar el afiliado de forma segura.");
                return;
            }

            const btnSubmit = e.target.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSubmit.disabled = true;

            try {
                const fechaInput = document.getElementById('cli-vence').value;
                let timestampVencimiento = fechaInput ? new Date(`${fechaInput}T23:59:59`).getTime() : Date.now() + (28 * 86400000);

                const nuevoAfiliado = {
                    id: Date.now(),
                    nombre: document.getElementById('cli-nombre').value.trim(),
                    cedula: document.getElementById('cli-cedula').value.trim(),
                    numeroAsociado: document.getElementById('cli-asociado').value.trim(),
                    contrato: document.getElementById('cli-contrato').value.trim(),
                    telefono: document.getElementById('cli-telefono').value.trim(),
                    tieneFunerario: document.getElementById('cli-funerario').value === 'si',
                    tieneCremacion: document.getElementById('cli-cremacion').value === 'si',
                    fechaVencimiento: timestampVencimiento,
                    estado: 'aldia',
                    montoPendiente: 0
                };

                clientes.push(nuevoAfiliado);
                await guardarNube();

                formClienteSec.reset();
                if(modalClienteSec) modalClienteSec.style.display = 'none';
                mostrarToast("¡Afiliado Creado!", "Se ha guardado en el servidor principal.");

            } catch(error) {
                clientes.pop(); // Revertir si falla
                console.error(error);
                mostrarToast("❌ Error", "Falló la sincronización. Inténtalo de nuevo.");
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }

    document.getElementById('buscador-clientes')?.addEventListener('input', (e) => renderizarClientes(e.target.value));
    escucharNubeEnTiempoReal();
});