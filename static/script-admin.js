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
    const input = $(this).siblings('input');
    const icon = $(this).find('i');
    
    if (input.attr('type') === 'password') {
      input.attr('type', 'text');
      icon.removeClass('bi-eye').addClass('bi-eye-slash');
    } else {
      input.attr('type', 'password');
      icon.removeClass('bi-eye-slash').addClass('bi-eye');
    }
  });
   
  // forzar logour inactivo
  function forceLogoutInactive() {
    fetch('/force_logout_inactive', {
      method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
      showNotification(data.message, 'success');
      loadUsers(); // recarga la tabla de usuarios
    })
    .catch(err => {
      console.error(err);
      showNotification('Error al limpiar sesiones inactivas', 'error');
    });
  }
  
  // Función para activar/desactivar usuarios
  async function toggleUser(userId, isCurrentlyActive) {
    try {
      const response = await fetch(`/toggle_user/${userId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        showNotification('success', data.message);
        loadUsers(); // Recargar la lista de usuarios
      } else {
        showNotification('error', data.error || 'Error al cambiar el estado del usuario');
      }
    } catch (error) {
      console.error('Error:', error);
      showNotification('error', 'Error de conexión');
    }
  }
  
  // Función para cargar usuarios
  async function loadUsers() {
    try {
      $('.refresh-btn i').addClass('spin');
      const res = await fetch('/get_users');
      const users = await res.json();
      
      if (res.ok) {
        let tableContent = '';
        users.forEach(u => {
        tableContent += `
            <tr class="fade-in">
                <td>${u.id}</td>
                <td>${u.created_at || 'N/A'}</td>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td>
                    <span class="badge bg-${u.role === 'admin' ? 'primary' : 'info'}">
                        ${u.role === 'admin' ? 'Administrador' : 'Usuario'}
                    </span>
                </td>
                <td>
                    <span class="badge bg-${u.is_active ? 'success' : 'danger'}">
                        ${u.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td>
                    <span class="badge bg-${u.is_logged_in ? 'success' : 'secondary'}">
                        ${u.is_logged_in ? 'Conectado' : 'Desconectado'}
                    </span>
                </td>
                <td>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-${u.is_active ? 'warning' : 'success'}" 
                                onclick="toggleUser(${u.id}, ${u.is_active})">
                            <i class="bi bi-${u.is_active ? 'x-circle' : 'check-circle'} me-1"></i>
                            ${u.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button class="btn btn-sm btn-info" onclick="openChangePasswordModal(${u.id}, '${u.username}')">
                            <i class="bi bi-key me-1"></i>Contraseña
                        </button>
                    </div>
                </td>
            </tr>
        `;
        });
        $('#usersTable').html(tableContent);
      }
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      showNotification('error', 'Error al cargar usuarios');
    } finally {
      setTimeout(() => {
        $('.refresh-btn i').removeClass('spin');
      }, 500);
    }
  }
  
  // Efecto de spin para el botón de actualizar
  $.fn.extend({
    spin: function() {
      this.css('transform', 'rotate(360deg)');
      setTimeout(() => {
        this.css('transform', 'rotate(0deg)');
      }, 500);
    }
  });

  // Función para abrir el modal de cambio de contraseña
  function openChangePasswordModal(userId, username) {
    $('#currentUsername').text(username);
    $('#modalNewPassword').val('');
    $('#confirmPassword').val('');
    $('#passwordStrengthBar').css('width', '0%').removeClass('bg-danger bg-warning bg-success');
    $('#passwordHelp').text('La contraseña debe tener al menos 8 caracteres').removeClass('text-danger text-success');
    $('#passwordMatch').hide();
    $('#confirmPassword').removeClass('is-invalid');
    $('#changePasswordModal').data('userId', userId);
    $('#changePasswordModal').modal('show');
  }

  // Validación de fortaleza de contraseña
  $('#modalNewPassword').on('input', function() {
    const password = $(this).val();
    const strengthBar = $('#passwordStrengthBar');
    const helpText = $('#passwordHelp');
    
    // Validación de fortaleza
    if (password.length === 0) {
      strengthBar.css('width', '0%').removeClass('bg-danger bg-warning bg-success');
      helpText.text('La contraseña debe tener al menos 8 caracteres').removeClass('text-danger text-success');
    } else if (password.length < 8) {
      strengthBar.css('width', '30%').removeClass('bg-warning bg-success').addClass('bg-danger');
      helpText.text('Contraseña débil (mínimo 8 caracteres)').addClass('text-danger').removeClass('text-success');
    } else if (password.length < 12) {
      strengthBar.css('width', '60%').removeClass('bg-danger bg-success').addClass('bg-warning');
      helpText.text('Contraseña moderada (recomendado 12+ caracteres)').removeClass('text-danger text-success');
    } else {
      strengthBar.css('width', '100%').removeClass('bg-danger bg-warning').addClass('bg-success');
      helpText.text('Contraseña fuerte').addClass('text-success').removeClass('text-danger');
    }
    
    // Validar coincidencia de contraseñas
    validatePasswordMatch();
  });

  // Validar coincidencia de contraseñas
  $('#confirmPassword').on('input', validatePasswordMatch);

  function validatePasswordMatch() {
    const password = $('#modalNewPassword').val();
    const confirmPassword = $('#confirmPassword').val();
    
    if (confirmPassword.length > 0 && password !== confirmPassword) {
      $('#passwordMatch').show();
      $('#confirmPassword').addClass('is-invalid');
      $('#savePasswordBtn').prop('disabled', true);
    } else {
      $('#passwordMatch').hide();
      $('#confirmPassword').removeClass('is-invalid');
      $('#savePasswordBtn').prop('disabled', false);
    }
  }

  // Guardar nueva contraseña
  $('#savePasswordBtn').click(function() {
    const userId = $('#changePasswordModal').data('userId');
    const newPassword = $('#modalNewPassword').val();
    const confirmPassword = $('#confirmPassword').val();

    if (newPassword.trim() === '') {
      showNotification('error', 'Por favor, ingrese una nueva contraseña');
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification('error', 'Las contraseñas no coinciden');
      return;
    }

    if (newPassword.length < 8) {
      showNotification('error', 'La contraseña debe tener al menos 8 caracteres');
      return;
    }

    $.ajax({
      url: `/update_password/${userId}`,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ new_password: newPassword }),
      success: function(response) {
        showNotification('success', response.message);
        $('#changePasswordModal').modal('hide');
      },
      error: function(xhr) {
        const error = xhr.responseJSON ? xhr.responseJSON.error : 'Error desconocido';
        showNotification('error', `Error: ${error}`);
      }
    });
  });

  // Crear nuevo usuario
  document.getElementById('createUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const email = document.getElementById('newEmail').value;
    const role = document.getElementById('newRole').value;

    const res = await fetch('/create_user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email, role })
    });
    
    const data = await res.json();
    const msg = document.getElementById('createMsg');
    
    if (res.ok) {
      showNotification('success', data.message);
      e.target.reset();
      loadUsers();
    } else {
      showNotification('error', data.error);
    }
  });

  // Cerrar sesión
  async function logout() {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login.html';
  }

  // Limpiar modal al cerrar
  $('#changePasswordModal').on('hidden.bs.modal', function() {
    $('#modalNewPassword').val('');
    $('#confirmPassword').val('');
    $('#passwordStrengthBar').css('width', '0%').removeClass('bg-danger bg-warning bg-success');
    $('#passwordHelp').text('La contraseña debe tener al menos 8 caracteres').removeClass('text-danger text-success');
    $('#passwordMatch').hide();
    $('#confirmPassword').removeClass('is-invalid');
  });

  const role = $('#newRole').val();
if (role === 'prueba') {
  showNotification('warning', 'Este usuario tendrá acceso solo durante 7 días');
}

  // Cargar usuarios al iniciar
  $(document).ready(function() {
    loadUsers();
  });