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
    
    // === FUNCIÓN PARA MOSTRAR LA NOTIFICACIÓN ELEGANTE ===
    window.mostrarToast = (titulo, mensaje) => {
        const toast = document.getElementById('toast-notificacion');
        if(!toast) return;
        document.getElementById('toast-titulo').textContent = titulo;
        document.getElementById('toast-mensaje').textContent = mensaje;
        toast.classList.add('mostrar');
        setTimeout(() => toast.classList.remove('mostrar'), 4000);
    };

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

        const enRevision = clientes.filter(c => c.estado === 'revision');
        
        const hoyMes = new Date().toISOString().slice(0, 7); 
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
        
        const buscadorAdmin = document.getElementById('buscador-admin-clientes');
        renderizarDirectorio(buscadorAdmin ? buscadorAdmin.value : '');
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

        const tieneFunerario = c.tieneFunerario !== false; 
        const funerarioUSD = tieneFunerario ? (5 * meses) : 0;
        const adminUSD = 2 * meses;
        const proteccionUSD = (c.tieneCremacion ? 7 : 2) * meses;
        const ahorrosUSD = Math.max(0, total - funerarioUSD - adminUSD - proteccionUSD);

        const html = `
            <p><strong>Cliente:</strong> ${c.nombre}</p>
            <p><strong>Fecha del Pago:</strong> ${c.fechaPagoReal || 'N/A'}</p>
            <p><strong>Meses Pagados:</strong> ${meses}</p>
            <p><strong>Tasa Usada (Manual):</strong> ${tasa.toFixed(2)} Bs/$</p>
            <p><strong>Aporte Funerario ($5):</strong> ${tieneFunerario ? 'Sí' : 'No'}</p>
            <p><strong>Incluye Cremación ($7):</strong> ${c.tieneCremacion ? 'Sí' : 'No'}</p>
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

            const tieneFunerario = c.tieneFunerario !== false;
            const funerarioUSD = tieneFunerario ? (5 * meses) : 0;
            const adminUSD = 2 * meses;
            const proteccionUSD = (c.tieneCremacion ? 7 : 2) * meses;
            const ahorrosUSD = Math.max(0, montoReportado - funerarioUSD - adminUSD - proteccionUSD);

            ingresosTotalesUSD += montoReportado;
            c.montoAprobadoHistorial = (c.montoAprobadoHistorial || 0) + montoReportado;
            c.estado = 'aldia';
            c.montoPendiente = 0;
            
            let baseTime = c.fechaVencimiento || Date.now();
            c.fechaVencimiento = baseTime + (meses * 28 * 24 * 60 * 60 * 1000);

            historialPagos.push({
                idPago: Date.now(),
                clienteNombre: c.nombre,
                cedula: c.cedula,
                fechaPagoReporte: c.fechaPagoReal || c.fechaPagoReporte || new Date().toISOString().split('T')[0],
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
            mostrarToast("Pago Aprobado", "Se registró en la contabilidad exitosamente.");
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
        let totPMovilBs = 0, totTransfBs = 0, totEfectivoBs = 0;

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

                if (p.metodo === 'pago_movil') totPMovilBs += totalBs;
                else if (p.metodo === 'transferencia') totTransfBs += totalBs;
                else if (p.metodo === 'efectivo') totEfectivoBs += totalBs;

                const metodoTexto = p.metodo === 'pago_movil' ? 'Pago Móvil' : (p.metodo === 'transferencia' ? 'Transferencia' : 'Efectivo');

                tabla.innerHTML += `
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                        <td style="padding: 10px; font-weight:bold; color:#10B981;">${p.fechaPagoReal || '-'}</td>
                        <td style="padding: 10px;"><strong>${p.clienteNombre}</strong><br><span style="font-size:0.75rem; color:#6B7280;">C.I: ${p.cedula}</span></td>
                        <td style="padding: 10px;">${metodoTexto}<br><span style="font-size:0.75rem; color:#6B7280;">Ref: ${p.referencia}</span></td>
                        <td style="padding: 10px; color:#3B82F6;">${funBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#F59E0B;">${admBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#EF4444;">${protBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; color:#10B981;">${ahoBs.toFixed(2)} Bs</td>
                        <td style="padding: 10px; font-weight:bold; color:#006412; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        ${totalBs.toFixed(2)} Bs
                        <div style="display: flex; gap: 10px;">
                            <button onclick="abrirModalEditarPago(${p.idPago})" style="background:none; border:none; color:#F59E0B; cursor:pointer; font-size:1.1rem;" title="Editar Pago"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="eliminarPagoHistorial(${p.idPago})" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:1.1rem;" title="Eliminar Pago"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                    </tr>
                `;
            });
        }

        document.getElementById('kpi-cont-total').textContent = `${totGeneralBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-funerario').textContent = `${totFunerarioBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-admin').textContent = `${totAdminBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-proteccion').textContent = `${totProteccionBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-ahorros').textContent = `${totAhorrosBs.toFixed(2)} Bs`;

        document.getElementById('kpi-cont-pmovil').textContent = `${totPMovilBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-transf').textContent = `${totTransfBs.toFixed(2)} Bs`;
        document.getElementById('kpi-cont-efectivo').textContent = `${totEfectivoBs.toFixed(2)} Bs`;
    };

    document.getElementById('filtro-mes-contabilidad')?.addEventListener('change', renderizarContabilidad);

    const renderizarDirectorio = (filtro = '') => {
        const grid = document.getElementById('grid-admin-clientes');
        if(!grid) return;
        grid.innerHTML = '';
        
        const filtrados = clientes.filter(c => 
            (c.nombre && c.nombre.toLowerCase().includes(filtro.toLowerCase())) || 
            (c.cedula && c.cedula.toLowerCase().includes(filtro.toLowerCase()))
        );

        if(filtrados.length === 0) {
            grid.innerHTML = '<p style="color:#6B7280; grid-column:1/-1;">No hay afiliados.</p>';
            return;
        }

        filtrados.forEach(c => {
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

    document.getElementById('buscador-admin-clientes')?.addEventListener('input', (e) => {
        renderizarDirectorio(e.target.value);
    });

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
            mostrarToast("Afiliado Eliminado", "El registro ha sido borrado.");
        }
    });

    const formCliente = document.getElementById('form-cliente');
    document.getElementById('btn-agregar-cliente')?.addEventListener('click', () => {
        if(formCliente) formCliente.reset();
        document.getElementById('cli-id-editar').value = '';
        document.getElementById('cli-funerario').value = 'si';
        document.getElementById('cli-cremacion').value = 'no';
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
        document.getElementById('cli-funerario').value = (c.tieneFunerario !== false) ? 'si' : 'no';
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
                    clientes[idx].tieneFunerario = document.getElementById('cli-funerario').value === 'si';
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
                    tieneFunerario: document.getElementById('cli-funerario').value === 'si',
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
            mostrarToast("Afiliado Guardado", "El directorio ha sido actualizado.");
        });
    }

    document.getElementById('btn-exportar-excel')?.addEventListener('click', () => {
        if (clientes.length === 0) return mostrarToast("Atención", "No hay afiliados para exportar.");
        
        const datosExcel = clientes.map(c => ({
            "N° Asociado": c.numeroAsociado || 'N/A',
            "Registro Funerario": c.contrato || 'N/A',
            "Nombre": c.nombre || 'N/A',
            "Cédula": c.cedula || 'N/A',
            "Teléfono": c.telefono || 'N/A',
            "Aporte Funerario": (c.tieneFunerario !== false) ? 'Sí' : 'No',
            "Cremación": c.tieneCremacion ? 'Sí' : 'No',
            "Vencimiento (Pago hasta)": c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString('es-ES') : 'N/A'
        }));
        
        if (typeof XLSX !== 'undefined') {
            const hoja = XLSX.utils.json_to_sheet(datosExcel);
            const libro = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(libro, hoja, "Directorio");
            XLSX.writeFile(libro, "Reporte_Afiliados_Cooperativa.xlsx");
        } else {
            mostrarToast("Error", "No se pudo cargar la librería Excel.");
        }
    });

    // === LÓGICA PARA EDITAR UN PAGO DEL HISTORIAL ===
    window.abrirModalEditarPago = (idPago) => {
        const pago = historialPagos.find(p => p.idPago === idPago);
        if(!pago) return;

        document.getElementById('edit-pago-id').value = pago.idPago;
        document.getElementById('edit-pago-usd').value = pago.montoTotalUSD;
        document.getElementById('edit-pago-tasa').value = pago.tasaManual || 1;
        document.getElementById('edit-pago-meses').value = pago.meses || 1;

        document.getElementById('modal-editar-pago').style.display = 'flex';
    };

    document.getElementById('cerrar-modal-editar-pago')?.addEventListener('click', () => {
        document.getElementById('modal-editar-pago').style.display = 'none';
    });

    document.getElementById('form-editar-pago')?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const idPago = parseInt(document.getElementById('edit-pago-id').value);
        const nuevoUSD = parseFloat(document.getElementById('edit-pago-usd').value) || 0;
        const nuevaTasa = parseFloat(document.getElementById('edit-pago-tasa').value) || 0;
        const nuevosMeses = parseInt(document.getElementById('edit-pago-meses').value) || 1;

        const pagoIndex = historialPagos.findIndex(p => p.idPago === idPago);
        
        if (pagoIndex > -1) {
            const pago = historialPagos[pagoIndex];
            
            // 1. Buscamos al cliente original para saber qué planes tiene activos
            const cliente = clientes.find(c => c.cedula === pago.cedula);
            const tieneFunerario = cliente ? (cliente.tieneFunerario !== false) : true;
            const tieneCremacion = cliente ? (cliente.tieneCremacion === true) : false;

            // 2. Ejecutamos la matemática exacta de la cooperativa
            const funerarioUSD = tieneFunerario ? (5 * nuevosMeses) : 0;
            const adminUSD = 2 * nuevosMeses;
            const proteccionUSD = (tieneCremacion ? 7 : 2) * nuevosMeses;
            
            // Los ahorros son todo lo que sobra después de los descuentos
            const ahorrosUSD = Math.max(0, nuevoUSD - funerarioUSD - adminUSD - proteccionUSD);

            // 3. Reemplazamos los valores en el historial
            historialPagos[pagoIndex].montoTotalUSD = nuevoUSD;
            historialPagos[pagoIndex].tasaManual = nuevaTasa;
            historialPagos[pagoIndex].meses = nuevosMeses;
            historialPagos[pagoIndex].funerarioUSD = funerarioUSD;
            historialPagos[pagoIndex].adminUSD = adminUSD;
            historialPagos[pagoIndex].proteccionUSD = proteccionUSD;
            historialPagos[pagoIndex].ahorrosUSD = ahorrosUSD;

            // 4. Guardamos y refrescamos la vista
            guardarNube();
            document.getElementById('modal-editar-pago').style.display = 'none';
            mostrarToast("Pago Actualizado", "La contabilidad se ha recalculado.");
        }
    });

    // === LÓGICA PARA ELIMINAR UN PAGO DEL HISTORIAL ===
    window.eliminarPagoHistorial = (idPago) => {
        // Mostramos una alerta de confirmación nativa para evitar accidentes
        if (confirm("¿Estás seguro de que deseas eliminar este pago? \n\nEsta acción recalculará toda la contabilidad del mes y no se puede deshacer.")) {
            
            // Filtramos el arreglo para dejar por fuera el pago seleccionado
            historialPagos = historialPagos.filter(p => p.idPago !== idPago);
            
            // Subimos el cambio a la nube (esto actualiza las gráficas automáticamente)
            guardarNube();
            mostrarToast("Pago Eliminado", "El registro fue borrado exitosamente.");
        }
    };

    escucharNubeEnTiempoReal();
});