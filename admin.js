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
    
    // NAVEGACIÓN SPA
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
        });
    });

    let clientes = [];
    let ingresosTotalesUSD = 0;
    let TASA_BCV = 0;

    async function obtenerTasaBCV() {
        try {
            const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            const datos = await respuesta.json();
            TASA_BCV = datos.promedio || datos.venta || 0;
        } catch (error) {
            console.error("Error API:", error);
            TASA_BCV = 0;
        }
        actualizarPantalla();
    }

    // ESCUCHADOR EN TIEMPO REAL
    function escucharNubeEnTiempoReal() {
        db.collection("cooperativa").doc("directorio").onSnapshot((docSnap) => {
            if (docSnap.exists) {
                const data = docSnap.data();
                clientes = data.listaAfiliados || [];
                ingresosTotalesUSD = data.ingresosUSD || 0;
                actualizarPantalla();
            }
        }, (error) => {
            console.error("Error escuchando Firebase:", error);
        });
        obtenerTasaBCV();
    }

    async function guardarNube() {
    try {
        await db.collection("cooperativa").doc("directorio").set({
            listaAfiliados: clientes,
            ingresosUSD: ingresosTotalesUSD
        });
        console.log("¡Datos guardados exitosamente en la nube!");
    } catch (error) {
        console.error("Error detallado de Firebase:", error);
        // Esto te mostrará el error exacto en una alerta flotante en la página
        alert("⚠️ Error al guardar en Firebase: " + error.message);
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
            grid.innerHTML += `
                <div class="cliente-card card-revision">
                    <h3 style="margin:0; font-size:1.1rem;">${c.nombre}</h3>
                    <p style="margin:5px 0; font-size:0.85rem; color:#4B5563;">C.I: ${c.cedula} | Monto: <strong style="color:#006412;">$${c.montoPendiente}</strong></p>
                    <button class="btn-accion-cliente" onclick="aprobarPago(${c.id})" style="background:#006412; color:white; border:none; margin-top:10px;"><i class="fa-solid fa-check"></i> Aprobar Pago</button>
                </div>
            `;
        });
    };

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
                            <p style="margin:2px 0 0 0; font-size:0.8rem; color:#6B7280;">C.I: ${c.cedula}</p>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge ${badgeClass}">${estadoTexto}</span>
                            <button onclick="confirmarEliminar(${c.id})" style="background:none; border:none; color:#EF4444; cursor:pointer;"><i class="fa-solid fa-trash"></i></button>
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

    window.aprobarPago = (id) => {
        const index = clientes.findIndex(c => c.id === id);
        if(index > -1) {
            const montoReportado = parseFloat(clientes[index].montoPendiente || 0);
            ingresosTotalesUSD += montoReportado;
            clientes[index].montoAprobadoHistorial = (clientes[index].montoAprobadoHistorial || 0) + montoReportado;
            clientes[index].estado = 'aldia';
            clientes[index].montoPendiente = 0;
            
            // CORRECCIÓN: Manejo correcto del tiempo sumando los 28 días exactos en milisegundos
            let baseTime = clientes[index].fechaVencimiento;
            if(baseTime < Date.now()) {
                baseTime = Date.now();
            }
            clientes[index].fechaVencimiento = baseTime + (28 * 24 * 60 * 60 * 1000);
            
            guardarNube();
        }
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
            const clienteABorrar = clientes.find(c => c.id === clienteEliminarId);
            if (clienteABorrar && clienteABorrar.montoAprobadoHistorial) {
                ingresosTotalesUSD -= parseFloat(clienteABorrar.montoAprobadoHistorial);
            }
            clientes = clientes.filter(c => c.id !== clienteEliminarId);
            guardarNube();
            if(modalEliminar) modalEliminar.style.display = 'none';
        }
    });

    const formCliente = document.getElementById('form-cliente');
    const inputNumFam = document.getElementById('cli-fam');
    const contenedorFam = document.getElementById('contenedor-familiares');

    if(inputNumFam) {
        inputNumFam.addEventListener('input', (e) => {
            contenedorFam.innerHTML = '';
            const num = parseInt(e.target.value) || 0;
            if (num > 0) {
                for (let i = 1; i <= num; i++) {
                    const row = document.createElement('div');
                    row.className = 'familiar-row';
                    row.style.cssText = 'display:flex; gap:10px; margin-bottom:5px;';
                    row.innerHTML = `<input type="text" placeholder="Familiar ${i}" class="fam-nombre input-form" required><input type="text" placeholder="Parentesco" class="fam-parentesco input-form" required>`;
                    contenedorFam.appendChild(row);
                }
            }
        });
    }

    document.getElementById('btn-agregar-cliente')?.addEventListener('click', () => {
        if(formCliente) formCliente.reset();
        if(contenedorFam) contenedorFam.innerHTML = '';
        
        // PREDETERMINAR FECHA DE HOY + 28 DÍAS EN EL INPUT
        const inputFecha = document.getElementById('cli-vence');
        if (inputFecha) {
            const hoyMas28 = new Date(Date.now() + (28 * 24 * 60 * 60 * 1000));
            const yyyy = hoyMas28.getFullYear();
            const mm = String(hoyMas28.getMonth() + 1).padStart(2, '0');
            const dd = String(hoyMas28.getDate()).padStart(2, '0');
            inputFecha.value = `${yyyy}-${mm}-${dd}`;
        }

        const modal = document.getElementById('modal-cliente');
        if(modal) modal.style.display = 'flex';
    });

    document.getElementById('cerrar-modal-cliente')?.addEventListener('click', () => {
        const modal = document.getElementById('modal-cliente');
        if(modal) modal.style.display = 'none';
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
                // Si no selecciona ninguna, por defecto sumamos 28 días desde hoy
                timestampVencimiento = Date.now() + (28 * 24 * 60 * 60 * 1000);
            }

            const familiaresFilas = contenedorFam.querySelectorAll('.familiar-row');
            const listaFamiliares = [];
            familiaresFilas.forEach(row => {
                const nom = row.querySelector('.fam-nombre').value.trim();
                const par = row.querySelector('.fam-parentesco').value.trim();
                if (nom) listaFamiliares.push({ nombre: nom, parentesco: par });
            });

            clientes.push({
                id: Date.now(),
                nombre: document.getElementById('cli-nombre').value.trim(),
                cedula: document.getElementById('cli-cedula').value.trim(),
                contrato: document.getElementById('cli-contrato').value.trim(),
                familiaresCount: listaFamiliares.length,
                familiaresLista: listaFamiliares,
                fechaVencimiento: timestampVencimiento,
                estado: 'aldia',
                montoPendiente: 0
            });

            formCliente.reset();
            if(contenedorFam) contenedorFam.innerHTML = '';
            document.getElementById('modal-cliente').style.display = 'none';
            guardarNube();
        });
    }

    const btnExportar = document.getElementById('btn-exportar-excel');
    if (btnExportar) {
        btnExportar.addEventListener('click', () => {
            if (clientes.length === 0) return alert('No hay afiliados para exportar.');
            const datosExcel = clientes.map(c => ({
                "N° Contrato": c.contrato || 'N/A', "Cédula": c.cedula || 'N/A',
                "Nombre": c.nombre || 'N/A', "Familiares": c.familiaresCount || 0,
                "Estado": c.estado === 'aldia' ? 'Al Día' : (c.estado === 'revision' ? 'En Revisión' : 'Atrasado')
            }));
            if (typeof XLSX !== 'undefined') {
                const hoja = XLSX.utils.json_to_sheet(datosExcel);
                const libro = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(libro, hoja, "Afiliados");
                XLSX.writeFile(libro, "Reporte_Afiliados.xlsx");
            }
        });
    }

    escucharNubeEnTiempoReal();
});