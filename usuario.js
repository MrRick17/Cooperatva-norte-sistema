document.addEventListener('DOMContentLoaded', () => {
    let clientes = JSON.parse(localStorage.getItem('coop_clientes')) || [];
    let TASA_BCV = 0;

    // 1. OBTENER TASA OFICIAL DEL BCV EN TIEMPO REAL
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
            if (infoTasa) infoTasa.textContent = "Error al cargar tasa. Conversión manual requerida.";
        }
        renderizarClientes();
    }

    const verificarVencimientos = () => {
        const ahora = Date.now();
        let modificado = false;
        clientes.forEach(c => {
            if (c.estado === 'aldia' && ahora > c.fechaVencimiento) {
                c.estado = 'atrasado';
                modificado = true;
            }
        });
        if (modificado) localStorage.setItem('coop_clientes', JSON.stringify(clientes));
    };

    const renderizarClientes = (filtro = '') => {
        verificarVencimientos();
        const grid = document.getElementById('grid-secretaria');
        if (!grid) return;
        grid.innerHTML = '';

        const filtrados = clientes.filter(c => c.nombre.toLowerCase().includes(filtro.toLowerCase()) || c.cedula.toLowerCase().includes(filtro.toLowerCase()));

        if (filtrados.length === 0) {
            grid.innerHTML = `<p style="text-align:center; color:#6B7280; grid-column:1/-1; padding:20px;">No hay afiliados registrados o que coincidan con la búsqueda.</p>`;
            return;
        }

        filtrados.forEach(c => {
            let badgeClass = c.estado === 'aldia' ? 'badge-aldia' : (c.estado === 'revision' ? 'badge-revision' : 'badge-vencida');
            let estadoTexto = c.estado === 'aldia' ? 'Al Día' : (c.estado === 'revision' ? 'En Revisión' : 'Atrasado');
            let fechaF = new Date(c.fechaVencimiento).toLocaleDateString('es-ES');

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
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">C.I: ${c.cedula} | Contrato: ${c.contrato}</p>
                        </div>
                        <span class="badge ${badgeClass}">${estadoTexto}</span>
                    </div>
                    <div class="cliente-servicios" style="background:#F9FAFB; padding:12px; border-radius:8px; margin:15px 0;">
                        <p style="margin:0; font-size:0.85rem;"><i class="fa-solid fa-calendar" style="color:#006412;"></i> Vence: <strong>${fechaF}</strong></p>
                        ${familiaresHTML}
                    </div>
                    <div class="cliente-card__actions">
                        ${c.estado !== 'revision' 
                            ? `<button class="btn-accion-cliente" onclick="abrirModalPago(${c.id}, '${c.nombre}')" style="background:#006412; color:white; border:none;"><i class="fa-solid fa-file-invoice-dollar"></i> Reportar Pago</button>` 
                            : `<button class="btn-accion-cliente" disabled style="background:#E5E7EB; color:#9CA3AF; cursor:not-allowed;"><i class="fa-solid fa-clock"></i> Esperando Aprobación</button>`
                        }
                    </div>
                </div>
            `;
        });
    };

    // CONTROLES E INTERACCIÓN INTELIGENTE DEL MODAL DE PAGO
    const modalPago = document.getElementById('modal-pago');
    const inputUsd = document.getElementById('pago-monto-usd');
    const inputBs = document.getElementById('pago-monto-bs');

    window.abrirModalPago = (id, nombre) => {
        document.getElementById('pago-cliente-id').value = id;
        document.getElementById('pago-cliente-nombre').textContent = nombre;
        inputUsd.value = '';
        inputBs.value = '';
        modalPago.style.display = 'flex';
    };

    // ESCUCHADORES CRUZADOS (INPUT EVENTS)
    inputUsd.addEventListener('input', () => {
        const valUsd = parseFloat(inputUsd.value);
        if (!isNaN(valUsd) && TASA_BCV > 0) {
            inputBs.value = (valUsd * TASA_BCV).toFixed(2);
        } else {
            inputBs.value = '';
        }
    });

    inputBs.addEventListener('input', () => {
        const valBs = parseFloat(inputBs.value);
        if (!isNaN(valBs) && TASA_BCV > 0) {
            inputUsd.value = (valBs / TASA_BCV).toFixed(2);
        } else {
            inputUsd.value = '';
        }
    });

    document.getElementById('cerrar-modal-pago').addEventListener('click', () => modalPago.style.display = 'none');

    document.getElementById('form-pago').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('pago-cliente-id').value);
        
        // Al final, lo que le interesa al sistema contable base son los Dólares ($)
        const montoFinalUSD = parseFloat(inputUsd.value) || 0;

        const index = clientes.findIndex(c => c.id === id);
        if (index > -1 && montoFinalUSD > 0) {
            clientes[index].estado = 'revision';
            clientes[index].montoPendiente = montoFinalUSD; // Pasa el valor neto en USD a revisión
            localStorage.setItem('coop_clientes', JSON.stringify(clientes));
            renderizarClientes(document.getElementById('buscador-clientes').value);
            modalPago.style.display = 'none';
        }
    });

    document.getElementById('buscador-clientes').addEventListener('input', (e) => renderizarClientes(e.target.value));

    // Ejecutar carga inicial de tasa oficial
    obtenerTasaBCV();
});