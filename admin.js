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

document.addEventListener('DOMContentLoaded', () => {
    
    // NAVEGACIÓN
    const navItems = document.querySelectorAll('.nav-item[data-vista]');
    const vistas = document.querySelectorAll('.vista-seccion');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            const destino = item.getAttribute('data-vista');
            vistas.forEach(v => v.style.display = 'none');
            const vistaDestino = document.getElementById(`vista-${destino}`);
            if(vistaDestino) vistaDestino.style.display = 'block';

            if (destino === 'contabilidad') {
                renderizarContabilidad();
            }
        });
    });

    let clientes = [];
    let ingresosTotalesUSD = 0;
    let historialPagos = [];
    let TASA_BCV = 0;

    async function obtenerTasaBCV() {
        try {
            const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            const datos = await respuesta.json();
            TASA_BCV = datos.promedio || datos.venta || 0;
        } catch (error) {
            console.error("Error API BCV:", error);
            TASA_BCV = 0;
        }
        actualizarPantalla();
    }

    function escucharNubeEnTiempoReal() {
        db.collection("cooperativa").doc("directorio").onSnapshot((docSnap) => {
            if (docSnap.exists) {
                const data = docSnap.data();
                clientes = data.listaAfiliados || [];
                ingresosTotalesUSD = data.ingresosUSD || 0;
                historialPagos = data.historialPagos || [];
                actualizarPantalla();
            } else {
                db.collection("cooperativa").doc("directorio").set({
                    listaAfiliados: [],
                    ingresosUSD: 0,
                    historialPagos: []
                });
            }
        }, (error) => console.error("Error Firestore:", error));
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
            console.error("Error al guardar en Firebase:", error);
        }
    }

    const actualizarPantalla = () => {
        const ahora = Date.now();
        clientes.forEach(c => {
            if (c.estado === 'aldia' && ahora > c.fechaVencimiento) c.estado = 'atrasado';
        });

        const enRevision = clientes.filter(c => c.estado === 'revision');
        
        const kpiIngresos = document.getElementById('kpi-ingresos');
        if (kpiIngresos) {
            if (TASA_BCV > 0) {
                const ingresosBs = ingresosTotalesUSD * TASA_BCV;
                kpiIngresos.innerHTML = `
                    <div style="font-size: 1.8rem; font-weight: 800; color: #1F2937;">$${ingresosTotalesUSD.toFixed(2)}</div>
                    <div style="font-size: 1.1rem; font-weight: 600; color: #006412; margin-top: 2px;">${ingresosBs.toFixed(2)} Bs</div>
                `;
            } else {
                kpiIngresos.innerHTML = `<div style="font-size: 1.8rem; font-weight: 800; color: #1F2937;">$${ingresosTotalesUSD.toFixed(2)}</div>`;
            }
        }

        const kpiRev = document.getElementById('kpi-revisiones');
        const kpiAfi = document.getElementById('kpi-afiliados');
        if (kpiRev) kpiRev.textContent = enRevision.length;
        if (kpiAfi) kpiAfi.textContent = clientes.length;

        renderizarRevisiones(enRevision);
        renderizarDirectorio();
        renderizarContabilidad();
    };

    const renderizarRevisiones = (lista) => {
        const grid = document.getElementById('grid-admin-revisiones');
        if(!grid) return;
        grid.innerHTML = '';
        if(lista.length === 0) {
            grid.innerHTML = '<p style="color:#6B7280; grid-column:1/-1;">No hay pagos pendientes por revisar.</p>';
            return;
        }

        lista.forEach(c => {
            const metodoTexto = c.metodoPagoReporte === 'pago_movil' ? 'Pago Móvil' : (c.metodoPagoReporte === 'transferencia' ? 'Transferencia' : 'Efectivo');
            grid.innerHTML += `
                <div class="cliente-card card-revision">
                    <h3 style="margin:0; font-size:1.1rem;">${c.nombre}</h3>
                    <p style="margin:4px 0; font-size:0.85rem; color:#4B5563;">C.I: ${c.cedula} | Monto: <strong style="color:#006412;">$${c.montoPendiente}</strong></p>
                    <p style="margin:2px 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-calendar-day"></i> Fecha Pago: <strong>${c.fechaPagoReporte || 'N/A'}</strong></p>
                    <p style="margin:2px 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-receipt"></i> ${metodoTexto}: <strong>${c.referenciaReporte || 'N/A'}</strong></p>
                    
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="btn-accion-cliente" onclick="verDetallesPago(${c.id})" style="background:#3B82F6; color:white; border:none; flex:1;"><i class="fa-solid fa-eye"></i> Ver Detalles</button>
                        <button class="btn-accion-cliente" onclick="aprobarPago(${c.id})" style="background:#006412; color:white; border:none; flex:1;"><i class="fa-solid fa-check"></i> Aprobar</button>
                    </div>
                </div>
            `;
        });
    };

    window.verDetallesPago = (id) => {
        const c = clientes.find(item => item.id === id);
        if (!c) return;

        const meses = c.mesesReportados || 1;
        const total = c.montoPendiente || 0;
        const tasa = c.tasaReporte || TASA_BCV || 0;

        const funerarioUSD = 5 * meses;
        const adminUSD = 2 * meses;
        const ahorrosUSD = Math.max(0, total - funerarioUSD - adminUSD);

        const html = `
            <p><strong>Cliente:</strong> ${c.nombre}</p>
            <p><strong>Fecha Reportada:</strong> ${c.fechaPagoReporte || 'N/A'}</p>
            <p><strong>Meses Pagados:</strong> ${meses}</p>
            <p><strong>Tasa Referencia:</strong> ${tasa.toFixed(2)} Bs/$</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid #E5E7EB;">
            <p style="color:#3B82F6;"><strong>Aporte Funerario ($5/mes):</strong> ${(funerarioUSD * tasa).toFixed(2)} Bs</p>
            <p style="color:#F59E0B;"><strong>Aporte Administrativo ($2/mes):</strong> ${(adminUSD * tasa).toFixed(2)} Bs</p>
            <p style="color:#10B981;"><strong>Ahorros Restante:</strong> ${(ahorrosUSD * tasa).toFixed(2)} Bs</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid #E5E7EB;">
            <p style="font-size: 1.05rem; font-weight: bold; color: #006412;">Total Pago: ${(total * tasa).toFixed(2)} Bs</p>
        `;

        document.getElementById('contenido-detalles-modal').innerHTML = html;
        document.getElementById('modal-detalles-pago').style.display = 'flex';
    };

    document.getElementById('cerrar-modal-detalles')?.addEventListener('click', () => {
        document.getElementById('modal-detalles-pago').style.display = 'none';
    });

    window.aprobarPago = (id) => {
        const index = clientes.findIndex(c => c.id === id);
        if(index > -1) {
            const c = clientes[index];
            const montoReportado = parseFloat(c.montoPendiente || 0);
            const meses = parseInt(c.mesesReportados || 1);
            const tasa = c.tasaReporte || TASA_BCV || 0;

            const funerarioUSD = 5 * meses;
            const adminUSD = 2 * meses;
            const ahorrosUSD = Math.max(0, montoReportado - funerarioUSD - adminUSD);

            ingresosTotalesUSD += montoReportado;
            c.montoAprobadoHistorial = (c.montoAprobadoHistorial || 0) + montoReportado;
            c.estado = 'aldia';
            c.montoPendiente = 0;
            
            let baseTime = c.fechaVencimiento || Date.now();
            if(baseTime < Date.now()) baseTime = Date.now();
            c.fechaVencimiento = baseTime + (meses * 28 * 24 * 60 * 60 * 1000);

            historialPagos.push({
                idPago: Date.now(),
                clienteNombre: c.nombre,
                cedula: c.cedula,
                fechaPago: c.fechaPagoReporte || new Date().toISOString().split('T')[0],
                meses: meses,
                metodo: c.metodoPagoReporte || 'efectivo',
                referencia: c.referenciaReporte || 'N/A',
                montoTotalUSD: montoReportado,
                funerarioUSD: funerarioUSD,
                adminUSD: adminUSD,
                ahorrosUSD: ahorrosUSD,
                tasaBCV: tasa
            });

            guardarNube();
        }
    };

    const renderizarContabilidad = () => {
        const selectMes = document.getElementById('filtro-mes-contabilidad');
        const tabla = document.getElementById('tabla-historial-contabilidad');
        if (!tabla || !selectMes) return;

        const mesesSet = new Set();
        const hoyMes = new Date().toISOString().slice(0, 7);
        mesesSet.add(hoyMes);

        historialPagos.forEach(p => {
            if (p.fechaPago) mesesSet.add(p.fechaPago.slice(0, 7));
        });

        const mesesOrdenados = Array.from(mesesSet).sort().reverse();
        
        const valorPrevio = selectMes.value;
        selectMes.innerHTML = '';
        mesesOrdenados.forEach(m => {
            const [y, mesNum] = m.split('-');
            const fechaObj = new Date(y, mesNum - 1, 1);
            const nombreMes = fechaObj.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
            selectMes.innerHTML += `<option value="${m}">${nombreMes.toUpperCase()}</option>`;
        });

        if (valorPrevio && mesesSet.has(valorPrevio)) selectMes.value = valorPrevio;

        const mesSeleccionado = selectMes.value || hoyMes;
        const pagosFiltrados = historialPagos.filter(p => p.fechaPago && p.fechaPago.startsWith(mesSeleccionado));

        let totFunerarioBs = 0, totAdminBs = 0, totAhorrosBs = 0, totGeneralBs = 0;

        tabla.innerHTML = '';

        if (pagosFiltrados.length === 0) {
            tabla.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:15px; color:#6B7280;">No hay pagos registrados en este mes.</td></tr>`;
        } else {
            pagosFiltrados.forEach(p => {
                const tasa = p.tasaBCV || TASA_BCV || 1; 
                
                const funBs = p.funerarioUSD * tasa;
                const admBs = p.adminUSD * tasa;
                const ahoBs = p.ahorrosUSD * tasa;
                const totalBs = p.montoTotalUSD * tasa;

                totFunerarioBs += funBs;
                totAdminBs += admBs;
                totAhorrosBs += ahoBs;
                totGeneralBs += totalBs;

                const metodoTexto = p.metodo === 'pago_movil' ? 'Pago Móvil' : (p.metodo === 'transferencia' ? 'Transferencia' : 'Efectivo');

                tabla.innerHTML += `
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                        <td style="padding: 10px;">${p.fechaPago}</td>
                        <td style="padding: 10px;"><strong>${p.clienteNombre}</strong><br><span style="font-size:0.75rem; color:#6B7280;">C.I: ${p.cedula}</span></td>
                        <td style="padding: 10px;">${metodoTexto}<br><span style="font-size:0.75rem; color:#6B7280;">Ref: ${p.referencia}</span></td>
                        <td style="padding: 10px; color:#3B82F6;">${funBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#F59E0B;">${admBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#10B981;">${ahoBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; font-weight:bold; color:#006412;">${totalBs.toFixed(2)} Bs</td>
                    </tr>
                `;
            });
        }

        document.getElementById('kpi-cont-total').textContent = `${totGeneralBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-funerario').textContent = `${totFunerarioBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-admin').textContent = `${totAdminBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-ahorros').textContent = `${totAhorrosBs.toFixed(2)} Bs`;
    };

    document.getElementById('filtro-mes-contabilidad')?.addEventListener('change', renderizarContabilidad);

    const renderizarDirectorio = () => {
        const grid = document.getElementById('grid-admin-clientes');
        if(!grid) return;
        grid.innerHTML = '';
        if(clientes.length === 0) {
            grid.innerHTML = '<p style="color:#6B7280; grid-column:1/-1;">No hay afiliados.</p>';
            return;
        }

        clientes.forEach(c => {
            let estadoTexto = c.estado === 'aldia' ? 'Al Día' : (c.estado === 'revision' ? 'En Revisión' : 'Atrasado');
            let badgeClass = c.estado === 'aldia' ? 'badge-aldia' : (c.estado === 'revision' ? 'badge-revision' : 'badge-vencida');

            grid.innerHTML += `
                <div class="cliente-card ${c.estado === 'atrasado' ? 'card-alerta' : (c.estado === 'revision' ? 'card-revision' : 'card-ok')}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:#1F2937;">${c.nombre}</h3>
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">C.I: ${c.cedula} | <i class="fa-solid fa-phone" style="font-size:0.75rem;"></i> ${c.telefono || 'N/A'}</p>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge ${badgeClass}">${estadoTexto}</span>
                            <button onclick="confirmarEliminar(${c.id})" style="background:none; border:none; color:#EF4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="cliente-servicios" style="background:#F9FAFB; padding:10px; border-radius:8px; margin-top:12px;">
                        <p style="margin:0; font-size:0.82rem;"><i class="fa-solid fa-calendar" style="color:#006412;"></i> Vence: <strong>${new Date(c.fechaVencimiento).toLocaleDateString('es-ES')}</strong></p>
                    </div>
                </div>
            `;
        });
    };

    let clienteEliminarId = null;
    const modalEliminar = document.getElementById('modal-eliminar-afiliado');
    window.confirmarEliminar = (id) => {
        clienteEliminarId = id;
        if(modalEliminar) modalEliminar.style.display = 'flex';
    };

    document.getElementById('btn-cancelar-eliminar')?.addEventListener('click', () => {
        if(modalEliminar) modalEliminar.style.display = 'none';
        clienteEliminarId = null;
    });

    document.getElementById('btn-confirmar-eliminar')?.addEventListener('click', () => {
        if(clienteEliminarId) {
            clientes = clientes.filter(c => c.id !== clienteEliminarId);
            guardarNube();
            if(modalEliminar) modalEliminar.style.display = 'none';
        }
    });

    const formCliente = document.getElementById('form-cliente');
    document.getElementById('btn-agregar-cliente')?.addEventListener('click', () => {
        if(formCliente) formCliente.reset();
        const inputFecha = document.getElementById('cli-vence');
        if (inputFecha) {
            const hoyMas28 = new Date(Date.now() + (28 * 24 * 60 * 60 * 1000));
            inputFecha.value = hoyMas28.toISOString().split('T')[0];
        }
        document.getElementById('modal-cliente').style.display = 'flex';
    });

    document.getElementById('cerrar-modal-cliente')?.addEventListener('click', () => {
        document.getElementById('modal-cliente').style.display = 'none';
    });

    if(formCliente) {
        formCliente.addEventListener('submit', (e) => {
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
                contrato: document.getElementById('cli-contrato').value.trim(),
                telefono: document.getElementById('cli-telefono').value.trim(),
                fechaVencimiento: timestampVencimiento,
                estado: 'aldia',
                montoPendiente: 0
            });

            formCliente.reset();
            document.getElementById('modal-cliente').style.display = 'none';
            guardarNube();
        });
    }

    // -----------------------------------------------------------
    // EXCEL EXCLUSIVAMENTE CON LOS 4 DATOS SOLICITADOS
    // -----------------------------------------------------------
    document.getElementById('btn-exportar-excel')?.addEventListener('click', () => {
        if (clientes.length === 0) return alert('No hay afiliados para exportar.');
        
        const datosExcel = clientes.map(c => ({
            "N° Contrato": c.contrato || 'N/A',
            "Nombre": c.nombre || 'N/A',
            "Cédula": c.cedula || 'N/A',
            "Teléfono": c.telefono || 'N/A'
        }));
        
        if (typeof XLSX !== 'undefined') {
            const hoja = XLSX.utils.json_to_sheet(datosExcel);
            const libro = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(libro, hoja, "Directorio");
            XLSX.writeFile(libro, "Reporte_Afiliados_Cooperativa.xlsx");
        } else {
            alert("Hubo un error al cargar la librería de Excel. Revisa tu conexión a internet.");
        }
    });

    escucharNubeEnTiempoReal();
});