document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. MODO PRUEBA LOCAL (PROTECCIÓN DE DATOS)
    // ==========================================
    const MODO_PRUEBA = false; 

    // ==========================================
    // 1. INICIALIZACIÓN DE FIREBASE
    // ==========================================
    const firebaseConfig = {
        apiKey: "AIzaSyD88uuqPYel-IcCqN_ytZx9xbJ2RG7WkQM",
        authDomain: "streaming-mundial.firebaseapp.com",
        projectId: "streaming-mundial",
        storageBucket: "streaming-mundial.firebasestorage.app",
        messagingSenderId: "286156726345",
        appId: "1:286156726345:web:3306c87cba9ecfb7395f98"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();

    // Estado global en memoria
    let cuentas = [];
    let clientes = [];
    let historialPagos = [];
    let costosProveedores = {};

    // ==========================================
    // 2. SISTEMA DE NOTIFICACIONES (TOAST)
    // ==========================================
    const mostrarNotificacion = (mensaje, tipo = 'success') => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast--${tipo}`; 
        const icono = tipo === 'success' ? 'fa-circle-check' : (tipo === 'info' ? 'fa-circle-info' : 'fa-bell');
        toast.innerHTML = `<i class="fa-solid ${icono}"></i> ${mensaje}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast--hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    const toggleModal = (modalId, show) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            if (show) modal.classList.remove('modal-oculto'); 
            else modal.classList.add('modal-oculto'); 
        }
    };

    // ==========================================
    // 3. NAVEGACIÓN ENTRE VISTAS (SPA)
    // ==========================================
    const navItems = document.querySelectorAll('.nav-item');
    const vistas = document.querySelectorAll('.vista-seccion');

    if (navItems.length > 0 && vistas.length > 0) {
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault(); 
                const destino = item.getAttribute('data-vista');
                if (!destino) return;

                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');

                vistas.forEach(vista => vista.classList.add('vista-oculta'));
                
                const vistaAMostrar = document.getElementById(`vista-${destino}`);
                if (vistaAMostrar) vistaAMostrar.classList.remove('vista-oculta');
            });
        });
    }

    // ==========================================
    // 4. SINCRONIZACIÓN CON FIREBASE O LOCAL
    // ==========================================
    const guardarNube = () => {
        if (MODO_PRUEBA) {
            console.log("💻 MODO PRUEBA ACTIVO: Guardando en LocalStorage, no en Firebase.");
            localStorage.setItem('streamingMundialData', JSON.stringify({ cuentas, clientes, historialPagos, costosProveedores }));
            return;
        }

        db.collection('sistema').doc('datosPrincipales').set({
            cuentas: cuentas,
            clientes: clientes,
            historialPagos: historialPagos,
            costosProveedores: costosProveedores
        }).catch(error => {
            console.error("Error al guardar en Firebase:", error);
            mostrarNotificacion("Error de conexión con la base de datos", "info");
        });
    };

    const escucharNubeEnTiempoReal = () => {
        if (MODO_PRUEBA) {
            console.log("💻 MODO PRUEBA ACTIVO: Leyendo de LocalStorage.");
            const localData = JSON.parse(localStorage.getItem('streamingMundialData'));
            if (localData) {
                cuentas = localData.cuentas || [];
                clientes = localData.clientes || [];
                historialPagos = localData.historialPagos || [];
                costosProveedores = localData.costosProveedores || {};
            }
            actualizarDashboard();
            renderizarCuentas();
            renderizarClientes('todos');
            renderizarVistaCostos();
            return;
        }

        db.collection('sistema').doc('datosPrincipales').onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                cuentas = data.cuentas || [];
                clientes = data.clientes || [];
                historialPagos = data.historialPagos || [];
                costosProveedores = data.costosProveedores || {};
            }
            actualizarDashboard();
            renderizarCuentas();
            renderizarClientes('todos');
            renderizarVistaCostos();
        }, (error) => {
            console.error("Error al escuchar Firebase:", error);
        });
    };

    // ==========================================
    // 5. REGISTRO EN HISTORIAL CONTABLE
    // ==========================================
    const registrarTransaccionHistorial = (monto, plataforma, clienteId) => {
        const fechaActual = new Date();
        const mesStr = `${fechaActual.getFullYear()}-${String(fechaActual.getMonth() + 1).padStart(2, '0')}`;
        
        historialPagos.push({
            id: Date.now(),
            clienteId: clienteId,
            monto: parseFloat(monto) || 0,
            plataforma: plataforma,
            fecha: fechaActual.getTime(),
            mes: mesStr
        });
        guardarNube();
    };

    // ==========================================
    // 6. VERIFICACIÓN DE VENCIMIENTOS
    // ==========================================
    const verificarVencimientosClientes = () => {
        const hoy = new Date();
        const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
        const hoyFin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999).getTime();

        let actualizado = false;
        clientes.forEach(c => {
            let nuevoEstado = 'aldia';
            if (c.fechaVencimiento < hoyInicio) nuevoEstado = 'moroso';
            else if (c.fechaVencimiento >= hoyInicio && c.fechaVencimiento <= hoyFin) nuevoEstado = 'vence-hoy';

            if (c.estado !== nuevoEstado) {
                c.estado = nuevoEstado;
                actualizado = true;
            }
        });
        if (actualizado) guardarNube();
    };

    const verificarVencimientosCuentas = () => {
        const hoy = new Date();
        const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
        const limiteAviso = hoyInicio + (2 * 24 * 60 * 60 * 1000); // 2 días de aviso

        let actualizado = false;
        cuentas.forEach(c => {
            if (!c.fechaVencimiento) return; 

            let nuevoEstado = 'aldia';
            if (c.fechaVencimiento < hoyInicio) nuevoEstado = 'vencida';
            else if (c.fechaVencimiento <= limiteAviso) nuevoEstado = 'por-vencer';

            if (c.estado !== nuevoEstado) {
                c.estado = nuevoEstado;
                actualizado = true;
            }
        });
        if (actualizado) guardarNube();
    };

    // ==========================================
    // 7. RENDERIZADO DE TARJETAS DE CLIENTE
    // ==========================================
    const generarHTMLTarjetaCliente = (c) => {
        const esMoroso = c.estado === 'moroso';
        const esHoy = c.estado === 'vence-hoy';
        const iniciales = c.nombre ? c.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'CL';

        let bgGradient = 'gradient-aldia';
        let badgeTexto = 'Al Día';
        let badgeClase = 'badge-aldia';
        let avatarColor = '#10B981';

        if (esMoroso) {
            bgGradient = 'gradient-atrasado'; badgeTexto = 'Atrasado'; badgeClase = 'badge-vencida'; avatarColor = '#EF4444';
        } else if (esHoy) {
            bgGradient = 'gradient-vence-hoy'; badgeTexto = 'Vence Hoy'; badgeClase = 'badge-vencida'; avatarColor = '#F59E0B';
        }

        let icon = 'fa-solid fa-play'; let col = '#E50914';
        if (c.servicioPlataforma === 'Spotify') { icon = 'fa-brands fa-spotify'; col = '#1DB954'; }
        else if (c.servicioPlataforma === 'Max') { icon = 'fa-solid fa-tv'; col = '#002BE7'; }
        else if (c.servicioPlataforma === 'Disney+') { icon = 'fa-solid fa-star'; col = '#113CCF'; }
        else if (c.servicioPlataforma === 'Crunchyroll') { icon = 'fa-solid fa-fire'; col = '#F47521'; }
        else if (c.servicioPlataforma === 'YouTube Premium') { icon = 'fa-brands fa-youtube'; col = '#FF0000'; }
        else if (c.servicioPlataforma === 'Canva') { icon = 'fa-solid fa-palette'; col = '#7D2AE8'; }
        else if (c.servicioPlataforma === 'CapCut') { icon = 'fa-solid fa-video'; col = '#00F2FE'; }
        else if (c.servicioPlataforma === 'Amazon Prime') { icon = 'fa-brands fa-amazon'; col = '#00A8E1'; }
        else if (c.servicioPlataforma === 'IPTV') { icon = 'fa-solid fa-satellite-dish'; col = '#14B8A6'; }

        let fechaTexto = 'Sin Fecha';
        if (c.fechaVencimiento) {
            const f = new Date(c.fechaVencimiento);
            fechaTexto = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
        }

        const correoAMostrar = c.servicioPlataforma === 'Spotify' && c.correoPersonal ? c.correoPersonal : c.servicioCorreo;

        return `
            <div class="cliente-card ${bgGradient}">
                <div class="cliente-card__header" style="border-bottom-color: rgba(0,0,0,0.05);">
                    <div class="cliente-meta">
                        <div class="cliente-avatar" style="background-color: ${avatarColor};">${iniciales}</div>
                        <div>
                            <h3>${c.nombre}</h3>
                            <span class="badge ${badgeClase}" ${esHoy ? 'style="background: rgba(245,158,11,0.2); color: #F59E0B;"' : ''}>${badgeTexto}</span>
                        </div>
                    </div>
                    <button class="btn-icon-sub" onclick="eliminarCliente(${c.id})" title="Borrar" type="button"><i class="fa-solid fa-trash" style="color: #9CA3AF;"></i></button>
                </div>
                <div class="cliente-servicios">
                    <h4>Servicios Contratados:</h4>
                    <div class="servicio-linea">
                        <i class="${icon}" style="color: ${col};"></i>
                        <div class="servicio-detalles">
                            <p class="serv-nom">${c.servicioPlataforma} (${c.servicioDetalle}) - <strong style="color: #10B981;">$${parseFloat(c.montoPago || 0).toFixed(2)}</strong></p>
                            <p class="serv-mail" style="margin-bottom: 4px;">${correoAMostrar}</p>
                            <p class="serv-mail" style="font-weight: 700;">
                                <i class="fa-regular fa-calendar" style="color: ${esMoroso ? '#EF4444' : '#6B7280'}; font-size: 0.8rem; margin-right: 3px;"></i> 
                                Vence: <span style="color: ${esMoroso ? '#EF4444' : '#1F2937'};">${fechaTexto}</span>
                            </p>
                        </div>
                    </div>
                </div>
                <div class="cliente-card__actions">
                    <button class="btn-accion-cliente" onclick="abrirModalCliente(${c.id})" type="button"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                    ${(esMoroso || esHoy) 
                        ? `<button class="btn-accion-cliente" style="color: #EF4444; border-color: #EF4444;" onclick="abrirModalPago(${c.id})" type="button"><i class="fa-solid fa-bell"></i> Cobrar</button>
                           <button class="btn-accion-cliente" style="color: #25D366; border-color: rgba(37,211,102,0.3);" onclick="enviarRecordatorio(${c.id})" type="button" title="Enviar recordatorio"><i class="fa-brands fa-whatsapp"></i> ${c.estadoAviso === 'avisado' ? 'Reenviar' : 'Avisar'}</button>`
                        : `<button class="btn-accion-cliente" style="color: #10B981;" onclick="abrirModalPago(${c.id})" type="button"><i class="fa-solid fa-receipt"></i> Renovar</button>`
                    }
                </div>
            </div>
        `;
    };

    // ==========================================
    // 8. ACTUALIZACIÓN DEL DASHBOARD Y KPIS
    // ==========================================
    const actualizarDashboard = () => {
        verificarVencimientosClientes();
        verificarVencimientosCuentas();

        const kpiMadres = document.getElementById('kpi-madres');
        const kpiAldia = document.getElementById('kpi-aldia');
        const kpiMora = document.getElementById('kpi-mora');
        const kpiIngresos = document.getElementById('kpi-ingresos');

        const totalCuentas = cuentas.length;
        const totalAldia = clientes.filter(c => c.estado === 'aldia').length;
        const totalMorosos = clientes.filter(c => c.estado === 'moroso' || c.estado === 'vence-hoy').length; 
        const totalEsperado = clientes.reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);

        if (kpiMadres) kpiMadres.textContent = totalCuentas;
        if (kpiAldia) kpiAldia.textContent = totalAldia;
        if (kpiMora) kpiMora.textContent = totalMorosos;
        if (kpiIngresos) kpiIngresos.textContent = `$${totalEsperado.toFixed(2)}`;

        renderizarDashboardServicios();
        renderizarReportesFinancieros(totalEsperado);
        
        // RENDERIZAR CLIENTES QUE VENCEN HOY
        const contVenceHoy = document.getElementById('contenedor-vence-hoy');
        const sectionVenceHoy = document.getElementById('section-vence-hoy');
        if (contVenceHoy && sectionVenceHoy) {
            const vencenHoy = clientes.filter(c => c.estado === 'vence-hoy');
            if (vencenHoy.length > 0) {
                sectionVenceHoy.classList.remove('vista-oculta');
                contVenceHoy.innerHTML = vencenHoy.map(c => generarHTMLTarjetaCliente(c)).join('');
            } else {
                sectionVenceHoy.classList.add('vista-oculta');
                contVenceHoy.innerHTML = '';
            }
        }

        // RENDERIZAR CUENTAS MADRE POR VENCER (O VENCIDAS)
        const contCuentasVencen = document.getElementById('contenedor-cuentas-vencen');
        const sectionCuentasVencen = document.getElementById('section-cuentas-vencen');
        if (contCuentasVencen && sectionCuentasVencen) {
            const cuentasVencen = cuentas.filter(c => c.estado === 'por-vencer' || c.estado === 'vencida');
            if (cuentasVencen.length > 0) {
                sectionCuentasVencen.classList.remove('vista-oculta');
                contCuentasVencen.innerHTML = cuentasVencen.map(c => {
                    let fechaText = "Sin fecha";
                    if(c.fechaVencimiento) {
                        const f = new Date(c.fechaVencimiento);
                        fechaText = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
                    }

                    return `
                    <div class="cuenta-card ${c.estado === 'vencida' ? 'card-alerta' : ''}" style="margin-bottom: 15px; ${c.estado === 'por-vencer' ? 'border-left: 5px solid #F59E0B;' : ''}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 style="margin: 0; font-size: 1.1rem; color: #1F2937;"><i class="${c.icono}" style="color: ${c.color}; margin-right: 8px;"></i>${c.plataforma}</h3>
                                <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #6B7280;">${c.correo}</p>
                                <p style="margin: 2px 0 0 0; font-size: 0.75rem; font-weight: bold; color: ${c.estado === 'vencida' ? '#EF4444' : '#F59E0B'};">
                                    <i class="fa-regular fa-calendar" style="margin-right: 3px;"></i> Fecha: ${fechaText}
                                </p>
                            </div>
                            <span class="badge ${c.estado === 'vencida' ? 'badge-vencida' : ''}" style="${c.estado === 'por-vencer' ? 'background: rgba(245,158,11,0.2); color: #F59E0B;' : ''}">${c.estado === 'vencida' ? 'Vencida' : 'Vence pronto'}</span>
                        </div>
                    </div>
                `}).join('');
                
                if(!window.avisoMostrado) {
                    mostrarNotificacion(`Atención: Tienes ${cuentasVencen.length} cuenta(s) madre por revisar`, 'info');
                    window.avisoMostrado = true;
                }
            } else {
                sectionCuentasVencen.classList.add('vista-oculta');
                contCuentasVencen.innerHTML = '';
            }
        }
    };

    // ==========================================
    // 9. REPORTES FINANCIEROS Y COSTOS
    // ==========================================
    const renderizarReportesFinancieros = (totalEsperado) => {
        const calcularIngresoDiario = () => {
            const inputFecha = document.getElementById('filtro-fecha-diario');
            const totalDiarioEl = document.getElementById('total-diario');
            if (!inputFecha || !totalDiarioEl) return;
            if (!inputFecha.value) {
                const hoy = new Date();
                const yyyy = hoy.getFullYear();
                const mm = String(hoy.getMonth() + 1).padStart(2, '0');
                const dd = String(hoy.getDate()).padStart(2, '0');
                inputFecha.value = `${yyyy}-${mm}-${dd}`;
            }
            const [year, month, day] = inputFecha.value.split('-');
            const inicioDia = new Date(year, month - 1, day, 0, 0, 0).getTime();
            const finDia = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

            const totalDia = historialPagos
                .filter(pago => pago.fecha >= inicioDia && pago.fecha <= finDia)
                .reduce((acc, pago) => acc + pago.monto, 0);
            totalDiarioEl.textContent = `$${totalDia.toFixed(2)}`;
        };

        const inputFechaGlobal = document.getElementById('filtro-fecha-diario');
        if (inputFechaGlobal) inputFechaGlobal.addEventListener('change', calcularIngresoDiario);
        
        const totalCobrado = clientes.filter(c => c.estado === 'aldia').reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
        const totalPendiente = totalEsperado - totalCobrado;

        let totalPagoProveedores = 0;
        cuentas.forEach(cuenta => {
            const costo = costosProveedores[cuenta.plataforma] || 0;
            totalPagoProveedores += costo;
        });

        const gananciaNeta = totalCobrado - totalPagoProveedores;

        const repEsperado = document.getElementById('rep-esperado');
        const repCobrado = document.getElementById('rep-cobrado');
        const repPendiente = document.getElementById('rep-pendiente');
        const repProveedores = document.getElementById('rep-proveedores');
        const repGanancia = document.getElementById('rep-ganancia');

        if (repEsperado) repEsperado.textContent = `$${totalEsperado.toFixed(2)}`;
        if (repCobrado) repCobrado.textContent = `$${totalCobrado.toFixed(2)}`;
        if (repPendiente) repPendiente.textContent = `$${totalPendiente.toFixed(2)}`;
        if (repProveedores) repProveedores.textContent = `$${totalPagoProveedores.toFixed(2)}`;
        if (repGanancia) repGanancia.textContent = `$${gananciaNeta.toFixed(2)}`;

        const contHistorial = document.getElementById('contenedor-historial-meses');
        if (contHistorial) {
            const agrupadoMeses = historialPagos.reduce((acc, pago) => {
                if (!acc[pago.mes]) acc[pago.mes] = 0;
                acc[pago.mes] += pago.monto;
                return acc;
            }, {});
            const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const mesesOrdenados = Object.keys(agrupadoMeses).sort((a, b) => b.localeCompare(a)); 

            let htmlHistorial = '';
            mesesOrdenados.forEach(mes => {
                const [year, month] = mes.split('-');
                const nombreMes = nombresMeses[parseInt(month) - 1];
                htmlHistorial += `
                    <div class="plat-card" style="display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #10B981;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 12px; color: #10B981; font-size: 1.2rem;">
                                <i class="fa-solid fa-calendar-check"></i>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.05rem; color: #1F2937;">${nombreMes} ${year}</h3>
                                <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #6B7280;">Monto recaudado este mes</p>
                            </div>
                        </div>
                        <h2 style="margin: 0; color: #10B981; font-size: 1.3rem;">$${agrupadoMeses[mes].toFixed(2)}</h2>
                    </div>
                `;
            });
            if (htmlHistorial === '') htmlHistorial = `<p style="grid-column: 1/-1; text-align: center; color: #9CA3AF; padding: 25px;">No hay ingresos registrados en el historial mensual aún.</p>`;
            contHistorial.innerHTML = htmlHistorial;
        }

        const contReportesPlat = document.getElementById('contenedor-reporte-plataformas');
        if (contReportesPlat) {
            contReportesPlat.innerHTML = '';
            const plataformas = [
                { nombre: 'Netflix', color: '#E50914', icono: 'fa-solid fa-play' },
                { nombre: 'Max', color: '#002BE7', icono: 'fa-solid fa-tv' },
                { nombre: 'Spotify', color: '#1DB954', icono: 'fa-brands fa-spotify' },
                { nombre: 'Disney+', color: '#113CCF', icono: 'fa-solid fa-star' },
                { nombre: 'Crunchyroll', color: '#F47521', icono: 'fa-solid fa-fire' },
                { nombre: 'YouTube Premium', color: '#FF0000', icono: 'fa-brands fa-youtube' },
                { nombre: 'Canva', color: '#7D2AE8', icono: 'fa-solid fa-palette' },
                { nombre: 'CapCut', color: '#00F2FE', icono: 'fa-solid fa-video' },
                { nombre: 'Amazon Prime', color: '#00A8E1', icono: 'fa-brands fa-amazon' },
                { nombre: 'IPTV', color: '#14B8A6', icono: 'fa-solid fa-satellite-dish' }
            ];

            let htmlPlat = '';
            plataformas.forEach(plat => {
                const clientesPlat = clientes.filter(c => c.servicioPlataforma === plat.nombre);
                if (clientesPlat.length === 0) return; 

                const platEsperado = clientesPlat.reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
                const platCobrado = clientesPlat.filter(c => c.estado === 'aldia').reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
                const porcentaje = platEsperado === 0 ? 0 : Math.round((platCobrado / platEsperado) * 100);

                htmlPlat += `
                    <div class="plat-card" style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="${plat.icono}" style="color: ${plat.color}; font-size: 1.5rem;"></i>
                            <h3 style="margin: 0; font-size: 1.1rem; color: #1F2937;">${plat.nombre}</h3>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.9rem;">
                            <span style="color: #6B7280;">Cobrado: <strong style="color: #10B981;">$${platCobrado.toFixed(2)}</strong></span>
                            <span style="color: #6B7280;">Total: <strong style="color: #1F2937;">$${platEsperado.toFixed(2)}</strong></span>
                        </div>
                        <div class="progress-bg">
                            <div class="progress-bar" style="width: ${porcentaje}%; background-color: ${plat.color};"></div>
                        </div>
                        <span style="font-size: 0.75rem; text-align: right; color: #9CA3AF; font-weight: 700;">${porcentaje}% Recaudado</span>
                    </div>
                `;
            });
            if (htmlPlat === '') htmlPlat = `<p style="grid-column: 1/-1; text-align: center; color: #9CA3AF; padding: 25px;">No hay ingresos activos registrados.</p>`;
            contReportesPlat.innerHTML = htmlPlat;
        }
        calcularIngresoDiario();
    };

    // ==========================================
    // 10. SERVICIOS ACTIVOS EN INICIO
    // ==========================================
    const contenedorPlataformas = document.getElementById('contenedor-plataformas');
    const renderizarDashboardServicios = () => {
        if (!contenedorPlataformas) return;
        contenedorPlataformas.innerHTML = '';

        const serviciosDef = [
            { nombre: 'Netflix', color: '#E50914', icono: 'fa-solid fa-play' },
            { nombre: 'Max', color: '#002BE7', icono: 'fa-solid fa-tv' },
            { nombre: 'Spotify', color: '#1DB954', icono: 'fa-brands fa-spotify' },
            { nombre: 'Disney+', color: '#113CCF', icono: 'fa-solid fa-star' },
            { nombre: 'Crunchyroll', color: '#F47521', icono: 'fa-solid fa-fire' },
            { nombre: 'YouTube Premium', color: '#FF0000', icono: 'fa-brands fa-youtube' },
            { nombre: 'Canva', color: '#7D2AE8', icono: 'fa-solid fa-palette' },
            { nombre: 'CapCut', color: '#00F2FE', icono: 'fa-solid fa-video' },
            { nombre: 'Amazon Prime', color: '#00A8E1', icono: 'fa-brands fa-amazon' },
            { nombre: 'IPTV', color: '#14B8A6', icono: 'fa-solid fa-satellite-dish' }
        ];

        serviciosDef.forEach(serv => {
            const madresCount = cuentas.filter(c => c.plataforma === serv.nombre).length;
            const perfilesCount = clientes.filter(c => c.servicioPlataforma === serv.nombre).length;

            const tarjeta = document.createElement('div');
            tarjeta.className = 'plat-card';
            tarjeta.innerHTML = `
                <div class="plat-card__header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="${serv.icono}" style="color: ${serv.color}; font-size: 1.5rem;"></i>
                        <h3 style="margin: 0; font-size: 1.1rem; color: #1F2937;">${serv.nombre}</h3>
                    </div>
                    <span class="plat-card__tag" style="background-color: ${serv.color}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem;">Activo</span>
                </div>
                <div class="plat-card__info" style="margin-top: 12px; color: #6B7280; font-size: 0.85rem;">
                    <p style="margin: 0 0 4px 0;">Cuentas Madre: <strong style="color: #1F2937;">${madresCount}</strong></p>
                    <p style="margin: 0;">Perfiles Vendidos: <strong style="color: #1F2937;">${perfilesCount}</strong></p>
                </div>
            `;
            contenedorPlataformas.appendChild(tarjeta);
        });
    };

    // ==========================================
    // 11. GESTIÓN DE CUENTAS MADRE
    // ==========================================
    const guardarYRenderizarCuentas = () => {
        guardarNube();
        const filtroActivo = document.querySelector('#vista-cuentas .btn-filtro.active');
        const textoFiltro = filtroActivo && filtroActivo.getAttribute('data-filtro') !== 'Todas' ? filtroActivo.getAttribute('data-filtro') : '';
        renderizarCuentas(textoFiltro);
        actualizarDashboard();
    };

    const renderizarCuentas = (filtro = '') => {
        const grid = document.querySelector('#vista-cuentas .grid-cuentas');
        if (!grid) return;
        grid.innerHTML = '';

        const filtradas = cuentas.filter(c => c.correo.toLowerCase().includes(filtro.toLowerCase()) || c.plataforma.toLowerCase().includes(filtro.toLowerCase()));
        if (filtradas.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #9CA3AF; padding: 25px;">No hay cuentas registradas con este filtro.</p>`;
            return;
        }

        filtradas.forEach(c => {
            let badgeHTML = c.estado === 'vencida' ? `<span class="badge badge-vencida">Vencida</span>` : 
                            c.estado === 'por-vencer' ? `<span class="badge badge-vencida" style="background-color: rgba(245, 158, 11, 0.1); color: #F59E0B;">Por Vencer</span>` : 
                            `<span class="badge badge-aldia">Al Día</span>`;

            let fechaText = "Sin fecha configurada";
            if(c.fechaVencimiento) {
                const f = new Date(c.fechaVencimiento);
                fechaText = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
            }

            const tarjeta = document.createElement('div');
            tarjeta.className = `cuenta-card ${c.estado === 'aldia' ? 'card-ok' : 'card-alerta'}`;
            tarjeta.innerHTML = `
                <div class="plat-card__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div class="plat-meta" style="display: flex; align-items: center; gap: 10px;">
                        <i class="${c.icono}" style="color: ${c.color}; font-size: 1.4rem;"></i>
                        <h3 style="margin: 0; font-size: 1.1rem; color: #1F2937;">${c.plataforma}</h3>
                    </div>
                    ${badgeHTML}
                </div>
                <div class="plat-card__info" style="color: #4B5563; font-size: 0.88rem; display: flex; flex-direction: column; gap: 6px;">
                    <p style="margin: 0;">Correo: <strong style="color: #1F2937;">${c.correo}</strong></p>
                    <p style="margin: 0;">Vencimiento: <strong style="color: ${c.estado === 'vencida' ? '#EF4444' : '#1F2937'};">${fechaText}</strong></p>
                    <p style="margin: 0;">Perfiles Ocupados: <strong style="color: #1F2937;">${c.perfilesOcupados || 0} / ${c.perfilesMax}</strong></p>
                </div>
                <div class="plat-card__actions" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; border-top: 1px solid #F3F4F6; padding-top: 15px;">
                    <button class="btn-accion primary" type="button" onclick="abrirModalSubcuentas(${c.id})" style="background-color: rgba(59, 130, 246, 0.1); color: #3B82F6; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer;">Gestionar Perfiles</button>
                    <div style="display: flex; gap: 10px;">
                        <button class="btn-icon-sub" type="button" onclick="abrirModalEditarCuenta(${c.id})" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="btn-icon-sub delete-icon" type="button" onclick="abrirModalEliminar(${c.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            grid.appendChild(tarjeta);
        });
    };

    const inputBuscadorCuentas = document.getElementById('buscador-cuentas');
    const botonesFiltroCuentas = document.querySelectorAll('#vista-cuentas .btn-filtro');
    if (inputBuscadorCuentas) {
        inputBuscadorCuentas.addEventListener('input', (e) => {
            renderizarCuentas(e.target.value);
            botonesFiltroCuentas.forEach(b => b.classList.remove('active'));
        });
    }

    botonesFiltroCuentas.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesFiltroCuentas.forEach(b => b.classList.remove('active'));
            boton.classList.add('active');
            if (inputBuscadorCuentas) inputBuscadorCuentas.value = '';
            const filtroVal = boton.getAttribute('data-filtro');
            renderizarCuentas(filtroVal === 'Todas' ? '' : filtroVal);
        });
    });

    // Agregar Cuenta Madre
    const modalAgregarId = 'modal-agregar-cuenta';
    const formAgregarCuenta = document.getElementById('form-agregar-cuenta');
    document.getElementById('btn-agregar-cuenta')?.addEventListener('click', () => toggleModal(modalAgregarId, true));
    document.getElementById('cerrar-modal-agregar')?.addEventListener('click', () => toggleModal(modalAgregarId, false));
    
    if (formAgregarCuenta) {
        formAgregarCuenta.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputCorreoObj = document.getElementById('nuevo-correo');
            const correoGuardado = inputCorreoObj ? inputCorreoObj.value.trim() : 'Sin Correo';
            const plataforma = document.getElementById('nuevo-plataforma').value;
            const perfilesMax = parseInt(document.getElementById('nuevo-perfiles').value) || 5;
            
            const inputFecha = document.getElementById('nuevo-vencimiento-cuenta')?.value;
            let fechaManual = null;
            if(inputFecha) {
                const [year, month, day] = inputFecha.split('-');
                fechaManual = new Date(year, month - 1, day, 23, 59, 59).getTime();
            }

            let icono = 'fa-solid fa-play'; let color = '#E50914';
            if (plataforma === 'Spotify') { icono = 'fa-brands fa-spotify'; color = '#1DB954'; }
            else if (plataforma === 'Max') { icono = 'fa-solid fa-tv'; color = '#002BE7'; }
            else if (plataforma === 'Disney+') { icono = 'fa-solid fa-star'; color = '#113CCF'; }
            else if (plataforma === 'Crunchyroll') { icono = 'fa-solid fa-fire'; color = '#F47521'; }
            else if (plataforma === 'YouTube Premium') { icono = 'fa-brands fa-youtube'; color = '#FF0000'; }
            else if (plataforma === 'Canva') { icono = 'fa-solid fa-palette'; color = '#7D2AE8'; }
            else if (plataforma === 'CapCut') { icono = 'fa-solid fa-video'; color = '#00F2FE'; }
            else if (plataforma === 'Amazon Prime') { icono = 'fa-brands fa-amazon'; color = '#00A8E1'; }
            else if (plataforma === 'IPTV') { icono = 'fa-solid fa-satellite-dish'; color = '#14B8A6'; }

            const subcuentasIniciales = [];
            for (let i = 0; i < perfilesMax; i++) subcuentasIniciales.push({ nombre: '', correoPerfil: '' });

            const nuevaCuenta = {
                id: Date.now(), plataforma: plataforma, icono: icono, color: color,
                correo: correoGuardado, perfilesMax: perfilesMax, perfilesOcupados: 0,
                estado: 'aldia', fechaVencimiento: fechaManual, subcuentas: subcuentasIniciales
            };

            cuentas.push(nuevaCuenta);
            guardarYRenderizarCuentas();
            toggleModal(modalAgregarId, false);
            formAgregarCuenta.reset();
            mostrarNotificacion('¡Cuenta Madre guardada con éxito!');
        });
    }

    // Eliminar Cuenta Madre
    let cuentaAEliminar = null;
    const modalEliminarId = 'modal-eliminar';
    window.abrirModalEliminar = function(id) { cuentaAEliminar = id; toggleModal(modalEliminarId, true); };
    document.getElementById('btn-cancelar-eliminar')?.addEventListener('click', () => { toggleModal(modalEliminarId, false); cuentaAEliminar = null; });
    document.getElementById('btn-confirmar-eliminar')?.addEventListener('click', () => {
        if (cuentaAEliminar) {
            cuentas = cuentas.filter(c => c.id !== cuentaAEliminar);
            guardarYRenderizarCuentas();
            toggleModal(modalEliminarId, false);
            mostrarNotificacion('Cuenta eliminada', 'info');
        }
    });

    // Subcuentas (Perfiles)
    let cuentaEnEdicionId = null;
    const modalSubId = 'modal-subcuentas';
    document.getElementById('cerrar-modal-sub')?.addEventListener('click', () => toggleModal(modalSubId, false));

    window.abrirModalSubcuentas = function(idCuenta) {
        const cuenta = cuentas.find(c => c.id === idCuenta);
        if (!cuenta) return;
        cuentaEnEdicionId = cuenta.id;
        toggleModal(modalSubId, true);
        const correoRef = document.getElementById('modal-correo-ref');
        if (correoRef) correoRef.textContent = `${cuenta.plataforma} — ${cuenta.correo}`;

        if (!cuenta.subcuentas || cuenta.subcuentas.length !== cuenta.perfilesMax) {
            cuenta.subcuentas = [];
            for (let i = 1; i <= cuenta.perfilesMax; i++) cuenta.subcuentas.push({ nombre: '', correoPerfil: '' });
        }

        const contenedorListaPerfiles = document.getElementById('contenedor-lista-perfiles');
        if (contenedorListaPerfiles) {
            contenedorListaPerfiles.innerHTML = '';
            cuenta.subcuentas.forEach((sub, index) => {
                const perfilDiv = document.createElement('div');
                perfilDiv.className = 'perfil-item-box';
                perfilDiv.style.cssText = 'background: #F9FAFB; padding: 12px; border-radius: 12px; border: 1px solid #E5E7EB; display: flex; flex-direction: column; gap: 8px;';
                
                perfilDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; font-size: 0.85rem; color: #374151;">Perfil ${index + 1}</span>
                        <span style="font-size: 0.75rem; color: #9CA3AF;">Slot ${index + 1} de ${cuenta.perfilesMax}</span>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <input type="text" class="input-nombre-perfil" placeholder="Nombre del cliente" value="${sub.nombre || ''}" style="flex: 1; min-width: 140px; padding: 8px; border-radius: 8px; border: 1px solid #D1D5DB; font-size: 0.85rem; color: #1F2937; outline: none;">
                        <input type="text" class="input-correo-perfil" placeholder="Correo o PIN" value="${sub.correoPerfil || ''}" style="flex: 1; min-width: 140px; padding: 8px; border-radius: 8px; border: 1px solid #D1D5DB; font-size: 0.85rem; color: #1F2937; outline: none;">
                    </div>
                `;
                contenedorListaPerfiles.appendChild(perfilDiv);
            });
        }
    };

    document.getElementById('btn-guardar-cambios-subcuentas')?.addEventListener('click', () => {
        if (!cuentaEnEdicionId) return;
        const cuenta = cuentas.find(c => c.id === cuentaEnEdicionId);
        if (!cuenta) return;

        const contenedorListaPerfiles = document.getElementById('contenedor-lista-perfiles');
        const itemsPerfiles = contenedorListaPerfiles.querySelectorAll('.perfil-item-box');
        let ocupadosCount = 0;

        cuenta.subcuentas = [];
        itemsPerfiles.forEach(item => {
            const cajaNombre = item.querySelector('.input-nombre-perfil');
            const cajaCorreo = item.querySelector('.input-correo-perfil');
            const nombreGuardado = cajaNombre ? cajaNombre.value.trim() : '';
            const correoPerfilGuardado = cajaCorreo ? cajaCorreo.value.trim() : '';
            
            cuenta.subcuentas.push({ nombre: nombreGuardado, correoPerfil: correoPerfilGuardado });
            if (nombreGuardado !== '') ocupadosCount++;
        });

        cuenta.perfilesOcupados = ocupadosCount;
        guardarYRenderizarCuentas();
        toggleModal(modalSubId, false);
        mostrarNotificacion('Perfiles actualizados', 'success');
    });

    // Editar Cuenta Madre
    const modalEditarCuentaId = 'modal-editar-cuenta';
    const formEditarCuenta = document.getElementById('form-editar-cuenta');
    document.getElementById('cerrar-modal-editar-cuenta')?.addEventListener('click', () => toggleModal(modalEditarCuentaId, false));

    window.abrirModalEditarCuenta = function(id) {
        const cuenta = cuentas.find(c => c.id === id);
        if (!cuenta) return;
        document.getElementById('edit-cuenta-id').value = cuenta.id;
        document.getElementById('edit-cuenta-correo').value = cuenta.correo;

        if (cuenta.fechaVencimiento) {
            const fd = new Date(cuenta.fechaVencimiento);
            const yyyy = fd.getFullYear();
            const mm = String(fd.getMonth() + 1).padStart(2, '0');
            const dd = String(fd.getDate()).padStart(2, '0');
            const inputVenc = document.getElementById('edit-cuenta-vencimiento');
            if(inputVenc) inputVenc.value = `${yyyy}-${mm}-${dd}`;
        }

        toggleModal(modalEditarCuentaId, true);
    };

    const modalNotificacionId = 'modal-notificacion-masiva';
    document.getElementById('cerrar-modal-notificacion')?.addEventListener('click', () => toggleModal(modalNotificacionId, false));

    if (formEditarCuenta) {
        formEditarCuenta.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = parseInt(document.getElementById('edit-cuenta-id').value);
            const nuevoCorreo = document.getElementById('edit-cuenta-correo').value.trim();
            const fechaInput = document.getElementById('edit-cuenta-vencimiento')?.value;

            const cuenta = cuentas.find(c => c.id === id);
            if (!cuenta) return;

            const correoViejo = cuenta.correo;
            cuenta.correo = nuevoCorreo;
            
            if(fechaInput) {
                const [year, month, day] = fechaInput.split('-');
                cuenta.fechaVencimiento = new Date(year, month - 1, day, 23, 59, 59).getTime();
            }

            guardarYRenderizarCuentas(); 

            const clientesAfectados = clientes.filter(c => c.servicioCorreo.toLowerCase() === correoViejo.toLowerCase() && c.servicioPlataforma === cuenta.plataforma);
            
            if (clientesAfectados.length > 0) {
                clientesAfectados.forEach(c => c.servicioCorreo = nuevoCorreo);
                guardarYRenderizarClientes();
                toggleModal(modalEditarCuentaId, false);
                abrirModalNotificacionMasiva(clientesAfectados, cuenta.plataforma, nuevoCorreo);
            } else {
                toggleModal(modalEditarCuentaId, false);
                mostrarNotificacion('Cuenta actualizada. No hay clientes vinculados a este correo.', 'success');
            }
        });
    }

    window.abrirModalNotificacionMasiva = function(clientesAfectados, plataforma, nuevoCorreo) {
        const contenedor = document.getElementById('lista-clientes-notificar');
        if (!contenedor) return;
        contenedor.innerHTML = '';
        
        clientesAfectados.forEach(c => {
            const mensaje = `Hola ${c.nombre}!\n\nTe informamos que por motivos de mantenimiento hemos actualizado el correo de acceso para tu cuenta de *${plataforma}*:\n\n• *Nuevo Correo:* ${nuevoCorreo}\n• *Contraseña/PIN:* ${c.contrasena || 'La misma que ya tenías'}\n• *Perfil:* ${c.servicioDetalle}\n\nPor favor, utiliza este nuevo correo para iniciar sesión a partir de ahora. ¡Gracias por tu comprensión!`;
            const urlWa = `https://api.whatsapp.com/send?phone=${c.telefono}&text=${encodeURIComponent(mensaje)}`;
            
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #F9FAFB; padding: 12px; border-radius: 10px; border: 1px solid #E5E7EB;';
            item.innerHTML = `
                <div>
                    <strong style="color: #1F2937; display: block; font-size: 0.9rem;">${c.nombre}</strong>
                    <span style="color: #6B7280; font-size: 0.8rem;">Perfil: ${c.servicioDetalle}</span>
                </div>
                <a href="${urlWa}" target="_blank" onclick="this.style.backgroundColor='#E5E7EB'; this.style.color='#9CA3AF'; this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Listo';" style="background: #25D366; color: white; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-size: 0.85rem; font-weight: bold; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    <i class="fa-brands fa-whatsapp"></i> Notificar
                </a>
            `;
            contenedor.appendChild(item);
        });
        toggleModal(modalNotificacionId, true);
    };

    // ==========================================
    // 12. GESTIÓN DE CLIENTES
    // ==========================================
    const guardarYRenderizarClientes = () => {
        guardarNube();
        const filtroActivo = document.querySelector('#vista-clientes .btn-filtro.active');
        const filtroVal = filtroActivo ? filtroActivo.getAttribute('data-filtro') : 'todos';
        renderizarClientes(filtroVal);
        actualizarDashboard();
    };

    const renderizarClientes = (filtroEstado = 'todos') => {
        verificarVencimientosClientes();
        const grid = document.querySelector('#vista-clientes .grid-clientes'); 
        if (!grid) return;
        
        const textoBusqueda = (document.getElementById('buscador-clientes')?.value || '').toLowerCase();
        
        let filtrados = clientes.filter(c => {
            const coincideBusqueda = c.nombre.toLowerCase().includes(textoBusqueda) || 
                                     c.servicioCorreo.toLowerCase().includes(textoBusqueda) ||
                                     (c.correoPersonal && c.correoPersonal.toLowerCase().includes(textoBusqueda));
            const coincideEstado = filtroEstado === 'todos' || 
                                  (filtroEstado === 'aldia' && c.estado === 'aldia') || 
                                  (filtroEstado === 'vencidos' && (c.estado === 'moroso' || c.estado === 'vence-hoy'));
            return coincideBusqueda && coincideEstado;
        });

        if (filtrados.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #9CA3AF; padding: 25px;">No se encontraron clientes registrados.</p>`;
            return;
        }
        
        grid.innerHTML = filtrados.map(c => generarHTMLTarjetaCliente(c)).join('');
    };

    const inputBuscadorClientes = document.getElementById('buscador-clientes');
    const botonesFiltroClientes = document.querySelectorAll('#vista-clientes .btn-filtro');
    if (inputBuscadorClientes) {
        inputBuscadorClientes.addEventListener('input', () => {
            const activo = document.querySelector('#vista-clientes .btn-filtro.active');
            renderizarClientes(activo ? activo.getAttribute('data-filtro') : 'todos');
        });
    }
    botonesFiltroClientes.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesFiltroClientes.forEach(b => b.classList.remove('active'));
            boton.classList.add('active');
            if (inputBuscadorClientes) inputBuscadorClientes.value = '';
            renderizarClientes(boton.getAttribute('data-filtro'));
        });
    });

    // LÓGICA DINÁMICA DE PLATAFORMA 
    const selectPlataforma = document.getElementById('cliente-plataforma');
    const grupoCorreoPersonal = document.getElementById('grupo-correo-personal');
    const grupoEnlaceIptv = document.getElementById('grupo-enlace-iptv'); // NUEVO PARA IPTV
    const inputContrasena = document.getElementById('cliente-contrasena');
    const inputCorreoBase = document.getElementById('cliente-correo');

    const adaptarFormularioSegunPlataforma = (platVal) => {
        if (!inputContrasena || !inputCorreoBase) return;

        // Ocultar los campos extra por defecto
        if (grupoCorreoPersonal) grupoCorreoPersonal.style.display = 'none';
        if (grupoEnlaceIptv) grupoEnlaceIptv.style.display = 'none';
        
        inputCorreoBase.type = 'email'; // Vuelve a email para plataformas normales

        if (platVal === 'Spotify') {
            if (grupoCorreoPersonal) grupoCorreoPersonal.style.display = 'flex';
            inputContrasena.required = false;
            inputContrasena.placeholder = 'No requiere contraseña (Invitación)';
            inputCorreoBase.placeholder = 'Correo Admin / Cuenta Madre';
        } else if (platVal === 'Canva' || platVal === 'CapCut') {
            inputContrasena.required = false;
            inputContrasena.placeholder = 'No requiere contraseña (Invitación por correo)';
            inputCorreoBase.placeholder = 'Correo personal o vinculado del cliente';
        } else if (platVal === 'IPTV') {
            if (grupoEnlaceIptv) grupoEnlaceIptv.style.display = 'flex';
            inputContrasena.required = true;
            inputContrasena.placeholder = 'Contraseña del IPTV';
            inputCorreoBase.type = 'text'; // Cambia a text para aceptar usuarios que no sean correos
            inputCorreoBase.placeholder = 'Usuario del IPTV';
        } else {
            inputContrasena.required = true;
            inputContrasena.placeholder = 'Contraseña o PIN del perfil';
            inputCorreoBase.placeholder = 'correo.vinculado@gmail.com';
        }
    };

    if (selectPlataforma) {
        selectPlataforma.addEventListener('change', (e) => {
            adaptarFormularioSegunPlataforma(e.target.value);
        });
    }

    // Modal Cliente: Abrir para Crear
    const modalClienteId = 'modal-cliente';
    const formCliente = document.getElementById('form-cliente');
    
    document.getElementById('btn-agregar-cliente')?.addEventListener('click', () => {
        if (formCliente) formCliente.reset();
        document.getElementById('cliente-id').value = '';
        document.getElementById('titulo-modal-cliente').textContent = 'Agregar Cliente';
        
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 28);
        const yyyy = defaultDate.getFullYear();
        const mm = String(defaultDate.getMonth() + 1).padStart(2, '0');
        const dd = String(defaultDate.getDate()).padStart(2, '0');
        document.getElementById('cliente-fecha-vencimiento').value = `${yyyy}-${mm}-${dd}`;

        if (selectPlataforma) adaptarFormularioSegunPlataforma(selectPlataforma.value);
        toggleModal(modalClienteId, true);
    });

    document.getElementById('cerrar-modal-cliente')?.addEventListener('click', () => toggleModal(modalClienteId, false));

    // Modal Cliente: Abrir para Editar
    window.abrirModalCliente = function(id) {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) return;
        
        document.getElementById('cliente-id').value = cliente.id;
        document.getElementById('cliente-nombre').value = cliente.nombre;
        document.getElementById('cliente-estado').value = (cliente.estado === 'moroso' || cliente.estado === 'vence-hoy') ? 'moroso' : 'aldia';
        document.getElementById('cliente-monto').value = cliente.montoPago || '';
        document.getElementById('cliente-plataforma').value = cliente.servicioPlataforma;
        document.getElementById('cliente-detalle').value = cliente.servicioDetalle;
        document.getElementById('cliente-correo').value = cliente.servicioCorreo;
        
        document.getElementById('cliente-telefono').value = cliente.telefono || '';
        document.getElementById('cliente-metodo-pago').value = cliente.metodoPago || 'Binance';
        document.getElementById('cliente-contrasena').value = cliente.contrasena || '';
        
        const inputPersonal = document.getElementById('cliente-correo-personal');
        if (inputPersonal) inputPersonal.value = cliente.correoPersonal || '';

        const inputEnlace = document.getElementById('cliente-enlace');
        if (inputEnlace) inputEnlace.value = cliente.enlaceIptv || '';

        adaptarFormularioSegunPlataforma(cliente.servicioPlataforma);

        if (cliente.fechaVencimiento) {
            const fd = new Date(cliente.fechaVencimiento);
            const yyyy = fd.getFullYear();
            const mm = String(fd.getMonth() + 1).padStart(2, '0');
            const dd = String(fd.getDate()).padStart(2, '0');
            document.getElementById('cliente-fecha-vencimiento').value = `${yyyy}-${mm}-${dd}`;
        }

        document.getElementById('titulo-modal-cliente').textContent = 'Editar Cliente';
        toggleModal(modalClienteId, true);
    };

    // Guardar Cliente (Nuevo o Edición)
    if (formCliente) {
        formCliente.addEventListener('submit', (e) => {
            e.preventDefault();
            const idForm = document.getElementById('cliente-id').value;
            const fechaInput = document.getElementById('cliente-fecha-vencimiento').value;
            const [year, month, day] = fechaInput.split('-');
            const fechaManual = new Date(year, month - 1, day, 23, 59, 59).getTime();

            // FORMATEO INTELIGENTE DEL NÚMERO DE WHATSAPP (MODIFICADO)
            let telefono = document.getElementById('cliente-telefono').value.replace(/\D/g, ''); 
            if (telefono.startsWith('0') && telefono.length === 11) {
                // Si es un número local tipo 0414... se formatea a 58414...
                telefono = '58' + telefono.substring(1);
            } else if (telefono.length === 10 && !telefono.startsWith('58')) {
                // Si se colocó sin el cero tipo 414... se agrega el 58
                telefono = '58' + telefono;
            }
            // De lo contrario (ej. números de Colombia, México o España), se deja el número internacional tal cual ingresó.

            const metodoPago = document.getElementById('cliente-metodo-pago').value;
            const contrasena = document.getElementById('cliente-contrasena').value.trim();
            const plataforma = document.getElementById('cliente-plataforma').value;

            const inputPersonal = document.getElementById('cliente-correo-personal');
            const correoPersonal = (plataforma === 'Spotify' && inputPersonal) ? inputPersonal.value.trim() : '';

            const inputEnlace = document.getElementById('cliente-enlace');
            const enlaceIptv = (plataforma === 'IPTV' && inputEnlace) ? inputEnlace.value.trim() : '';

            const datosCliente = {
                id: idForm ? parseInt(idForm) : Date.now(),
                nombre: document.getElementById('cliente-nombre').value.trim(),
                estado: 'aldia', 
                montoPago: parseFloat(document.getElementById('cliente-monto').value) || 0,
                servicioPlataforma: plataforma,
                servicioDetalle: document.getElementById('cliente-detalle').value.trim(),
                servicioCorreo: document.getElementById('cliente-correo').value.trim(),
                correoPersonal: correoPersonal,
                enlaceIptv: enlaceIptv, // Guardamos el enlace IPTV
                fechaVencimiento: fechaManual,
                telefono: telefono,
                metodoPago: metodoPago,
                contrasena: contrasena,
                estadoAviso: idForm ? (clientes.find(c => c.id === parseInt(idForm))?.estadoAviso || 'pendiente') : 'pendiente'
            };

            if (idForm) {
                const index = clientes.findIndex(c => c.id === parseInt(idForm));
                if (index > -1) { clientes[index] = datosCliente; }
                
                historialPagos.forEach(pago => {
                    if (pago.clienteId === parseInt(idForm)) {
                        pago.monto = datosCliente.montoPago;
                        pago.plataforma = datosCliente.servicioPlataforma;
                    }
                });
            } else {
                clientes.push(datosCliente);
                registrarTransaccionHistorial(datosCliente.montoPago, datosCliente.servicioPlataforma, datosCliente.id);
            }

            guardarYRenderizarClientes();
            toggleModal(modalClienteId, false);
            mostrarNotificacion('¡Cliente guardado! Abriendo WhatsApp...', 'success');

            const fechaFormateada = new Date(fechaManual).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            let mensajeWa = ''; 
            const textoContrasena = datosCliente.contrasena !== '' ? `\n• *Contraseña/PIN:* ${datosCliente.contrasena}` : '';

            if (plataforma === 'Spotify') {
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los detalles de tu cuenta de *Spotify*:\n\n• *Tu Correo (Invitación):* ${datosCliente.correoPersonal}\n• *Plan:* ${datosCliente.servicioDetalle}${textoContrasena}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra!`;
            } else if (plataforma === 'Canva') {
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los detalles de tu acceso a *${plataforma}*:\n\n• *Correo de Invitación:* ${datosCliente.servicioCorreo}\n• *Plan/Equipo:* ${datosCliente.servicioDetalle}${textoContrasena}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra! Disfruta tu plataforma.`;
            } else if (plataforma === 'IPTV') {
                const textoEnlace = datosCliente.enlaceIptv !== '' ? `\n• *Enlace/App:* ${datosCliente.enlaceIptv}` : '';
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los datos de acceso de tu cuenta de *IPTV*:\n\n• *Usuario:* ${datosCliente.servicioCorreo}${textoContrasena}${textoEnlace}\n• *Dispositivos/Detalle:* ${datosCliente.servicioDetalle}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra! Disfruta tu contenido.`;
            } else {
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los datos de acceso de tu cuenta de *${datosCliente.servicioPlataforma}*:\n\n• *Correo:* ${datosCliente.servicioCorreo}${textoContrasena}\n• *Perfil Asignado:* ${datosCliente.servicioDetalle}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra! Disfruta tu contenido.`;
            }
            
            const urlWa = `https://api.whatsapp.com/send?phone=${datosCliente.telefono}&text=${encodeURIComponent(mensajeWa)}`;
            window.open(urlWa, '_blank');
        });
    }

    // Eliminar Cliente
    let clienteAEliminarId = null;
    const modalEliminarClienteId = 'modal-eliminar-cliente';
    window.eliminarCliente = function(id) { clienteAEliminarId = id; toggleModal(modalEliminarClienteId, true); };
    document.getElementById('btn-cancelar-eliminar-cliente')?.addEventListener('click', () => { toggleModal(modalEliminarClienteId, false); clienteAEliminarId = null; });
    document.getElementById('btn-confirmar-eliminar-cliente')?.addEventListener('click', () => {
        if (clienteAEliminarId !== null) {
            clientes = clientes.filter(c => c.id !== clienteAEliminarId);
            historialPagos = historialPagos.filter(pago => pago.clienteId !== clienteAEliminarId);
            guardarYRenderizarClientes();
            toggleModal(modalEliminarClienteId, false);
            clienteAEliminarId = null;
            mostrarNotificacion('Cliente eliminado', 'info');
        }
    });

    // Renovar Pago de Cliente
    let clientePagoId = null;
    const modalPagoId = 'modal-pago';
    window.abrirModalPago = function(id) { clientePagoId = id; toggleModal(modalPagoId, true); };
    document.getElementById('btn-cancelar-pago')?.addEventListener('click', () => { toggleModal(modalPagoId, false); clientePagoId = null; });

    document.getElementById('btn-confirmar-pago')?.addEventListener('click', () => {
        if (clientePagoId) {
            const index = clientes.findIndex(c => c.id === clientePagoId);
            if (index > -1) {
                let baseDate = new Date();
                if (clientes[index].fechaVencimiento > Date.now()) baseDate = new Date(clientes[index].fechaVencimiento);
                baseDate.setDate(baseDate.getDate() + 28);
                
                clientes[index].estado = 'aldia';
                clientes[index].fechaVencimiento = baseDate.setHours(23, 59, 59, 999);
                
                registrarTransaccionHistorial(clientes[index].montoPago, clientes[index].servicioPlataforma, clientes[index].id);
                guardarYRenderizarClientes();
            }
            toggleModal(modalPagoId, false);
            clientePagoId = null;
            mostrarNotificacion('¡Pago registrado con éxito!');
        }
    });

    // Enviar Recordatorio
    window.enviarRecordatorio = function(id) {
        const index = clientes.findIndex(c => c.id === id);
        if (index > -1) {
            const c = clientes[index];
            const estaMoroso = c.estado === 'moroso';
            const mensaje = `Hola ${c.nombre}!\n\nTe escribimos de *Streaming Mundial* para recordarte que tu suscripción de *${c.servicioPlataforma}* ${estaMoroso ? 'ha vencido' : 'vence el día de hoy'}.\n\nPuedes renovar tu servicio realizando el pago de *$${parseFloat(c.montoPago).toFixed(2)}* vía *${c.metodoPago || 'tu método habitual'}*.\n\n¡Quedamos atentos para renovar tu acceso!`;
            
            clientes[index].estadoAviso = 'avisado';
            guardarYRenderizarClientes();
            
            const urlWa = `https://api.whatsapp.com/send?phone=${c.telefono}&text=${encodeURIComponent(mensaje)}`;
            window.open(urlWa, '_blank');
            mostrarNotificacion('Recordatorio enviado', 'info');
        }
    };

    // ==========================================
    // 13. VISTA CONFIGURACIÓN / AJUSTES DE COSTOS
    // ==========================================
    const renderizarVistaCostos = () => {
        const contenedor = document.getElementById('contenedor-costos');
        if (!contenedor) return;
        
        const plataformas = ['Netflix', 'Max', 'Spotify', 'Disney+', 'Crunchyroll', 'YouTube Premium', 'Canva', 'CapCut', 'Amazon Prime', 'IPTV'];
        contenedor.innerHTML = '';
        
        contenedor.style.display = 'grid';
        contenedor.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
        contenedor.style.gap = '20px';
        
        plataformas.forEach(plat => {
            const costoActual = costosProveedores[plat] || 0;
            contenedor.innerHTML += `
                <div class="form-group" style="background: #F9FAFB; padding: 18px; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                    <label style="font-size: 0.9rem; color: #1F2937; margin-bottom: 10px; display: block; font-weight: 800; text-transform: uppercase;">${plat}</label>
                    <div class="input-icon-wrapper">
                        <i class="fa-solid fa-dollar-sign"></i>
                        <input type="number" step="0.01" min="0" id="costo-${plat.replace(/\s+/g, '')}" class="input-costo" data-plat="${plat}" value="${costoActual}" style="background: #FFFFFF;">
                    </div>
                </div>
            `;
        });
    };

    document.getElementById('btn-guardar-costos')?.addEventListener('click', () => {
        document.querySelectorAll('.input-costo').forEach(input => {
            const plat = input.getAttribute('data-plat');
            costosProveedores[plat] = parseFloat(input.value) || 0;
        });
        guardarNube();           
        actualizarDashboard();   
        mostrarNotificacion('Costos guardados y calculados', 'success');
    });

    // Arrancar la escucha en tiempo real (o lectura local)
    escucharNubeEnTiempoReal();
});