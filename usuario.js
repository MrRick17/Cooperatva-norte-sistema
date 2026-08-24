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

    let clientes = [];
    let ingresosTotalesUSD = 0;
    let historialPagos = [];

    // === FUNCIÓN PARA MOSTRAR LA NOTIFICACIÓN ELEGANTE ===
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
            }
        }, (error) => console.error("Error Firebase:", error));
    }

    async function guardarNube() {
        try {
            await db.collection("cooperativa").doc("directorio").set({
                listaAfiliados: clientes,
                ingresosUSD: ingresosTotalesUSD,
                historialPagos: historialPagos
            });
        } catch (error) {
            console.error("Error al guardar:", error);
        }
    }

    const renderizarClientes = (filtro = '') => {
        const grid = document.getElementById('clientes-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const hoy = new Date();
const inicioDeMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
let requiereGuardar = false;

clientes.forEach(c => {
    // No tocamos a los que están esperando aprobación de secretaría
    if (c.estado !== 'revision') {
        if (c.fechaVencimiento < inicioDeMesActual) {
            // Si está vencido pero no dice "atrasado", lo corregimos
            if (c.estado !== 'atrasado') {
                c.estado = 'atrasado';
                requiereGuardar = true;
            }
        } else {
            // Si NO está vencido pero estaba marcado como "atrasado" por el error viejo, lo reparamos
            if (c.estado !== 'aldia') {
                c.estado = 'aldia';
                requiereGuardar = true;
            }
        }
    }
});

// Si el sistema detectó y reparó errores, guardamos los cambios en Firebase automáticamente
if (requiereGuardar && typeof guardarNube === 'function') {
    guardarNube();
}

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
        
        // Calculamos cuánto paga ESTE cliente en específico por 1 mes
        // Calculamos cuánto paga ESTE cliente en específico por 1 mes
        let cuotaMensual = 10; // Base estándar corregida a 10
        if (cliente) {
            const baseFunerario = (cliente.tieneFunerario !== false) ? 5 : 0;
            const baseAdmin = 2;
            const baseProteccion = cliente.tieneCremacion ? 7 : 2;
            
            // Sumamos los fondos fijos + $1 que se va al ahorro
            cuotaMensual = baseFunerario + baseAdmin + baseProteccion + 1;
        }

        const inputMeses = document.getElementById('pago-meses');
        if(inputMeses) {
            inputMeses.value = 1;
            inputMeses.setAttribute('data-cuota', cuotaMensual); // Guardamos su cuota base oculta
        }
        
        if(inputUsd) inputUsd.value = cuotaMensual; // Auto-llenamos el monto inicial automáticamente
        if(inputBs) inputBs.value = '';
        if(inputTasaManual) inputTasaManual.value = '';
        if(inputRef) inputRef.value = '';
        if(document.getElementById('pago-factura')) document.getElementById('pago-factura').value = '';
        
        actualizarCamposMetodo('pago_movil');
        if(modalPago) modalPago.style.display = 'flex';
    };

    // NUEVO: Calculadora automática cuando la secretaria cambie los meses
    document.getElementById('pago-meses')?.addEventListener('input', (e) => {
        const meses = parseInt(e.target.value) || 1;
        const cuota = parseFloat(e.target.getAttribute('data-cuota')) || 10;
        
        if (inputUsd) {
            inputUsd.value = (cuota * meses).toFixed(2);
            
            // Si la secretaria ya había escrito la tasa, le calculamos los Bolívares de una vez
            const tasa = parseFloat(inputTasaManual.value) || 0;
            if (tasa > 0 && inputBs) {
                inputBs.value = (parseFloat(inputUsd.value) * tasa).toFixed(2);
            }
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

    if(selectMetodo) {
        selectMetodo.addEventListener('change', (e) => actualizarCamposMetodo(e.target.value));
    }

    if(inputTasaManual) {
        inputTasaManual.addEventListener('input', () => {
            if (inputUsd.value) {
                inputBs.value = parseFloat((parseFloat(inputUsd.value) * parseFloat(inputTasaManual.value)).toFixed(6));
            } else if (inputBs.value) {
                inputUsd.value = parseFloat((parseFloat(inputBs.value) / parseFloat(inputTasaManual.value)).toFixed(6));
            }
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

    document.getElementById('form-pago')?.addEventListener('submit', (e) => {
        e.preventDefault();
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
            clientes[index].estado = 'revision';
            clientes[index].montoPendiente = montoFinalUSD;
            clientes[index].fechaPagoReporte = fechaReporte;
            clientes[index].fechaPagoReal = fechaReal;
            clientes[index].mesesReportados = meses;
            clientes[index].metodoPagoReporte = metodo;
            clientes[index].referenciaReporte = referencia;
            clientes[index].tasaReporte = tasaManualSeleccionada;
            clientes[index].numeroFactura = numeroFactura; // <-- NUEVO

            if(modalPago) modalPago.style.display = 'none';
            guardarNube();
            mostrarToast("Pago Reportado", "Enviado a revisión administrativa con éxito.");
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
            const hoyMas28 = new Date(Date.now() + (28 * 24 * 60 * 60 * 1000));
            inputFecha.value = hoyMas28.toISOString().split('T')[0];
        }
        if(modalClienteSec) modalClienteSec.style.display = 'flex';
    });

    document.getElementById('cerrar-modal-cliente-sec')?.addEventListener('click', () => {
        if(modalClienteSec) modalClienteSec.style.display = 'none';
    });

    if(formClienteSec) {
        formClienteSec.addEventListener('submit', (e) => {
            e.preventDefault();
            const fechaInput = document.getElementById('cli-vence').value;
            let timestampVencimiento;
            if (fechaInput) {
                const [y, m, d] = fechaInput.split('-');
                timestampVencimiento = new Date(y, m-1, d, 23, 59, 59).getTime();
            } else {
                timestampVencimiento = Date.now() + (28 * 24 * 60 * 60 * 1000);
            }

            clientes.push({
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
            });

            formClienteSec.reset();
            if(modalClienteSec) modalClienteSec.style.display = 'none';
            guardarNube();
            mostrarToast("Afiliado Creado", "Se guardó en el directorio exitosamente.");
        });
    }

    document.getElementById('buscador-clientes')?.addEventListener('input', (e) => {
        renderizarClientes(e.target.value);
    });

    escucharNubeEnTiempoReal();
});