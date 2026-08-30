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

// === HABILITAR PERSISTENCIA OFFLINE ===
db.enablePersistence()
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          console.warn("Múltiples pestañas abiertas, persistencia solo funciona en una.");
      } else if (err.code == 'unimplemented') {
          console.warn("El navegador no soporta persistencia offline.");
      }
  });

// === FUNCIÓN PARA FORMATO DE MILES Y DECIMALES ===
const formatoMoneda = (monto) => {
    return parseFloat(monto || 0).toLocaleString('de-DE', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
};

document.addEventListener('DOMContentLoaded', () => {
    
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
            } else if (destino === 'caja') {
                renderizarCajaYBancos();
            }
        });
    });

    let clientes = [];
    let ingresosTotalesUSD = 0;
    let historialPagos = [];
    
    let efectivoAnteriorBs = 0;
    let historialDepositos = [];

    function escucharNubeEnTiempoReal() {
        db.collection("cooperativa").doc("directorio").onSnapshot((docSnap) => {
            if (docSnap.exists) {
                const data = docSnap.data();
                clientes = data.listaAfiliados || [];
                ingresosTotalesUSD = data.ingresosUSD || 0;
                historialPagos = data.historialPagos || [];
                
                efectivoAnteriorBs = data.efectivoAnteriorBs || 0;
                historialDepositos = data.historialDepositos || [];
                
                actualizarPantalla();
            } else {
                db.collection("cooperativa").doc("directorio").set({
                    listaAfiliados: [],
                    ingresosUSD: 0,
                    historialPagos: [],
                    efectivoAnteriorBs: 0,
                    historialDepositos: []
                });
            }
        }, (error) => console.error("Error Firestore:", error));
    }

    async function guardarNube() {
        await db.collection("cooperativa").doc("directorio").set({
            listaAfiliados: clientes,
            ingresosUSD: ingresosTotalesUSD,
            historialPagos: historialPagos,
            efectivoAnteriorBs: efectivoAnteriorBs,
            historialDepositos: historialDepositos
        });
    }

    const actualizarPantalla = () => {
        const hoy = new Date();
        const inicioDeMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
        let requiereGuardar = false;

        clientes.forEach(c => {
            if (c.estado !== 'revision') {
                if (c.fechaVencimiento < inicioDeMesActual) {
                    if (c.estado !== 'atrasado') {
                        c.estado = 'atrasado';
                        requiereGuardar = true;
                    }
                } else {
                    if (c.estado !== 'aldia') {
                        c.estado = 'aldia';
                        requiereGuardar = true;
                    }
                }
            }
        });

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
            kpiIngresos.innerHTML = `<div style="font-size: 1.8rem; font-weight: 800; color: #1F2937;">${formatoMoneda(ingresosTotalesBsMesActual)} Bs</div>`;
        }

        const kpiRev = document.getElementById('kpi-revisiones');
        const kpiAfi = document.getElementById('kpi-afiliados');
        if (kpiRev) kpiRev.textContent = enRevision.length;
        if (kpiAfi) kpiAfi.textContent = clientes.length;

        renderizarRevisiones(enRevision);
        
        const buscadorAdmin = document.getElementById('buscador-admin-clientes');
        renderizarDirectorio(buscadorAdmin ? buscadorAdmin.value : '');
        renderizarContabilidad();
        renderizarCajaYBancos();
    };

    const renderizarRevisiones = (lista) => {
        const grid = document.getElementById('grid-admin-revisiones');
        if(!grid) return;
        grid.innerHTML = '';
        
        if(lista.length === 0) {
            grid.innerHTML = '<p style="color:#6B7280; grid-column:1/-1;">No hay pagos pendientes por revisar.</p>';
            return;
        }

        // === ORDENAR POR NÚMERO DE FACTURA DE MENOR A MAYOR ===
        const listaOrdenada = [...lista].sort((a, b) => {
            const numA = parseInt(a.numeroFactura) || 0;
            const numB = parseInt(b.numeroFactura) || 0;
            return numA - numB;
        });

        listaOrdenada.forEach(c => {
            const metodoTexto = c.metodoPagoReporte === 'pago_movil' ? 'Pago Móvil' : (c.metodoPagoReporte === 'transferencia' ? 'Transferencia' : 'Efectivo');
            grid.innerHTML += `
                <div class="cliente-card card-revision">
                    <h3 style="margin:0; font-size:1.1rem;">${c.nombre}</h3>
                    <p style="margin:4px 0; font-size:0.85rem; color:#4B5563;">C.I: ${c.cedula} | Monto: <strong style="color:#006412;">$${formatoMoneda(c.montoPendiente)}</strong></p>
                    <p style="margin:2px 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-calendar-check"></i> Pago Realizado: <strong>${c.fechaPagoReal || 'N/A'}</strong></p>
                    <p style="margin:2px 0; font-size:0.8rem; color:#6B7280;"><i class="fa-solid fa-receipt"></i> ${metodoTexto}: <strong>${c.referenciaReporte || 'N/A'}</strong></p>
                    <p style="margin:2px 0; font-size:0.8rem; color:#1F2937;"><i class="fa-solid fa-file-invoice"></i> Factura: <strong>#${c.numeroFactura || 'S/N'}</strong></p>
                    
                    <div style="display:flex; gap:8px; margin-top:10px;">
                        <button class="btn-accion-cliente" onclick="verDetallesPago(${c.id})" style="background:#3B82F6; color:white; border:none; flex:1;"><i class="fa-solid fa-eye"></i> Detalles</button>
                        <button id="btn-aprobar-${c.id}" class="btn-accion-cliente" onclick="aprobarPago(${c.id}, this)" style="background:#006412; color:white; border:none; flex:1;"><i class="fa-solid fa-check"></i> Aprobar</button>
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
        
        const montoFunerario = (c.numeroAsociado == '1974') ? 10 : 5;
        const funerarioUSD = tieneFunerario ? (montoFunerario * meses) : 0;
        const adminUSD = 2 * meses;
        const proteccionUSD = (c.tieneCremacion ? 7 : 2) * meses;
        const ahorrosUSD = Math.max(0, total - funerarioUSD - adminUSD - proteccionUSD);
        
        const html = `
            <p><strong>Cliente:</strong> ${c.nombre}</p>
            <p><strong>Fecha del Pago:</strong> ${c.fechaPagoReal || 'N/A'}</p>
            <p><strong>N° Factura:</strong> ${c.numeroFactura || 'N/A'}</p>
            <p><strong>Meses Pagados:</strong> ${meses}</p>
            <p><strong>Tasa Usada (Manual):</strong> ${formatoMoneda(tasa)} Bs/$</p>
            <p><strong>Aporte Funerario ($${formatoMoneda(montoFunerario)}):</strong> ${tieneFunerario ? 'Sí' : 'No'}</p>
            <p><strong>Incluye Cremación ($7,00):</strong> ${c.tieneCremacion ? 'Sí' : 'No'}</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid #E5E7EB;">
            <p style="color:#3B82F6;"><strong>Aporte Funerario:</strong> ${formatoMoneda(funerarioUSD * tasa)} Bs</p>
            <p style="color:#F59E0B;"><strong>Aporte Admin:</strong> ${formatoMoneda(adminUSD * tasa)} Bs</p>
            <p style="color:#EF4444;"><strong>Protección Social:</strong> ${formatoMoneda(proteccionUSD * tasa)} Bs</p>
            <p style="color:#10B981;"><strong>Ahorros Restante:</strong> ${formatoMoneda(ahorrosUSD * tasa)} Bs</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px solid #E5E7EB;">
            <p style="font-size: 1.05rem; font-weight: bold; color: #006412;">Total Pago: ${formatoMoneda(total * tasa)} Bs</p>
        `;

        document.getElementById('contenido-detalles-modal').innerHTML = html;
        document.getElementById('modal-detalles-pago').style.display = 'flex';
    };

    document.getElementById('cerrar-modal-detalles')?.addEventListener('click', () => {
        document.getElementById('modal-detalles-pago').style.display = 'none';
    });

    window.aprobarPago = async (id, botonElemento) => {
        const index = clientes.findIndex(c => c.id === id);
        if(index > -1) {
            
            const textoOriginal = botonElemento.innerHTML;
            botonElemento.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            botonElemento.disabled = true;

            try {
                const c = clientes[index];
                const montoReportado = parseFloat(c.montoPendiente || 0);
                const meses = parseInt(c.mesesReportados || 1);
                const tasa = c.tasaReporte || 0;

                const tieneFunerario = c.tieneFunerario !== false;
                const montoFunerario = (c.numeroAsociado == '1974') ? 10 : 5;
                
                const funerarioUSD = tieneFunerario ? (montoFunerario * meses) : 0;
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
                    numeroFactura: c.numeroFactura || 'S/N',
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

                await guardarNube();
                
                if (navigator.onLine) {
                    mostrarToast("Pago Aprobado", "Se registró en la contabilidad exitosamente.");
                } else {
                    mostrarToast("⚠️ Aprobado Sin Conexión", "El pago se sincronizará cuando regrese el internet.");
                }

            } catch(error) {
                console.error(error);
                mostrarToast("Error crítico", "No se pudo aprobar el pago.");
                botonElemento.innerHTML = textoOriginal;
                botonElemento.disabled = false;
            }
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

        pagosFiltrados.sort((a, b) => {
            const numA = parseInt(a.numeroFactura) || 0;
            const numB = parseInt(b.numeroFactura) || 0;
            return numA - numB;
        });

        let totFunerarioBs = 0, totAdminBs = 0, totProteccionBs = 0, totAhorrosBs = 0, totGeneralBs = 0;
        let totPMovilBs = 0, totTransfBs = 0, totEfectivoBs = 0;

        tabla.innerHTML = '';

        if (pagosFiltrados.length === 0) {
            tabla.innerHTML = `<tr><td colspan=\"9\" style=\"text-align:center; padding:15px; color:#6B7280;\">No hay pagos registrados en este mes.</td></tr>`;
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
                        <td style="padding: 10px; font-weight:bold; color:#1F2937;">#${p.numeroFactura || 'S/N'}</td>
                        <td style="padding: 10px;"><strong>${p.clienteNombre}</strong><br><span style="font-size:0.75rem; color:#6B7280;">C.I: ${p.cedula}</span></td>
                        <td style="padding: 10px;">${metodoTexto}<br><span style="font-size:0.75rem; color:#6B7280;">Ref: ${p.referencia}</span></td>
                        <td style="padding: 10px; color:#3B82F6;">${formatoMoneda(funBs)} Bs</td>
                        <td style="padding: 10px; color:#F59E0B;">${formatoMoneda(admBs)} Bs</td>
                        <td style="padding: 10px; color:#EF4444;">${formatoMoneda(protBs)} Bs</td>
                        <td style="padding: 10px; color:#10B981;">${formatoMoneda(ahoBs)} Bs</td>
                        <td style="padding: 10px; font-weight:bold; color:#006412; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        ${formatoMoneda(totalBs)} Bs
                        <div style="display: flex; gap: 10px;">
                            <button onclick="abrirModalEditarPago(${p.idPago})" style="background:none; border:none; color:#F59E0B; cursor:pointer; font-size:1.1rem;" title="Editar Pago"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="eliminarPagoHistorial(${p.idPago})" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:1.1rem;" title="Eliminar Pago"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                    </tr>
                `;
            });
        }

        document.getElementById('kpi-cont-total').textContent = `${formatoMoneda(totGeneralBs)} Bs`;
        document.getElementById('kpi-cont-funerario').textContent = `${formatoMoneda(totFunerarioBs)} Bs`;
        document.getElementById('kpi-cont-admin').textContent = `${formatoMoneda(totAdminBs)} Bs`;
        document.getElementById('kpi-cont-proteccion').textContent = `${formatoMoneda(totProteccionBs)} Bs`;
        document.getElementById('kpi-cont-ahorros').textContent = `${formatoMoneda(totAhorrosBs)} Bs`;

        document.getElementById('kpi-cont-pmovil').textContent = `${formatoMoneda(totPMovilBs)} Bs`;
        document.getElementById('kpi-cont-transf').textContent = `${formatoMoneda(totTransfBs)} Bs`;
        document.getElementById('kpi-cont-efectivo').textContent = `${formatoMoneda(totEfectivoBs)} Bs`;
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

    document.getElementById('btn-confirmar-eliminar')?.addEventListener('click', async (e) => {
        if(clienteEliminarId) {
            const btnSubmit = e.target;
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btnSubmit.disabled = true;
            
            try {
                clientes = clientes.filter(c => c.id !== clienteEliminarId);
                await guardarNube();
                if(modalEliminar) modalEliminar.style.display = 'none';
                mostrarToast("Afiliado Eliminado", "El registro ha sido borrado.");
            } catch(error) {
                mostrarToast("Error", "No se pudo borrar el registro.");
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
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
        formCliente.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSubmit = e.target.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
            btnSubmit.disabled = true;

            try {
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

                await guardarNube();

                formCliente.reset();
                document.getElementById('cli-id-editar').value = '';
                document.getElementById('modal-cliente').style.display = 'none';
                document.getElementById('titulo-modal-cliente').innerHTML = '<i class="fa-solid fa-user-plus" style="color: #006412; margin-right: 8px;"></i>Registrar Afiliado';
                
                if(navigator.onLine) {
                    mostrarToast("Afiliado Guardado", "El directorio ha sido actualizado.");
                } else {
                    mostrarToast("⚠️ Guardado Sin Conexión", "Sincronización pendiente con el servidor.");
                }
            } catch (error) {
                mostrarToast("Error", "No se pudo guardar la información.");
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
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

    window.abrirModalEditarPago = (idPago) => {
        const pago = historialPagos.find(p => p.idPago === idPago);
        if(!pago) return;

        const cliente = clientes.find(c => c.cedula === pago.cedula);
        const tieneFunerario = cliente ? (cliente.tieneFunerario !== false) : true;
        const tieneCremacion = cliente ? (cliente.tieneCremacion === true) : false;
        
        const montoFunerario = (cliente && cliente.numeroAsociado == '1974') ? 10 : 5;
        const cuotaMensual = (tieneFunerario ? montoFunerario : 0) + 2 + (tieneCremacion ? 7 : 2) + 1;

        document.getElementById('edit-pago-id').value = pago.idPago;
        document.getElementById('edit-pago-usd').value = pago.montoTotalUSD.toFixed(2);
        document.getElementById('edit-pago-tasa').value = pago.tasaManual || 1;
        document.getElementById('edit-pago-factura').value = pago.numeroFactura || '';
        
        const inputMeses = document.getElementById('edit-pago-meses');
        inputMeses.value = pago.meses || 1;
        inputMeses.setAttribute('data-cuota', cuotaMensual);

        document.getElementById('modal-editar-pago').style.display = 'flex';
    };

    document.getElementById('edit-pago-meses')?.addEventListener('input', (e) => {
        const meses = parseInt(e.target.value) || 1;
        const cuotaBase = parseFloat(e.target.getAttribute('data-cuota')) || 0;
        if (cuotaBase > 0) document.getElementById('edit-pago-usd').value = (cuotaBase * meses).toFixed(2);
    });

    document.getElementById('cerrar-modal-editar-pago')?.addEventListener('click', () => {
        document.getElementById('modal-editar-pago').style.display = 'none';
    });

    document.getElementById('form-editar-pago')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        btnSubmit.disabled = true;

        try {
            const idPago = parseInt(document.getElementById('edit-pago-id').value);
            const nuevoUSD = parseFloat(document.getElementById('edit-pago-usd').value) || 0;
            const nuevaTasa = parseFloat(document.getElementById('edit-pago-tasa').value) || 0;
            const nuevosMeses = parseInt(document.getElementById('edit-pago-meses').value) || 1;
            const nuevaFactura = document.getElementById('edit-pago-factura').value.trim();

            const pagoIndex = historialPagos.findIndex(p => p.idPago === idPago);
            
            if (pagoIndex > -1) {
                const pago = historialPagos[pagoIndex];
                const cliente = clientes.find(c => c.cedula === pago.cedula);
                
                const tieneFunerario = cliente ? (cliente.tieneFunerario !== false) : true;
                const tieneCremacion = cliente ? (cliente.tieneCremacion === true) : false;
                const montoFunerario = (cliente && cliente.numeroAsociado == '1974') ? 10 : 5;
                
                const funerarioUSD = tieneFunerario ? (montoFunerario * nuevosMeses) : 0;
                const adminUSD = 2 * nuevosMeses;
                const proteccionUSD = (tieneCremacion ? 7 : 2) * nuevosMeses;
                const ahorrosUSD = Math.max(0, nuevoUSD - funerarioUSD - adminUSD - proteccionUSD);

                historialPagos[pagoIndex].montoTotalUSD = nuevoUSD;
                historialPagos[pagoIndex].tasaManual = nuevaTasa;
                historialPagos[pagoIndex].meses = nuevosMeses;
                historialPagos[pagoIndex].funerarioUSD = funerarioUSD;
                historialPagos[pagoIndex].adminUSD = adminUSD;
                historialPagos[pagoIndex].proteccionUSD = proteccionUSD;
                historialPagos[pagoIndex].ahorrosUSD = ahorrosUSD;
                historialPagos[pagoIndex].numeroFactura = nuevaFactura;

                await guardarNube();
                document.getElementById('modal-editar-pago').style.display = 'none';
                mostrarToast("Pago Actualizado", "La contabilidad se ha recalculado.");
            }
        } catch(error) {
            mostrarToast("Error", "Ocurrió un problema al editar el pago.");
        } finally {
            btnSubmit.innerHTML = originalText;
            btnSubmit.disabled = false;
        }
    });

    window.eliminarPagoHistorial = async (idPago) => {
        if (confirm("¿Estás seguro de que deseas eliminar este pago? \n\nEsta acción recalculará toda la contabilidad del mes y no se puede deshacer.")) {
            try {
                historialPagos = historialPagos.filter(p => p.idPago !== idPago);
                await guardarNube();
                mostrarToast("Pago Eliminado", "El registro fue borrado exitosamente.");
            } catch(error) {
                mostrarToast("Error", "No se pudo borrar el pago.");
            }
        }
    };

    const renderizarCajaYBancos = () => {
        const vistaCaja = document.getElementById('vista-caja');
        if (!vistaCaja || vistaCaja.style.display === 'none') return;

        const hoyMes = new Date().toISOString().slice(0, 7);
        const pagosDelMes = historialPagos.filter(p => {
            const f = p.fechaPagoReal || p.fechaPagoReporte;
            return f && f.startsWith(hoyMes);
        });

        let totFunerarioBs = 0, totAdminBs = 0, totProteccionBs = 0, totAhorrosBs = 0;
        
        pagosDelMes.forEach(p => {
            const tasa = p.tasaManual || 1;
            totFunerarioBs += (p.funerarioUSD * tasa);
            totAdminBs += (p.adminUSD * tasa);
            totProteccionBs += ((p.proteccionUSD || 0) * tasa);
            totAhorrosBs += (p.ahorrosUSD * tasa);
        });

        document.getElementById('kpi-caja-anterior').textContent = `${formatoMoneda(efectivoAnteriorBs)} Bs`;
        document.getElementById('kpi-caja-ahorro').textContent = `${formatoMoneda(totAhorrosBs)} Bs`;
        document.getElementById('kpi-caja-funerario').textContent = `${formatoMoneda(totFunerarioBs)} Bs`;
        document.getElementById('kpi-caja-admin').textContent = `${formatoMoneda(totAdminBs)} Bs`;
        document.getElementById('kpi-caja-proteccion').textContent = `${formatoMoneda(totProteccionBs)} Bs`;

        const granTotal = efectivoAnteriorBs + totFunerarioBs + totAdminBs + totProteccionBs + totAhorrosBs;
        document.getElementById('kpi-caja-gran-total').textContent = `${formatoMoneda(granTotal)} Bs`;

        let sumaDepositos = 0;
        historialDepositos.forEach(dep => {
            sumaDepositos += parseFloat(dep.monto);
        });
        const totalDepositado = efectivoAnteriorBs + sumaDepositos;
        document.getElementById('kpi-caja-total-depositado').textContent = `${formatoMoneda(totalDepositado)} Bs`;

        const tablaDepositos = document.getElementById('tabla-historial-depositos');
        tablaDepositos.innerHTML = '';
        
        const depositosOrdenados = [...historialDepositos].sort((a, b) => b.id - a.id);
        
        if (depositosOrdenados.length === 0) {
            tablaDepositos.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#6B7280;">Aún no has registrado depósitos.</td></tr>`;
        } else {
            depositosOrdenados.forEach(dep => {
                const f = new Date(dep.id);
                const fechaMostrar = dep.fecha || f.toLocaleDateString('es-ES'); 

                tablaDepositos.innerHTML += `
                    <tr style="border-bottom: 1px solid #F3F4F6;">
                        <td style="padding: 10px; font-weight:bold; color:#10B981;">${fechaMostrar}</td>
                        <td style="padding: 10px; color:#4B5563;">${dep.referencia}</td>
                        <td style="padding: 10px; font-weight:bold; color:#1F2937;">${formatoMoneda(dep.monto)} Bs</td>
                        <td style="padding: 10px; text-align: right;">
                            <button onclick="eliminarDeposito(${dep.id})" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:1.1rem;" title="Eliminar Depósito"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        }
    };
    
    window.abrirModalSaldoAnterior = () => {
        document.getElementById('input-saldo-anterior').value = efectivoAnteriorBs.toFixed(2);
        document.getElementById('modal-saldo-anterior').style.display = 'flex';
    };

    document.getElementById('cerrar-modal-saldo')?.addEventListener('click', () => {
        document.getElementById('modal-saldo-anterior').style.display = 'none';
    });

    document.getElementById('form-saldo-anterior')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        btnSubmit.disabled = true;

        try {
            efectivoAnteriorBs = parseFloat(document.getElementById('input-saldo-anterior').value) || 0;
            await guardarNube();
            document.getElementById('modal-saldo-anterior').style.display = 'none';
            mostrarToast("Saldo Actualizado", "El balance inicial ha sido modificado.");
        } catch (error) {
            mostrarToast("Error", "No se pudo actualizar el saldo.");
        } finally {
            btnSubmit.innerHTML = originalText;
            btnSubmit.disabled = false;
        }
    });

    window.abrirModalDeposito = () => {
        document.getElementById('form-deposito').reset();
        document.getElementById('deposito-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('modal-deposito').style.display = 'flex';
    };

    document.getElementById('cerrar-modal-deposito')?.addEventListener('click', () => {
        document.getElementById('modal-deposito').style.display = 'none';
    });

    document.getElementById('form-deposito')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btnSubmit = e.target.querySelector('button[type="submit"]');
        const originalText = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
        btnSubmit.disabled = true;

        try {
            const nuevoDeposito = {
                id: Date.now(),
                fecha: document.getElementById('deposito-fecha').value,
                monto: parseFloat(document.getElementById('deposito-monto').value) || 0,
                referencia: document.getElementById('deposito-ref').value.trim()
            };

            historialDepositos.push(nuevoDeposito);
            await guardarNube();
            
            document.getElementById('modal-deposito').style.display = 'none';
            mostrarToast("Depósito Registrado", "El depósito se añadió al historial exitosamente.");
        } catch (error) {
            mostrarToast("Error", "No se pudo registrar el depósito.");
        } finally {
            btnSubmit.innerHTML = originalText;
            btnSubmit.disabled = false;
        }
    });

    window.eliminarDeposito = async (id) => {
        if (confirm("¿Estás seguro de que deseas eliminar este depósito? Se recalculará tu saldo total depositado.")) {
            try {
                historialDepositos = historialDepositos.filter(d => d.id !== id);
                await guardarNube();
                mostrarToast("Depósito Eliminado", "El registro fue borrado exitosamente.");
            } catch(error) {
                mostrarToast("Error", "No se pudo borrar el depósito.");
            }
        }
    };

    escucharNubeEnTiempoReal();
});