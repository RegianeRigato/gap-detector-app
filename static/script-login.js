 // Mostrar notificación
 function showNotification(type, message) {
    const icons = {
      success: 'bi-check-circle',
      error: 'bi-exclamation-triangle',
      warning: 'bi-exclamation-circle'
    };
    
    const notification = $(`
      <div class="notification ${type}">
        <i class="bi ${icons[type]}"></i>
        ${message}
      </div>
    `);
    
    $('#notificationContainer').append(notification);
    
    setTimeout(() => {
      notification.addClass('show');
    }, 10);
    
    setTimeout(() => {
      notification.removeClass('show');
      setTimeout(() => notification.remove(), 400);
    }, 5000);
  }

  // Toggle para mostrar/ocultar contraseña
  $(document).on('click', '.toggle-password', function() {
    const input = $(this).closest('.input-group').find('input');
    const icon = $(this).find('i');
    
    if (input.attr('type') === 'password') {
      input.attr('type', 'text');
      icon.removeClass('bi-eye').addClass('bi-eye-slash');
    } else {
      input.attr('type', 'password');
      icon.removeClass('bi-eye-slash').addClass('bi-eye');
    }
  });

  // Cambiar tema claro/oscuro
  function setTheme(isDark) {
    if (isDark) {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      $('#themeIcon').removeClass('bi-moon-fill').addClass('bi-sun-fill');
    } else {
      document.documentElement.removeAttribute('data-bs-theme');
      localStorage.setItem('theme', 'light');
      $('#themeIcon').removeClass('bi-sun-fill').addClass('bi-moon-fill');
    }
  }

  // Verificar preferencia de tema al cargar
  $(document).ready(function() {
    const savedTheme = localStorage.getItem('theme') || 
                      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme === 'dark');
    
    // Alternar tema al hacer clic
    $('#themeToggle').click(function() {
      const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
      setTheme(!isDark);
    });
  });

  // Login form
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const msg = document.getElementById('msg');
  msg.innerHTML = '';

  try {
      const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok) {
          showNotification('success', 'Inicio de sesión exitoso');
          setTimeout(() => {
              if (data.role === 'admin') {
                  window.location.href = '/admin.html';
              } else {
                  window.location.href = '/index.html';
              }
          }, 1000);
      } else {
          showNotification('error', data.error || 'Credenciales inválidas');
      }
  } catch (error) {
      console.error('Error:', error);
      showNotification('error', 'Error de conexión');
  }
});