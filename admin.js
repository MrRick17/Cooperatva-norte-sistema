document.addEventListener('DOMContentLoaded', () => {
    
    // 1. NAVEGACIÓN SPA
    const navItems = document.querySelectorAll('.nav-item[data-vista]');
    const vistas = document.querySelectorAll('.vista-seccion');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            const destino = item.getAttribute('data-vista');
            vistas.forEach(v => v.style.display = 'none');
            document.getElementById(`vista-${destino}`).style.display = 'block';
        });
    });

    // 2. DATA Y VARIABLES GLOBALES
    let clientes = JSON.parse(localStorage.getItem('coop_clientes')) || [];
    let ingresosTotalesUSD = parseFloat(localStorage.getItem('coop_ingresos')) || 0;
    let TASA_BCV = 0;

    // Conexión con la API oficial del BCV en tiempo real
    async function obtenerTasaBCV() {
        try {
            const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            const datos = await respuesta.json();
            TASA_BCV = datos.promedio || datos.venta || 0;
        } catch (error) {
            console.error("Error consultando la tasa BCV:", error);
            TASA_BCV = 0; // Respaldo en caso de caída
        }
        actualizarTodo();
    }

    const actualizarTodo = () => {
        const ahora = Date.now();
        clientes.forEach(c => {
            if (c.estado === 'aldia' && ahora > c.fechaVencimiento) c.estado = 'atrasado';
        });
        localStorage.setItem('coop_clientes', JSON.stringify(clientes));
        localStorage.setItem('coop_ingresos', ingresosTotalesUSD);

        // Cálculos del Dashboard
        const enRevision = clientes.filter(c => c.estado === 'revision');
        
        // Renderizar el KPI de ingresos con la conversión a Bolívares
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

        document.getElementById('kpi-revisiones').textContent = enRevision.length;
        document.getElementById('kpi-afiliados').textContent = clientes.length;

        renderizarRevisiones(enRevision);
        renderizarDirectorio();
    };

    const renderizarRevisiones = (lista) => {
        const grid = document.getElementById('grid-admin-revisiones');
        grid.innerHTML = '';
        if(lista.length === 0) {
            grid.innerHTML = '<p style="color:#6B7280; grid-column:1/-1;">No hay pagos pendientes por revisar.</p>';
            return;
        }

        lista.forEach(c => {
            grid.innerHTML += `
                <div class="cliente-card card-revision">
                    <h3 style="margin:0; font-size:1.1rem;">${c.nombre}</h3>
                    <p style="margin:5px 0; font-size:0.85rem; color:#4B5563;">C.I: ${c.cedula} | Monto Reportado: <strong style="color:#006412;">$${c.montoPendiente}</strong></p>
                    <button class="btn-accion-cliente" onclick="aprobarPago(${c.id})" style="background:#006412; color:white; border:none; margin-top:10px;"><i class="fa-solid fa-check"></i> Aprobar Pago</button>
                </div>
            `;
        });
    };

    const renderizarDirectorio = () => {
        const grid = document.getElementById('grid-admin-clientes');
        grid.innerHTML = '';
        if(clientes.length === 0) {
            grid.innerHTML = '<p style="color:#6B7280; grid-column:1/-1;">No hay afiliados registrados en el sistema.</p>';
            return;
        }

        clientes.forEach(c => {
            let estadoTexto = c.estado === 'aldia' ? 'Al Día' : (c.estado === 'revision' ? 'En Revisión' : 'Atrasado');
            let badgeClass = c.estado === 'aldia' ? 'badge-aldia' : (c.estado === 'revision' ? 'badge-revision' : 'badge-vencida');
            
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
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <h3 style="margin:0; font-size:1.1rem; color:#1F2937;">${c.nombre}</h3>
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">Contrato: ${c.contrato} | C.I: ${c.cedula}</p>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge ${badgeClass}">${estadoTexto}</span>
                            <button onclick="confirmarEliminar(${c.id})" style="background:none; border:none; color:#EF4444; cursor:pointer; font-size:1rem; padding:2px;" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    
                    <div class="cliente-servicios" style="background:#F9FAFB; padding:10px; border-radius:8px; margin-top:12px;">
                        <p style="margin:0; font-size:0.82rem;"><i class="fa-solid fa-calendar" style="color:#006412;"></i> Vence: <strong>${new Date(c.fechaVencimiento).toLocaleDateString('es-ES')}</strong></p>
                        ${familiaresHTML}
                    </div>
                </div>
            `;
        });
    };

    // APROBAR PAGO
    window.aprobarPago = (id) => {
        const index = clientes.findIndex(c => c.id === id);
        if(index > -1) {
            const montoReportado = parseFloat(clientes[index].montoPendiente || 0);
            ingresosTotalesUSD += montoReportado;
            
            clientes[index].montoAprobadoHistorial = (clientes[index].montoAprobadoHistorial || 0) + montoReportado;
            clientes[index].estado = 'aldia';
            clientes[index].montoPendiente = 0;
            
            let date = new Date(clientes[index].fechaVencimiento);
            if(date.getTime() < Date.now()) date = new Date();
            date.setDate(date.getDate() + 28);
            clientes[index].fechaVencimiento = date.getTime();
            
            actualizarTodo();
        }
    };

    // ELIMINAR AFILIADO
    let clienteEliminarId = null;
    const modalEliminar = document.getElementById('modal-eliminar-afiliado');

    window.confirmarEliminar = (id) => {
        clienteEliminarId = id;
        modalEliminar.style.display = 'flex';
    };

    document.getElementById('btn-cancelar-eliminar').addEventListener('click', () => {
        modalEliminar.style.display = 'none';
        clienteEliminarId = null;
    });

    document.getElementById('btn-confirmar-eliminar').addEventListener('click', () => {
        if(clienteEliminarId) {
            const clienteABorrar = clientes.find(c => c.id === clienteEliminarId);
            if (clienteABorrar && clienteABorrar.montoAprobadoHistorial) {
                ingresosTotalesUSD -= parseFloat(clienteABorrar.montoAprobadoHistorial);
            }
            clientes = clientes.filter(c => c.id !== clienteEliminarId);
            actualizarTodo();
            modalEliminar.style.display = 'none';
            clienteEliminarId = null;
        }
    });

    // GENERADOR DINÁMICO DE CAMPOS DE FAMILIARES
    const inputNumFam = document.getElementById('cli-fam');
    const contenedorFam = document.getElementById('contenedor-familiares');

    const generarCamposFamiliares = (cantidad) => {
        contenedorFam.innerHTML = '';
        const num = parseInt(cantidad) || 0;

        if (num > 0) {
            const titulo = document.createElement('h4');
            titulo.textContent = 'Datos de los Familiares';
            titulo.style.cssText = 'font-size:0.85rem; color:#006412; margin-top:5px; border-bottom:1px solid #E5E7EB; padding-bottom:4px;';
            contenedorFam.appendChild(titulo);

            for (let i = 1; i <= num; i++) {
                const row = document.createElement('div');
                row.className = 'familiar-row';
                row.style.cssText = 'display:flex; gap:10px; background:#F9FAFB; padding:10px; border-radius:8px; border:1px solid #E5E7EB;';
                row.innerHTML = `
                    <div style="flex:1;">
                        <input type="text" placeholder="Nombre Familiar ${i}" class="fam-nombre input-form" required style="font-size:0.82rem; padding:8px;">
                    </div>
                    <div style="flex:1;">
                        <input type="text" placeholder="Parentesco (Ej. Hijo/a)" class="fam-parentesco input-form" required style="font-size:0.82rem; padding:8px;">
                    </div>
                `;
                contenedorFam.appendChild(row);
            }
        }
    };

    inputNumFam.addEventListener('input', (e) => generarCamposFamiliares(e.target.value));

    // MODAL Y FORMULARIO AGREGAR CLIENTE
    const modal = document.getElementById('modal-cliente');
    document.getElementById('btn-agregar-cliente').addEventListener('click', () => {
        document.getElementById('form-cliente').reset();
        contenedorFam.innerHTML = '';
        
        const def = new Date();
        def.setDate(def.getDate() + 28);
        const yyyy = def.getFullYear();
        const mm = String(def.getMonth() + 1).padStart(2, '0');
        const dd = String(def.getDate()).padStart(2, '0');
        document.getElementById('cli-vence').value = `${yyyy}-${mm}-${dd}`;

        modal.style.display = 'flex';
    });

    document.getElementById('cerrar-modal-cliente').addEventListener('click', () => modal.style.display = 'none');

    document.getElementById('form-cliente').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const fechaInput = document.getElementById('cli-vence').value;
        const [y, m, d] = fechaInput.split('-');

        const familiaresFilas = contenedorFam.querySelectorAll('.familiar-row');
        const listaFamiliares = [];
        familiaresFilas.forEach(row => {
            const nom = row.querySelector('.fam-nombre').value.trim();
            const par = row.querySelector('.fam-parentesco').value.trim();
            if (nom) listaFamiliares.push({ nombre: nom, parentesco: par });
        });

        const nuevo = {
            id: Date.now(),
            nombre: document.getElementById('cli-nombre').value.trim(),
            cedula: document.getElementById('cli-cedula').value.trim(),
            contrato: document.getElementById('cli-contrato').value.trim(),
            familiaresCount: listaFamiliares.length,
            familiaresLista: listaFamiliares,
            fechaVencimiento: new Date(y, m-1, d, 23, 59, 59).getTime(),
            estado: 'aldia',
            montoPendiente: 0
        };

        clientes.push(nuevo);
        document.getElementById('form-cliente').reset();
        contenedorFam.innerHTML = '';
        modal.style.display = 'none';
        actualizarTodo();
    });

    // Arrancar solicitando la tasa oficial
    obtenerTasaBCV();
});