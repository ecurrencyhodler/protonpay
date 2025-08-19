// Options page JavaScript for ProtonPay
class ProtonPayOptions {
  constructor() {
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadProfile();
  }

  bindEvents() {
    // Profile form
    document.getElementById('profile-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleProfileUpdate();
    });

    // Password form
    document.getElementById('password-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handlePasswordChange();
    });

    // Delete account
    document.getElementById('delete-account-btn').addEventListener('click', () => {
      this.showDeleteModal();
    });

    // Modal actions
    document.getElementById('confirm-delete').addEventListener('click', () => {
      this.handleAccountDeletion();
    });

    document.getElementById('cancel-delete').addEventListener('click', () => {
      this.hideDeleteModal();
    });

    // Close modal when clicking outside
    document.getElementById('delete-modal').addEventListener('click', (e) => {
      if (e.target.id === 'delete-modal') {
        this.hideDeleteModal();
      }
    });
  }

  async loadProfile() {
    try {
      const response = await this.sendMessage('getSession');
      if (response.success && response.data) {
        const profile = response.data;
        document.getElementById('name').value = profile.name || '';
        document.getElementById('email').value = profile.email || '';
      } else {
        // Redirect to login if no session
        window.location.href = 'popup.html';
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      this.showMessage('profile-message', 'Failed to load profile', 'error');
    }
  }

  async handleProfileUpdate() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const messageElement = document.getElementById('profile-message');

    if (!name || !email) {
      this.showMessage(messageElement, 'Please fill in all fields', 'error');
      return;
    }

    try {
      this.showLoading('profile-form', 'Updating...');
      const response = await this.sendMessage('updateProfile', { 
        profile: { name, email } 
      });
      
      if (response.success) {
        this.showMessage(messageElement, 'Profile updated successfully!', 'success');
      } else {
        this.showMessage(messageElement, response.error, 'error');
      }
    } catch (error) {
      this.showMessage(messageElement, 'Failed to update profile. Please try again.', 'error');
    } finally {
      this.hideLoading('profile-form', 'Update Profile');
    }
  }

  async handlePasswordChange() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const messageElement = document.getElementById('password-message');

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.showMessage(messageElement, 'Please fill in all fields', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.showMessage(messageElement, 'New passwords do not match', 'error');
      return;
    }

    if (newPassword.length < 8) {
      this.showMessage(messageElement, 'Password must be at least 8 characters long', 'error');
      return;
    }

    try {
      this.showLoading('password-form', 'Changing password...');
      const response = await this.sendMessage('changePassword', { 
        currentPassword, 
        newPassword 
      });
      
      if (response.success) {
        this.showMessage(messageElement, 'Password changed successfully!', 'success');
        document.getElementById('password-form').reset();
      } else {
        this.showMessage(messageElement, response.error, 'error');
      }
    } catch (error) {
      this.showMessage(messageElement, 'Failed to change password. Please try again.', 'error');
    } finally {
      this.hideLoading('password-form', 'Change Password');
    }
  }

  async handleAccountDeletion() {
    try {
      this.showLoading('confirm-delete', 'Deleting account...');
      const response = await this.sendMessage('deleteAccount');
      
      if (response.success) {
        this.hideDeleteModal();
        this.showDeletionSuccess();
      } else {
        this.showMessage(document.getElementById('password-message'), response.error, 'error');
        this.hideLoading('confirm-delete', 'Yes, Delete My Account');
      }
    } catch (error) {
      this.showMessage(document.getElementById('password-message'), 'Failed to delete account. Please try again.', 'error');
      this.hideLoading('confirm-delete', 'Yes, Delete My Account');
    }
  }

  showDeleteModal() {
    document.getElementById('delete-modal').classList.remove('hidden');
  }

  hideDeleteModal() {
    document.getElementById('delete-modal').classList.add('hidden');
  }

  showDeletionSuccess() {
    const container = document.querySelector('.container');
    container.innerHTML = `
      <div class="header">
        <h1>⚡ Account Deleted</h1>
        <p>Your account has been successfully deleted</p>
      </div>
      <div class="section" style="text-align: center;">
        <p>All your data has been permanently removed.</p>
        <p>Thank you for using Voltage Lightning Wallet.</p>
        <button onclick="window.close()" class="btn btn-primary" style="margin-top: 20px;">
          Close
        </button>
      </div>
    `;
  }

  async sendMessage(action, data = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  showLoading(formId, loadingText) {
    const form = document.getElementById(formId);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = loadingText;
    } else {
      // For delete button
      const btn = document.getElementById(formId);
      btn.disabled = true;
      btn.textContent = loadingText;
    }
  }

  hideLoading(formId, originalText) {
    const form = document.getElementById(formId);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    } else {
      // For delete button
      const btn = document.getElementById(formId);
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  showMessage(element, message, type = 'info') {
    element.textContent = message;
    element.classList.remove('hidden');
    element.className = element.className.replace(/success|error|info/g, '') + ` ${type}`;
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        element.classList.add('hidden');
      }, 3000);
    }
  }
}

// Initialize options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ProtonPayOptions();
});
