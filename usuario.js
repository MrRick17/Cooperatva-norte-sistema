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
    let TASA_BCV = 0;

    async function obtenerTasaBCV() {
        const infoTasa = document.getElementById('tasa-informativa-modal');
        try {
            const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            const datos = await respuesta.json();
            TASA_BCV = datos.promedio || datos.venta || 0;
            if (infoTasa && TASA_BCV > 0) {
                infoTasa.textContent = `Tasa Oficial BCV: Referencia ${TASA_BCV.toFixed(2)} Bs/$`;
            }
        } catch (error) {
            console.error("Error consultando tasa para secretaría:", error);
        }
    }

    // 🚨 LA CORRECCIÓN CLAVE: AHORA LEE DE LA MISMA RUTA QUE EL ADMIN
    function escucharNubeEnTiempoReal() {
        db.collection("cooperativa").doc("directorio").onSnapshot((docSnap) => {
            if (docSnap.exists) {
                const data = docSnap.data();
                clientes = data.listaAfiliados || [];
                ingresosTotalesUSD = data.ingresosUSD || 0;
                
                const buscador = document.getElementById('buscador-clientes');
                renderizarClientes(buscador ? buscador.value : '');
            } else {
                console.log("No existen datos aún en el documento de Firebase.");
            }
        }, (error) => {
            console.error("Error de conexión con Firebase:", error);
        });
        obtenerTasaBCV();
    }

    // GUARDAR LOS REPORTES DE PAGO EN LA MISMA RUTA
    async function guardarNube() {
        try {
            await db.collection("cooperativa").doc("directorio").set({
                listaAfiliados: clientes,
                ingresosUSD: ingresosTotalesUSD
            });
        } catch (error) {
            console.error("Error guardando reporte desde secretaría:", error);
        }
    }

    const renderizarClientes = (filtro = '') => {
        const grid = document.getElementById('clientes-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const ahora = Date.now();
        clientes.forEach(c => {
            if (c.estado === 'aldia' && ahora > c.fechaVencimiento) {
                c.estado = 'atrasado';
            }
        });

        const filtrados = clientes.filter(c => 
            (c.nombre && c.nombre.toLowerCase().includes(filtro.toLowerCase())) || 
            (c.cedula && c.cedula.toLowerCase().includes(filtro.toLowerCase())) ||
            (c.contrato && c.contrato.toLowerCase().includes(filtro.toLowerCase()))
        );

        if (filtrados.length === 0) {
            grid.innerHTML = `<p style="text-align:center; grid-column:1/-1; padding:20px; color:#6B7280; font-weight:600;">No hay afiliados registrados o que coincidan con la búsqueda.</p>`;
            return;
        }

        filtrados.forEach(c => {
            let badgeClass = c.estado === 'aldia' ? 'badge-aldia' : (c.estado === 'revision' ? 'badge-revision' : 'badge-vencida');
            let estadoTexto = c.estado === 'aldia' ? 'Al Día' : (c.estado === 'revision' ? 'En Revisión' : 'Atrasado');
            let fechaF = c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString('es-ES') : 'N/A';

            let familiaresHTML = '';
            if (c.familiaresLista && c.familiaresLista.length > 0) {
                familiaresHTML = '<div style="margin-top:8px; padding-top:8px; border-top:1px solid #E5E7EB; font-size:0.8rem; color:#4B5563;"><strong>Familiares registrados:</strong><ul style="margin-left:15px; margin-top:4px;">';
                c.familiaresLista.forEach(f => {
                    familiaresHTML += `<li>${f.nombre} (${f.parentesco})</li>`;
                });
                familiaresHTML += '</ul></div>';
            }

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
                        ${familiaresHTML}
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

    window.abrirModalPago = (id, nombre) => {
        document.getElementById('pago-cliente-id').value = id;
        document.getElementById('pago-cliente-nombre').textContent = nombre;
        if(inputUsd) inputUsd.value = '';
        if(inputBs) inputBs.value = '';
        if(modalPago) modalPago.style.display = 'flex';
    };

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

        const index = clientes.findIndex(c => c.id === id);
        if (index > -1 && montoFinalUSD > 0) {
            clientes[index].estado = 'revision';
            clientes[index].montoPendiente = montoFinalUSD; 
            if(modalPago) modalPago.style.display = 'none';
            guardarNube();
        }
    });

    document.getElementById('buscador-clientes')?.addEventListener('input', (e) => {
        renderizarClientes(e.target.value);
    });

    escucharNubeEnTiempoReal();
});