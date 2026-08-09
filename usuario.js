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
    let TASA_BCV = 0;

    async function obtenerTasaBCV() {
        const infoTasa = document.getElementById('tasa-informativa-modal');
        try {
            const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            const datos = await respuesta.json();
            TASA_BCV = datos.promedio || datos.venta || 0;
            if (infoTasa && TASA_BCV > 0) {
                infoTasa.textContent = `Tasa Oficial BCV: ${TASA_BCV.toFixed(2)} Bs/$`;
            }
        } catch (error) {
            console.error("Error consultando tasa:", error);
        }
    }

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
        obtenerTasaBCV();
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

        const ahora = Date.now();
        clientes.forEach(c => {
            if (c.estado === 'aldia' && ahora > c.fechaVencimiento) c.estado = 'atrasado';
        });

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
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">C.I: ${c.cedula} | Contrato: ${c.contrato || 'N/A'}</p>
                        </div>
                        <span class="badge ${badgeClass}">${estadoTexto}</span>
                    </div>
                    <div class="cliente-servicios" style="background:#F9FAFB; padding:12px; border-radius:8px; margin:15px 0;">
                        <p style="margin:0; font-size:0.85rem;"><i class="fa-solid fa-calendar" style="color:#006412;"></i> Vence: <strong>${fechaF}</strong></p>
                    </div>
                    <div class="cliente-card__actions">
                        ${c.estado !== 'revision' 
                            ? `<button class="btn-accion-cliente" onclick="abrirModalPago(${c.id}, '${(c.nombre || '').replace(/'/g, "\\'")}')" style="background:#006412; color:white; border:none; width: 100%; border-radius: 6px; padding: 10px 0; cursor: pointer; font-weight:600;"><i class="fa-solid fa-file-invoice-dollar"></i> Reportar Pago</button>` 
                            : `<button class="btn-accion-cliente" disabled style="background:#E5E7EB; color:#9CA3AF; width: 100%; border-radius: 6px; padding: 10px 0; font-weight:600;"><i class="fa-solid fa-clock"></i> Esperando Aprobación</button>`
                        }
                    </div>
                </div>
            `;
        });
    };

    const modalPago = document.getElementById('modal-pago');
    const inputUsd = document.getElementById('pago-monto-usd');
    const inputBs = document.getElementById('pago-monto-bs');
    const selectMetodo = document.getElementById('pago-metodo');
    const contenedorRef = document.getElementById('contenedor-referencia');
    const inputRef = document.getElementById('pago-referencia');
    const labelRef = document.getElementById('label-referencia');

    window.abrirModalPago = (id, nombre) => {
        document.getElementById('pago-cliente-id').value = id;
        document.getElementById('pago-cliente-nombre').textContent = nombre;
        document.getElementById('pago-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('pago-meses').value = 1;
        if(inputUsd) inputUsd.value = '';
        if(inputBs) inputBs.value = '';
        if(inputRef) inputRef.value = '';
        
        actualizarCamposMetodo('pago_movil');
        if(modalPago) modalPago.style.display = 'flex';
    };

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

    if(inputUsd) {
        inputUsd.addEventListener('input', () => {
            const valUsd = parseFloat(inputUsd.value);
            if (!isNaN(valUsd) && TASA_BCV > 0) inputBs.value = (valUsd * TASA_BCV).toFixed(2);
            else inputBs.value = '';
        });
    }

    if(inputBs) {
        inputBs.addEventListener('input', () => {
            const valBs = parseFloat(inputBs.value);
            if (!isNaN(valBs) && TASA_BCV > 0) inputUsd.value = (valBs / TASA_BCV).toFixed(2);
            else inputUsd.value = '';
        });
    }

    document.getElementById('cerrar-modal-pago')?.addEventListener('click', () => { 
        if(modalPago) modalPago.style.display = 'none'; 
    });

    document.getElementById('form-pago')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('pago-cliente-id').value);
        const montoFinalUSD = parseFloat(inputUsd.value) || 0;
        const fechaPago = document.getElementById('pago-fecha').value;
        const meses = parseInt(document.getElementById('pago-meses').value) || 1;
        const metodo = selectMetodo.value;
        const referencia = metodo === 'efectivo' ? 'N/A' : inputRef.value.trim();

        const index = clientes.findIndex(c => c.id === id);
        if (index > -1 && montoFinalUSD > 0) {
            clientes[index].estado = 'revision';
            clientes[index].montoPendiente = montoFinalUSD;
            clientes[index].fechaPagoReporte = fechaPago;
            clientes[index].mesesReportados = meses;
            clientes[index].metodoPagoReporte = metodo;
            clientes[index].referenciaReporte = referencia;
            clientes[index].tasaReporte = TASA_BCV;

            if(modalPago) modalPago.style.display = 'none';
            guardarNube();
        }
    });

    document.getElementById('buscador-clientes')?.addEventListener('input', (e) => {
        renderizarClientes(e.target.value);
    });

    escucharNubeEnTiempoReal();
});