// Background service worker for ProtonPay
class ProtonPayBackground {
  constructor() {
    this.baseUrl = 'http://localhost:3000'; // Local backend
    this.voltageApiUrl = 'https://api.voltageapi.com/v1';
    this.session = null;
    this.init();
  }

  async init() {
    // Check for existing session
    const session = await this.getStoredSession();
    if (session) {
      this.session = session;
    }
  }

  // Session management
  async getStoredSession() {
    const result = await chrome.storage.local.get(['session']);
    return result.session;
  }

  async storeSession(session) {
    await chrome.storage.local.set({ session });
    this.session = session;
  }

  async clearSession() {
    await chrome.storage.local.remove(['session']);
    this.session = null;
  }

  // API calls to local backend
  async apiCall(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    if (this.session?.token) {
      config.headers.Authorization = `Bearer ${this.session.token}`;
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }
      
      return data;
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  }

  // Authentication
  async login(email, password) {
    const response = await this.apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    await this.storeSession(response);
    return response;
  }

  async logout() {
    await this.clearSession();
  }

  // Wallet operations
  async getBalance() {
    if (!this.session?.user?.walletId && !this.session?.walletId) {
      throw new Error('No wallet ID available');
    }
    
    return await this.apiCall(`/wallet/balance`);
  }

  async getTransactionHistory() {
    return await this.apiCall('/wallet/transactions');
  }

  async sendPayment(invoice) {
    try {
      const response = await this.apiCall('/payments/send', {
        method: 'POST',
        body: JSON.stringify({ invoice })
      });
      
      return response;
    } catch (error) {
      console.error('Send payment failed:', error);
      // Re-throw with more context
      throw new Error(`Payment failed: ${error.message}`);
    }
  }

  async createInvoice(amount, description) {
    const response = await this.apiCall('/payments/receive', {
      method: 'POST',
      body: JSON.stringify({ amount, description })
    });
    
    return response;
  }

  async getPaymentStatus(paymentId) {
    return await this.apiCall(`/payments/${paymentId}`);
  }

  // Account management
  async updateProfile(profile) {
    return await this.apiCall('/account/profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
  }

  async changePassword(currentPassword, newPassword) {
    return await this.apiCall('/account/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  async deleteAccount() {
    await this.apiCall('/account', { method: 'DELETE' });
    await this.clearSession();
  }

}

// Initialize background service
const background = new ProtonPayBackground();

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handleRequest = async () => {
    try {
      switch (request.action) {
        case 'login':
          const loginResult = await background.login(request.email, request.password);
          sendResponse({ success: true, data: loginResult });
          break;
          
        case 'logout':
          await background.logout();
          sendResponse({ success: true });
          break;
          
        case 'getBalance':
          const balance = await background.getBalance();
          sendResponse({ success: true, data: balance });
          break;
          
        case 'getTransactionHistory':
          const history = await background.getTransactionHistory();
          sendResponse({ success: true, data: history });
          break;
          
        case 'sendPayment':
          const sendResult = await background.sendPayment(request.invoice);
          sendResponse({ success: true, data: sendResult });
          break;
          
        case 'createInvoice':
          console.log('Background: Received createInvoice request:', request);
          const invoice = await background.createInvoice(request.amount, request.description);
          console.log('Background: Invoice created:', invoice);
          sendResponse({ success: true, data: invoice });
          break;
          
        case 'getPaymentStatus':
          const status = await background.getPaymentStatus(request.paymentId);
          sendResponse({ success: true, data: status });
          break;
          
        case 'updateProfile':
          const profile = await background.updateProfile(request.profile);
          sendResponse({ success: true, data: profile });
          break;
          
        case 'changePassword':
          const passwordResult = await background.changePassword(request.currentPassword, request.newPassword);
          sendResponse({ success: true, data: passwordResult });
          break;
          
        case 'deleteAccount':
          await background.deleteAccount();
          sendResponse({ success: true });
          break;
          
        case 'getSession':
          const session = await background.getStoredSession();
          sendResponse({ success: true, data: session });
          break;
          
        case 'clearSession':
          await background.clearSession();
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  };
  
  handleRequest();
  return true; // Keep message channel open for async response
});
