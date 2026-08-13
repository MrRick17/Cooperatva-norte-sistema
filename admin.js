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
        
        // CALCULAR EL TOTAL EN BOLÍVARES EXCLUSIVAMENTE DEL MES ACTUAL PARA EL DASHBOARD
        const hoyMes = new Date().toISOString().slice(0, 7); // Formato YYYY-MM
        let ingresosTotalesBsMesActual = 0;

        historialPagos.forEach(p => {
            const fechaPago = p.fechaPagoReal || p.fechaPagoReporte;
            if (fechaPago && fechaPago.startsWith(hoyMes)) {
                const tasa = p.tasaManual || 1;
                ingresosTotalesBsMesActual += (p.montoTotalUSD * tasa);
            }
        });
        
        const kpiIngresos = document.getElementById('kpi-ingresos');
        if (kpiIngresos) {
            kpiIngresos.innerHTML = `<div style="font-size: 1.8rem; font-weight: 800; color: #1F2937;">${ingresosTotalesBsMesActual.toFixed(2)} Bs</div>`;
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
                    <p style="margin:2px 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-calendar-check"></i> Pago Realizado: <strong>${c.fechaPagoReal || 'N/A'}</strong></p>
                    <p style="margin:2px 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-ticket"></i> Reportado el: <strong>${c.fechaPagoReporte || 'N/A'}</strong></p>
                    <p style="margin:2px 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-receipt"></i> ${metodoTexto}: <strong>${c.referenciaReporte || 'N/A'}</strong></p>
                    
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="btn-accion-cliente" onclick="verDetallesPago(${c.id})" style="background:#3B82F6; color:white; border:none; flex:1;"><i class="fa-solid fa-eye"></i> Detalles</button>
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
        const tasa = c.tasaReporte || 0;

        const funerarioUSD = 5 * meses;
        const adminUSD = 2 * meses;
        const proteccionUSD = (c.tieneCremacion ? 7 : 2) * meses;
        const ahorrosUSD = Math.max(0, total - funerarioUSD - adminUSD - proteccionUSD);

        const html = `
            <p><strong>Cliente:</strong> ${c.nombre}</p>
            <p><strong>Fecha Pago Real:</strong> ${c.fechaPagoReal || 'N/A'}</p>
            <p><strong>Fecha de Ticket:</strong> ${c.fechaPagoReporte || 'N/A'}</p>
            <p><strong>Meses Pagados:</strong> ${meses}</p>
            <p><strong>Tasa Usada (Manual):</strong> ${tasa.toFixed(2)} Bs/$</p>
            <p><strong>Incluye Cremación:</strong> ${c.tieneCremacion ? 'Sí' : 'No'}</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid #E5E7EB;">
            <p style="color:#3B82F6;"><strong>Aporte Funerario:</strong> ${(funerarioUSD * tasa).toFixed(2)} Bs</p>
            <p style="color:#F59E0B;"><strong>Aporte Admin:</strong> ${(adminUSD * tasa).toFixed(2)} Bs</p>
            <p style="color:#EF4444;"><strong>Protección Social:</strong> ${(proteccionUSD * tasa).toFixed(2)} Bs</p>
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
            const tasa = c.tasaReporte || 0;

            const funerarioUSD = 5 * meses;
            const adminUSD = 2 * meses;
            const proteccionUSD = (c.tieneCremacion ? 7 : 2) * meses;
            const ahorrosUSD = Math.max(0, montoReportado - funerarioUSD - adminUSD - proteccionUSD);

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
                fechaPagoReporte: c.fechaPagoReporte || new Date().toISOString().split('T')[0],
                fechaPagoReal: c.fechaPagoReal || c.fechaPagoReporte || new Date().toISOString().split('T')[0],
                meses: meses,
                metodo: c.metodoPagoReporte || 'efectivo',
                referencia: c.referenciaReporte || 'N/A',
                montoTotalUSD: montoReportado,
                funerarioUSD: funerarioUSD,
                adminUSD: adminUSD,
                proteccionUSD: proteccionUSD,
                ahorrosUSD: ahorrosUSD,
                tasaManual: tasa
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
            if (p.fechaPagoReal) mesesSet.add(p.fechaPagoReal.slice(0, 7));
            else if (p.fechaPagoReporte) mesesSet.add(p.fechaPagoReporte.slice(0, 7));
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
        const pagosFiltrados = historialPagos.filter(p => {
            const f = p.fechaPagoReal || p.fechaPagoReporte;
            return f && f.startsWith(mesSeleccionado);
        });

        let totFunerarioBs = 0, totAdminBs = 0, totProteccionBs = 0, totAhorrosBs = 0, totGeneralBs = 0;
        let totPMovilBs = 0, totTransfBs = 0, totEfectivoBs = 0; // NUEVAS VARIABLES

        tabla.innerHTML = '';

        if (pagosFiltrados.length === 0) {
            tabla.innerHTML = `<tr><td colspan=\"8\" style=\"text-align:center; padding:15px; color:#6B7280;\">No hay pagos registrados en este mes.</td></tr>`;
        } else {
            pagosFiltrados.forEach(p => {
                const tasa = p.tasaManual || 1; 
                
                const funBs = p.funerarioUSD * tasa;
                const admBs = p.adminUSD * tasa;
                const protBs = (p.proteccionUSD || 0) * tasa;
                const ahoBs = p.ahorrosUSD * tasa;
                const totalBs = p.montoTotalUSD * tasa;

                totFunerarioBs += funBs;
                totAdminBs += admBs;
                totProteccionBs += protBs;
                totAhorrosBs += ahoBs;
                totGeneralBs += totalBs;

                // LÓGICA DE SUMA POR MÉTODO DE PAGO
                if (p.metodo === 'pago_movil') totPMovilBs += totalBs;
                else if (p.metodo === 'transferencia') totTransfBs += totalBs;
                else if (p.metodo === 'efectivo') totEfectivoBs += totalBs;

                const metodoTexto = p.metodo === 'pago_movil' ? 'Pago Móvil' : (p.metodo === 'transferencia' ? 'Transferencia' : 'Efectivo');

                tabla.innerHTML += `
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                        <td style="padding: 10px;">
                            <div style="font-weight:bold; color:#10B981;">P: ${p.fechaPagoReal || '-'}</div>
                            <div style="font-size:0.75rem; color:#6B7280;">T: ${p.fechaPagoReporte || '-'}</div>
                        </td>
                        <td style="padding: 10px;"><strong>${p.clienteNombre}</strong><br><span style="font-size:0.75rem; color:#6B7280;">C.I: ${p.cedula}</span></td>
                        <td style="padding: 10px;">${metodoTexto}<br><span style="font-size:0.75rem; color:#6B7280;">Ref: ${p.referencia}</span></td>
                        <td style="padding: 10px; color:#3B82F6;">${funBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#F59E0B;">${admBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#EF4444;">${protBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#10B981;">${ahoBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; font-weight:bold; color:#006412;">${totalBs.toFixed(2)} Bs</td>
                    </tr>
                `;
            });
        }

        // ACTUALIZACIÓN DE DOM DE FONDOS
        document.getElementById('kpi-cont-total').textContent = `${totGeneralBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-funerario').textContent = `${totFunerarioBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-admin').textContent = `${totAdminBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-proteccion').textContent = `${totProteccionBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-ahorros').textContent = `${totAhorrosBs.toFixed(2)} Bs`;

        // ACTUALIZACIÓN DE DOM DE MÉTODOS DE PAGO
        document.getElementById('kpi-cont-pmovil').textContent = `${totPMovilBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-transf').textContent = `${totTransfBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-efectivo').textContent = `${totEfectivoBs.toFixed(2)} Bs`;
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
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">N° Asociado: <strong>${c.numeroAsociado || 'N/A'}</strong> | C.I: ${c.cedula}</p>
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-phone" style="font-size:0.75rem;"></i> ${c.telefono || 'N/A'} | Registro Funerario: <strong>${c.contrato || 'N/A'}</strong></p>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge ${badgeClass}">${estadoTexto}</span>
                            <button onclick="editarCliente(${c.id})" style="background:none; border:none; color:#3B82F6; cursor:pointer;" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="confirmarEliminar(${c.id})" style="background:none; border:none; color:#EF4444; cursor:pointer;" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
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
        document.getElementById('cli-id-editar').value = '';
        document.getElementById('titulo-modal-cliente').innerHTML = '<i class="fa-solid fa-user-plus" style="color: #006412; margin-right: 8px;"></i>Registrar Afiliado';
        
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

    window.editarCliente = (id) => {
        const c = clientes.find(item => item.id === id);
        if(!c) return;

        document.getElementById('cli-id-editar').value = c.id;
        document.getElementById('cli-nombre').value = c.nombre || '';
        document.getElementById('cli-cedula').value = c.cedula || '';
        document.getElementById('cli-asociado').value = c.numeroAsociado || '';
        document.getElementById('cli-contrato').value = c.contrato || '';
        document.getElementById('cli-telefono').value = c.telefono || '';
        document.getElementById('cli-cremacion').value = c.tieneCremacion ? 'si' : 'no';
        
        const f = new Date(c.fechaVencimiento);
        const mesFormateado = String(f.getMonth() + 1).padStart(2, '0');
        const diaFormateado = String(f.getDate()).padStart(2, '0');
        document.getElementById('cli-vence').value = `${f.getFullYear()}-${mesFormateado}-${diaFormateado}`;
        
        document.getElementById('titulo-modal-cliente').innerHTML = '<i class="fa-solid fa-user-pen" style="color: #006412; margin-right: 8px;"></i>Editar Afiliado';
        document.getElementById('modal-cliente').style.display = 'flex';
    };

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

            const editId = document.getElementById('cli-id-editar').value;

            if (editId) {
                const idx = clientes.findIndex(c => c.id == editId);
                if (idx > -1) {
                    clientes[idx].nombre = document.getElementById('cli-nombre').value.trim();
                    clientes[idx].cedula = document.getElementById('cli-cedula').value.trim();
                    clientes[idx].numeroAsociado = document.getElementById('cli-asociado').value.trim();
                    clientes[idx].contrato = document.getElementById('cli-contrato').value.trim();
                    clientes[idx].telefono = document.getElementById('cli-telefono').value.trim();
                    clientes[idx].tieneCremacion = document.getElementById('cli-cremacion').value === 'si';
                    clientes[idx].fechaVencimiento = timestampVencimiento;
                }
            } else {
                clientes.push({
                    id: Date.now(),
                    nombre: document.getElementById('cli-nombre').value.trim(),
                    cedula: document.getElementById('cli-cedula').value.trim(),
                    numeroAsociado: document.getElementById('cli-asociado').value.trim(),
                    contrato: document.getElementById('cli-contrato').value.trim(),
                    telefono: document.getElementById('cli-telefono').value.trim(),
                    tieneCremacion: document.getElementById('cli-cremacion').value === 'si',
                    fechaVencimiento: timestampVencimiento,
                    estado: 'aldia',
                    montoPendiente: 0
                });
            }

            formCliente.reset();
            document.getElementById('cli-id-editar').value = '';
            document.getElementById('modal-cliente').style.display = 'none';
            document.getElementById('titulo-modal-cliente').innerHTML = '<i class="fa-solid fa-user-plus" style="color: #006412; margin-right: 8px;"></i>Registrar Afiliado';
            guardarNube();
        });
    }

    document.getElementById('btn-exportar-excel')?.addEventListener('click', () => {
        if (clientes.length === 0) return alert('No hay afiliados para exportar.');
        
        const datosExcel = clientes.map(c => ({
            "N° Asociado": c.numeroAsociado || 'N/A',
            "Registro Funerario": c.contrato || 'N/A',
            "Nombre": c.nombre || 'N/A',
            "Cédula": c.cedula || 'N/A',
            "Teléfono": c.telefono || 'N/A',
            "Cremación": c.tieneCremacion ? 'Sí' : 'No'
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