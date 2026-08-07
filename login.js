document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('form-login');
    const inputUsuario = document.getElementById('usuario');
    const inputPassword = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault(); 
            
            const usuarioVal = inputUsuario.value.trim().toLowerCase();
            const passwordVal = inputPassword.value.trim();

            if (errorMessage) {
                errorMessage.style.display = 'none';
                errorMessage.textContent = '';
            }

            // Detección automática por credenciales sin necesidad de desplegables
            if (passwordVal === 'admin123' || usuarioVal === 'admin') {
                localStorage.setItem('rolActivo', 'admin');
                window.location.href = 'admin.html';
            } 
            else if (passwordVal === 'secre123' || usuarioVal === 'secretaria' || usuarioVal === 'secre') {
                localStorage.setItem('rolActivo', 'secretaria');
                window.location.href = 'usuario.html';
            } 
            else {
                mostrarError('Credenciales incorrectas. Verifica tu usuario y contraseña.');
            }
        });
    }

    function mostrarError(mensaje) {
        if (errorMessage) {
            errorMessage.textContent = mensaje;
            errorMessage.style.display = 'block';
        }
    }
});