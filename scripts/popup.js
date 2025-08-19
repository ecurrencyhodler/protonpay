// Popup JavaScript for ProtonPay
class ProtonPayPopup {
  constructor() {
    this.currentScreen = 'login';
    this.currentPaymentId = null;
    this.pollingInterval = null;
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.checkSession();
  }

  bindEvents() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // Navigation buttons
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.handleLogout();
    });

    document.getElementById('send-btn').addEventListener('click', () => {
      this.showScreen('send');
    });

    document.getElementById('receive-btn').addEventListener('click', () => {
      this.showScreen('receive');
    });

    document.getElementById('back-to-dashboard').addEventListener('click', () => {
      this.showScreen('dashboard');
    });

    document.getElementById('back-to-dashboard-receive').addEventListener('click', () => {
      this.showScreen('dashboard');
    });



    // Send payment form
    document.getElementById('send-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSendPayment();
    });

    // Receive payment form
    document.getElementById('receive-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleReceivePayment();
    });

    // Copy invoice button
    document.getElementById('copy-invoice').addEventListener('click', () => {
      this.copyInvoice();
    });

    // Open in window button
    const openWindowBtn = document.getElementById('open-window-btn');
    if (openWindowBtn) {
      openWindowBtn.addEventListener('click', () => {
        this.openInWindow();
      });
    }

  }

  async checkSession() {
    try {
      const response = await this.sendMessage('getSession');
      if (response.success && response.data) {
        this.showScreen('dashboard');
        await this.loadDashboard();
      } else {
        this.showScreen('login');
      }
    } catch (error) {
      console.error('Session check failed:', error);
      this.showScreen('login');
    }
  }

  async handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');

    try {
      this.showLoading('login-form', 'Logging in...');
      const response = await this.sendMessage('login', { email, password });
      
      if (response.success) {
        this.showScreen('dashboard');
        await this.loadDashboard();
      } else {
        this.showError(errorElement, response.error);
      }
    } catch (error) {
      this.showError(errorElement, 'Login failed. Please try again.');
    } finally {
      this.hideLoading('login-form', 'Login');
    }
  }

  async handleLogout() {
    try {
      await this.sendMessage('logout');
      this.showScreen('login');
      this.clearForms();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  async loadDashboard() {
    await Promise.all([
      this.loadBalance(),
      this.loadTransactions()
    ]);
  }

  async loadBalance() {
    try {
      const response = await this.sendMessage('getBalance');
      
      if (response.success && response.data) {
        // Handle the case where balance might be 0 (which is falsy)
        const balanceValue = response.data.balance;
        
        if (balanceValue !== undefined && balanceValue !== null) {
          const balance = balanceValue.toLocaleString();
          document.getElementById('balance-amount').textContent = balance;
        } else {
          document.getElementById('balance-amount').textContent = '0';
        }
      } else {
        document.getElementById('balance-amount').textContent = '0';
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
      document.getElementById('balance-amount').textContent = '0';
    }
  }

  async loadTransactions() {
    const transactionsList = document.getElementById('transactions-list');
    
    try {
      const response = await this.sendMessage('getTransactionHistory');
      if (response.success) {
        this.renderTransactions(response.data.transactions || []);
      } else {
        transactionsList.innerHTML = '<div class="error">Failed to load transactions</div>';
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      transactionsList.innerHTML = '<div class="error">Failed to load transactions</div>';
    }
  }

  renderTransactions(transactions) {
    const transactionsList = document.getElementById('transactions-list');
    
    if (transactions.length === 0) {
      transactionsList.innerHTML = '<div class="empty">No transactions yet</div>';
      return;
    }

    const html = transactions.map(tx => `
      <div class="transaction-item">
        <div class="transaction-details">
          <div class="transaction-description">${tx.description || 'Payment'}</div>
          <div class="transaction-date">${this.formatDate(tx.created_at)}</div>
        </div>
        <div class="transaction-amount ${tx.type === 'SENT' ? 'sent' : 'received'}">
          ${tx.type === 'SENT' ? '-' : '+'}${tx.amount} sats
        </div>
      </div>
    `).join('');

    transactionsList.innerHTML = html;
  }

  async handleSendPayment() {
    const invoice = document.getElementById('invoice').value.trim();
    const statusElement = document.getElementById('send-status');

    if (!invoice) {
      this.showError(statusElement, 'Please enter a Lightning invoice');
      return;
    }

    try {
      this.showLoading('send-form', 'Sending payment...');
      const response = await this.sendMessage('sendPayment', { invoice });
      
      if (response.success) {
        this.currentPaymentId = response.data.paymentId;
        this.startPaymentPolling(this.currentPaymentId, 'send');
        this.showStatus(statusElement, 'Payment sent! Checking status...', 'info');
      } else {
        this.showError(statusElement, response.error);
      }
    } catch (error) {
      this.showError(statusElement, 'Failed to send payment. Please try again.');
    } finally {
      this.hideLoading('send-form', 'Send Payment');
    }
  }

  async handleReceivePayment() {
    const amount = parseInt(document.getElementById('amount').value);
    const description = document.getElementById('description').value.trim();

    if (!amount || amount <= 0) {
      this.showError(document.getElementById('payment-status'), 'Please enter a valid amount');
      return;
    }

    try {
      this.showLoading('receive-form', 'Generating invoice...');
      console.log('Sending createInvoice message with:', { amount, description });
      const response = await this.sendMessage('createInvoice', { amount, description });
      console.log('Received response:', response);
      
      if (response.success) {
        console.log('Invoice creation successful, displaying invoice:', response.data);
        this.displayInvoice(response.data);
        this.currentPaymentId = response.data.paymentId;
        this.startPaymentPolling(this.currentPaymentId, 'receive');
      } else {
        console.error('Invoice creation failed:', response.error);
        this.showError(document.getElementById('payment-status'), response.error);
      }
    } catch (error) {
      console.error('Exception during invoice creation:', error);
      this.showError(document.getElementById('payment-status'), 'Failed to generate invoice. Please try again.');
    } finally {
      this.hideLoading('receive-form', 'Generate Invoice');
    }
  }

  displayInvoice(invoiceData) {
    const invoiceDisplay = document.getElementById('invoice-display');
    const invoiceText = document.getElementById('invoice-text');
    const paymentStatus = document.getElementById('payment-status');

    console.log('Displaying invoice:', invoiceData);

    invoiceText.value = invoiceData.payment_request;

    // Show demo mode warning if applicable
    if (invoiceData.demo) {
      this.showStatus(paymentStatus, 
        invoiceData.warning || 'Demo mode: This is a test invoice for demonstration purposes', 
        'info'
      );
    } else {
      paymentStatus.textContent = '';
      paymentStatus.classList.add('hidden');
    }

    invoiceDisplay.classList.remove('hidden');
  }

  copyInvoice() {
    const invoiceText = document.getElementById('invoice-text');
    invoiceText.select();
    document.execCommand('copy');
    
    const button = document.getElementById('copy-invoice');
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  }

  startPaymentPolling(paymentId, type) {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    let pollCount = 0;
    const maxPolls = 10; // Reduced from 15 to 10 attempts
    let pollInterval = 3000; // Start with 3 seconds (increased from 2 seconds)

    const poll = async () => {
      try {
        pollCount++;
        
        // Stop polling after max attempts to prevent infinite polling
        if (pollCount > maxPolls) {
          console.log(`Stopping polling for ${paymentId} after ${maxPolls} attempts (${maxPolls * 3}s total)`);
          this.stopPaymentPolling();
          return;
        }

        const response = await this.sendMessage('getPaymentStatus', { paymentId });
        
        if (response.success) {
          const status = response.data.state;
          
          if (status === 'completed' || status === 'COMPLETED' || status === 'paid' || status === 'PAID' || status === 'settled' || status === 'SETTLED' || status === 'success' || status === 'SUCCESS') {
            this.stopPaymentPolling();
            this.showPaymentSuccess(type);
            await this.loadDashboard(); // Refresh balance and transactions
          } else if (status === 'failed' || status === 'FAILED' || status === 'error' || status === 'ERROR') {
            this.stopPaymentPolling();
            this.showPaymentError(type, response.data.error || 'Payment failed');
          } else {
            // Continue polling with exponential backoff
            pollInterval = Math.min(pollInterval * 1.2, 8000); // Max 8 seconds
            this.pollingInterval = setTimeout(poll, pollInterval);
          }
        }
      } catch (error) {
        console.error('Payment polling error:', error);
        // Stop polling on repeated errors
        if (pollCount > 2) { // Reduced from 3 to 2
          this.stopPaymentPolling();
          this.showPaymentError(type, 'Payment status check failed');
        } else {
          // Retry with increased interval on errors
          pollInterval = Math.min(pollInterval * 2, 8000);
          this.pollingInterval = setTimeout(poll, pollInterval);
        }
      }
    };

    // Start polling
    this.pollingInterval = setTimeout(poll, pollInterval);
  }

  stopPaymentPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  showPaymentSuccess(type) {
    const statusElement = type === 'send' ? 
      document.getElementById('send-status') : 
      document.getElementById('payment-status');
    
    this.showStatus(statusElement, 
      type === 'send' ? 'Payment completed successfully!' : 'Payment received!', 
      'success'
    );
  }

  showPaymentError(type, error) {
    const statusElement = type === 'send' ? 
      document.getElementById('send-status') : 
      document.getElementById('payment-status');
    
    this.showError(statusElement, error);
  }

  showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.add('hidden');
    });

    // Show target screen
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
    this.currentScreen = screenName;

    // Clear forms when switching screens
    if (screenName === 'login') {
      this.clearForms();
    }
  }

  clearForms() {
    document.getElementById('login-form').reset();
    document.getElementById('send-form').reset();
    document.getElementById('receive-form').reset();
    document.getElementById('invoice-display').classList.add('hidden');
    document.getElementById('send-status').classList.add('hidden');
    document.getElementById('payment-status').textContent = '';
    document.getElementById('login-error').classList.add('hidden');
  }

  async sendMessage(action, data = {}) {
    // Check if we're running in Chrome extension context
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, ...data }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    } else {
      // Standalone mode - make direct API calls
      return this.makeDirectApiCall(action, data);
    }
  }

  async makeDirectApiCall(action, data = {}) {
    const baseUrl = 'http://localhost:3000';
    
    try {
      switch (action) {
        case 'login':
          const loginResponse = await fetch(`${baseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: data.email, password: data.password })
          });
          const loginData = await loginResponse.json();
          if (!loginResponse.ok) throw new Error(loginData.message);
          
          // Store session in localStorage for standalone mode
          localStorage.setItem('protonpay_session', JSON.stringify(loginData));
          return { success: true, data: loginData };

        case 'logout':
          localStorage.removeItem('protonpay_session');
          return { success: true };

        case 'getSession':
          const session = localStorage.getItem('protonpay_session');
          return { success: true, data: session ? JSON.parse(session) : null };

        case 'clearSession':
          localStorage.removeItem('protonpay_session');
          return { success: true };

        case 'getBalance':
          const balanceSession = JSON.parse(localStorage.getItem('protonpay_session') || '{}');
          if (!balanceSession.token) throw new Error('No authentication token');
          
          const balanceResponse = await fetch(`${baseUrl}/wallet/balance`, {
            headers: { 'Authorization': `Bearer ${balanceSession.token}` }
          });
          const balanceData = await balanceResponse.json();
          if (!balanceResponse.ok) throw new Error(balanceData.message);
          return { success: true, data: balanceData };

        case 'getTransactionHistory':
          const txSession = JSON.parse(localStorage.getItem('protonpay_session') || '{}');
          if (!txSession.token) throw new Error('No authentication token');
          
          const txResponse = await fetch(`${baseUrl}/wallet/transactions`, {
            headers: { 'Authorization': `Bearer ${txSession.token}` }
          });
          const txData = await txResponse.json();
          if (!txResponse.ok) throw new Error(txData.message);
          return { success: true, data: txData };

        case 'createInvoice':
          const invoiceSession = JSON.parse(localStorage.getItem('protonpay_session') || '{}');
          if (!invoiceSession.token) throw new Error('No authentication token');
          
          const invoiceResponse = await fetch(`${baseUrl}/payments/receive`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${invoiceSession.token}` 
            },
            body: JSON.stringify({ amount: data.amount, description: data.description })
          });
          const invoiceData = await invoiceResponse.json();
          if (!invoiceResponse.ok) throw new Error(invoiceData.message);
          return { success: true, data: invoiceData };

        case 'sendPayment':
          const sendSession = JSON.parse(localStorage.getItem('protonpay_session') || '{}');
          if (!sendSession.token) throw new Error('No authentication token');
          
          const sendResponse = await fetch(`${baseUrl}/payments/send`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sendSession.token}` 
            },
            body: JSON.stringify({ invoice: data.invoice })
          });
          const sendData = await sendResponse.json();
          if (!sendResponse.ok) throw new Error(sendData.message);
          return { success: true, data: sendData };

        case 'getPaymentStatus':
          const statusSession = JSON.parse(localStorage.getItem('protonpay_session') || '{}');
          if (!statusSession.token) throw new Error('No authentication token');
          
          const statusResponse = await fetch(`${baseUrl}/payments/${data.paymentId}`, {
            headers: { 'Authorization': `Bearer ${statusSession.token}` }
          });
          const statusData = await statusResponse.json();
          if (!statusResponse.ok) throw new Error(statusData.message);
          return { success: true, data: statusData };

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      console.error('Direct API call error:', error);
      return { success: false, error: error.message };
    }
  }

  showLoading(formId, loadingText) {
    const form = document.getElementById(formId);
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = loadingText;
  }

  hideLoading(formId, originalText) {
    const form = document.getElementById(formId);
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }

  showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
    element.className = element.className.replace(/success|info/g, '') + ' error';
  }

  showStatus(element, message, type = 'info') {
    element.textContent = message;
    element.classList.remove('hidden');
    element.className = element.className.replace(/success|error|info/g, '') + ` ${type}`;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  openInWindow() {
    // Get the current extension URL
    const extensionUrl = chrome.runtime.getURL('standalone.html');
    
    // Open in a new window
    chrome.windows.create({
      url: extensionUrl,
      type: 'popup',
      width: 800,
      height: 800,
      focused: true
    });
  }

}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ProtonPayPopup();
});
