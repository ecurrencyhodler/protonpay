require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key-change-in-production';

// ProtonPay Backend Server

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the parent directory (where standalone.html is located)
app.use(express.static('../'));

// In-memory storage (replace with database in production)
let users = [];
let sessions = [];
let demoPayments = {}; // Store demo payment details

// Rate limiting for API calls
const apiCallLimiter = new Map(); // Track API calls per endpoint
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_CALLS_PER_MINUTE = 30; // Max 30 calls per minute per endpoint

// Voltage API configuration
const VOLTAGE_API_URL = 'https://backend.voltage.cloud/api/v1';
const VOLTAGE_API_KEY = process.env.VOLTAGE_API_KEY;
const VOLTAGE_ORG_ID = process.env.VOLTAGE_ORG_ID;
const VOLTAGE_ENV_ID = process.env.VOLTAGE_ENV_ID;

// Validate API credentials
const hasValidVoltageCredentials = VOLTAGE_API_KEY && 
                                  VOLTAGE_API_KEY !== 'your_actual_voltage_api_key_here' &&
                                  VOLTAGE_ORG_ID && 
                                  VOLTAGE_ORG_ID !== 'your_actual_organization_id_here' &&
                                  VOLTAGE_ENV_ID && 
                                  VOLTAGE_ENV_ID !== 'your_actual_environment_id_here';

if (!hasValidVoltageCredentials) {
  console.warn('⚠️  Voltage API credentials not configured. Running in demo mode only.');
  console.warn('   Set VOLTAGE_API_KEY, VOLTAGE_ORG_ID, and VOLTAGE_ENV_ID in .env file');
  console.warn('   Get credentials from: https://dashboard.voltage.cloud/');
}

// Rate limiting helper
function checkRateLimit(endpoint) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!apiCallLimiter.has(endpoint)) {
    apiCallLimiter.set(endpoint, []);
  }
  
  const calls = apiCallLimiter.get(endpoint);
  
  // Remove old calls outside the window
  const recentCalls = calls.filter(timestamp => timestamp > windowStart);
  apiCallLimiter.set(endpoint, recentCalls);
  
  // Check if we're over the limit
  if (recentCalls.length >= MAX_CALLS_PER_MINUTE) {
    const oldestCall = Math.min(...recentCalls);
    const waitTime = RATE_LIMIT_WINDOW - (now - oldestCall);
    throw new Error(`Rate limit exceeded for ${endpoint}. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
  }
  
  // Add current call
  recentCalls.push(now);
  apiCallLimiter.set(endpoint, recentCalls);
}

// Helper function to make Voltage API calls with rate limiting
async function voltageApiCall(endpoint, method = 'GET', data = null) {
  try {
    // Check rate limit before making the call
    checkRateLimit(endpoint);
    
    const config = {
      method,
      url: `${VOLTAGE_API_URL}${endpoint}`,
      headers: {
        'X-Api-Key': VOLTAGE_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    };

    if (data) {
      config.data = data;
    }

    console.log(`Making ${method} request to: ${config.url} (rate limited)`);
    console.log(`Request headers:`, config.headers);
    console.log(`Request data:`, JSON.stringify(data, null, 2));
    
    const response = await axios(config);
    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, response.headers);
    console.log(`Response data:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    if (error.message.includes('Rate limit exceeded')) {
      console.error('Rate limit hit:', error.message);
      throw error;
    }
    
    // Enhanced error logging
    console.error('=== VOLTAGE API ERROR DETAILS ===');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Request URL:', error.config?.url);
    console.error('Request method:', error.config?.method);
    console.error('Request headers:', error.config?.headers);
    console.error('Request data:', error.config?.data);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response statusText:', error.response.statusText);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received. Request details:', error.request);
    }
    console.error('=== END ERROR DETAILS ===');
    
    throw new Error(error.response?.data?.message || error.response?.data?.error || error.message || 'Voltage API request failed');
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Routes

// Register user (for testing - remove in production)
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }

    // Check if user already exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = {
      id: Date.now().toString(),
      email,
      password: hashedPassword,
      name,
      walletId: null,
      createdAt: new Date()
    };

    users.push(user);

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create or get wallet
    if (!user.walletId) {
      if (hasValidVoltageCredentials) {
        try {
          console.log('Creating real wallet for user:', user.email);
          // Get existing wallets and use the first one
          const wallets = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/wallets`);
          if (wallets && wallets.length > 0) {
            // Use the first available wallet
            user.walletId = wallets[0].id;
            console.log('Using existing wallet for user:', user.email, 'Wallet ID:', wallets[0].id);
          } else {
            // Create a new wallet if none exist
            const walletResponse = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/wallets`, 'POST', {
              name: `${user.name}'s ProtonPay Wallet`,
              environment_id: VOLTAGE_ENV_ID
            });
            user.walletId = walletResponse.id;
            console.log('Created new wallet for user:', user.email, 'Wallet ID:', walletResponse.id);
          }
        } catch (error) {
          console.error('Failed to create real wallet:', error);
          // Create a temporary wallet ID and allow login, wallet creation can be retried later
          user.walletId = `temp-wallet-${user.id}`;
          console.log('Created temporary wallet for user due to API error:', user.email);
        }
      } else {
        // No API credentials, create a demo wallet ID
        user.walletId = `demo-wallet-${user.id}`;
        console.log('Created demo wallet for user:', user.email);
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        name: user.name,
        walletId: user.walletId 
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        walletId: user.walletId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get wallet balance
app.get('/wallet/balance', authenticateToken, async (req, res) => {
  try {
    const { walletId } = req.user;

    if (!walletId) {
      return res.status(400).json({ message: 'No wallet associated with user' });
    }

    // Check if this is a demo wallet
    if (walletId.startsWith('demo-wallet-')) {
      res.json({
        balance: 10000, // Demo balance of 10,000 sats
        currency: 'sats'
      });
      return;
    }

    const wallet = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/wallets/${walletId}`);
    
    // Extract balance from the response
    let balance = 0;
    if (wallet.balances && wallet.balances.length > 0) {
      const balanceData = wallet.balances[0];
      if (balanceData.available && balanceData.available.amount) {
        balance = Math.floor(balanceData.available.amount / 1000); // Convert msats to sats
      }
    }
    
    res.json({
      balance: balance,
      currency: 'sats'
    });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ message: 'Failed to get balance' });
  }
});

// Get transaction history
app.get('/wallet/transactions', authenticateToken, async (req, res) => {
  try {
    const { walletId } = req.user;

    if (!walletId) {
      return res.status(400).json({ message: 'No wallet associated with user' });
    }

    // Check if this is a demo wallet
    if (walletId.startsWith('demo-wallet-')) {
      // For demo wallets, return only completed demo transactions
      const demoTransactions = Object.values(demoPayments)
        .filter(payment => !payment.expired && payment.state === 'COMPLETED') // Only completed transactions
        .map(payment => ({
          id: payment.id,
          amount: payment.amount,
          type: 'RECEIVED',
          description: payment.description || 'Demo Payment',
          state: payment.state,
          created_at: payment.created_at,
          updated_at: payment.updated_at || payment.created_at
        }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Sort by newest first

      res.json({ transactions: demoTransactions });
      return;
    }

    // Check if we have valid Voltage API credentials
    if (!hasValidVoltageCredentials) {
      console.error('Voltage API credentials not configured. Cannot fetch real transactions.');
      res.status(400).json({ 
        message: 'Voltage API credentials not configured. Please set VOLTAGE_API_KEY, VOLTAGE_ORG_ID, and VOLTAGE_ENV_ID environment variables.',
        transactions: []
      });
      return;
    }

    try {
      // Get payments for the wallet from Voltage API
      console.log(`Fetching real transactions from Voltage API for wallet: ${walletId}`);
      const payments = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments`);
      
      console.log(`Received ${payments.items?.length || 0} payments from Voltage API`);
      
      // Filter payments for this wallet - only show completed transactions
      const transactions = (payments.items || [])
        .filter(payment => {
          // Only include completed payments
          if (payment.status !== 'completed' && payment.status !== 'COMPLETED') {
            console.log(`Filtering out non-completed payment: ${payment.id} (status: ${payment.status})`);
            return false;
          }
          
          return true;
        })
        .map(payment => ({
          id: payment.id,
          amount: payment.requested_amount?.amount ? Math.floor(payment.requested_amount.amount / 1000) : 0, // Convert msats to sats
          type: payment.direction === 'send' ? 'SENT' : 'RECEIVED',
          description: payment.data?.memo || payment.memo || 'Payment',
          state: payment.status,
          created_at: payment.created_at,
          updated_at: payment.updated_at
        }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Sort by newest first

      console.log(`Returning ${transactions.length} active transactions`);
      res.json({ transactions });
    } catch (voltageError) {
      console.error('Voltage API error for transactions:', voltageError.message);
      res.status(500).json({ 
        message: `Failed to fetch transactions from Voltage API: ${voltageError.message}`,
        transactions: []
      });
    }
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ message: 'Failed to get transactions' });
  }
});

// Send payment
app.post('/payments/send', authenticateToken, async (req, res) => {
  try {
    const { invoice } = req.body;
    const { walletId } = req.user;

    console.log('Send payment request:', { invoice: invoice?.substring(0, 50) + '...', walletId });

    if (!invoice) {
      return res.status(400).json({ message: 'Invoice is required' });
    }

    if (!walletId) {
      return res.status(400).json({ message: 'No wallet associated with user' });
    }

    // Validate invoice format
    if (!invoice.toLowerCase().startsWith('lnbc') && !invoice.toLowerCase().startsWith('lntb') && !invoice.toLowerCase().startsWith('lntbs')) {
      return res.status(400).json({ message: 'Invalid Lightning invoice format' });
    }

    // Check if this is a demo wallet or temporary wallet
    if (walletId.startsWith('demo-wallet-') || walletId.startsWith('temp-wallet-')) {
      // For demo/temp wallets, simulate a payment
      const paymentId = `demo-send-${Date.now()}`;
      
      // Parse the invoice to extract amount (basic parsing for demo)
      let amount = 0;
      try {
        // Very basic invoice parsing - in production you'd use a proper library
        const invoiceLower = invoice.toLowerCase();
        const amountMatch = invoiceLower.match(/lnbc(\d+)([munp]?)/);
        if (amountMatch) {
          const baseAmount = parseInt(amountMatch[1]);
          const unit = amountMatch[2] || '';
          
          // Convert to sats based on unit
          switch (unit) {
            case 'm': // milli-bitcoin (0.001 BTC)
              amount = baseAmount * 100000; // 1 mBTC = 100,000 sats
              break;
            case 'u': // micro-bitcoin (0.000001 BTC)
              amount = baseAmount * 100; // 1 μBTC = 100 sats
              break;
            case 'n': // nano-bitcoin (0.000000001 BTC)
              amount = Math.floor(baseAmount / 10); // 1 nBTC = 0.1 sats
              break;
            case 'p': // pico-bitcoin (0.000000000001 BTC)
              amount = Math.floor(baseAmount / 10000); // 1 pBTC = 0.0001 sats
              break;
            default:
              amount = baseAmount; // Assume sats if no unit
          }
        }
      } catch (parseError) {
        console.log('Could not parse invoice amount, using default:', parseError.message);
        amount = 1000; // Default to 1000 sats for demo
      }
      
      const walletType = walletId.startsWith('demo-wallet-') ? 'Demo' : 'Temporary';
      console.log(`${walletType} payment: Sending ${amount} sats via invoice ${invoice.substring(0, 20)}...`);
      
      res.json({
        paymentId: paymentId,
        state: 'completed',
        amount: amount,
        demo: true,
        message: `${walletType} payment completed successfully`
      });
      return;
    }

    // Check if we have valid Voltage API credentials
    if (!hasValidVoltageCredentials) {
      console.error('Voltage API credentials not properly configured');
      return res.status(400).json({ 
        message: 'Voltage API credentials not configured. Cannot send real payments.',
        details: 'Please check VOLTAGE_API_KEY, VOLTAGE_ORG_ID, and VOLTAGE_ENV_ID environment variables'
      });
    }

    console.log('Attempting to send payment via Voltage API...');
    console.log('API URL:', `${VOLTAGE_API_URL}/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments`);
    console.log('Wallet ID:', walletId);

    // Create payment in Voltage - correct structure for sending Lightning payments
    const paymentData = {
      id: `00000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
      wallet_id: walletId,
      currency: 'btc',
      type: 'bolt11',
      data: {
        payment_request: invoice
      }
    };

    console.log('Payment request data:', paymentData);

    const payment = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments`, 'POST', paymentData);

    console.log('Voltage API payment response:', payment);

    // Since Voltage API returns 202 with empty body, we need to check the payment status using our generated ID
    let paymentStatus = null;
    try {
      console.log(`Checking payment status for ID: ${paymentData.id}`);
      paymentStatus = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments/${paymentData.id}`);
      console.log('Payment status response:', paymentStatus);
    } catch (statusError) {
      console.log('Payment status error:', statusError.message);
      // If we can't get status immediately, that's okay - payment might still be processing
    }

    res.json({
      paymentId: paymentData.id, // Use our generated ID
      state: paymentStatus?.status || paymentStatus?.state || 'pending',
      amount: paymentStatus?.data?.amount_msats ? Math.floor(paymentStatus.data.amount_msats / 1000) : 0
    });
  } catch (error) {
    console.error('Send payment error details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // Provide more detailed error information
    let errorMessage = 'Failed to send payment';
    let errorDetails = error.message;

    if (error.response?.data) {
      if (typeof error.response.data === 'string') {
        errorDetails = error.response.data;
      } else if (error.response.data.message) {
        errorDetails = error.response.data.message;
      } else if (error.response.data.error) {
        errorDetails = error.response.data.error;
      }
    }

    if (error.response?.status === 401) {
      errorMessage = 'Authentication failed with Voltage API';
      errorDetails = 'Please check your API credentials';
    } else if (error.response?.status === 403) {
      errorMessage = 'Access denied by Voltage API';
      errorDetails = 'Insufficient permissions or invalid wallet ID';
    } else if (error.response?.status === 404) {
      errorMessage = 'Wallet or endpoint not found';
      errorDetails = 'Please check your wallet ID and API configuration';
    } else if (error.response?.status >= 500) {
      errorMessage = 'Voltage API server error';
      errorDetails = 'Please try again later';
    }

    res.status(error.response?.status || 500).json({ 
      message: errorMessage,
      details: errorDetails,
      error_code: error.response?.status
    });
  }
});

// Create invoice (receive payment)
app.post('/payments/receive', authenticateToken, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const { walletId } = req.user;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    if (!walletId) {
      return res.status(400).json({ message: 'No wallet associated with user' });
    }

    // Check if this is a demo wallet or if API credentials are not configured
    const isDemo = walletId.startsWith('demo-wallet-') || 
                   !VOLTAGE_API_KEY || VOLTAGE_API_KEY === 'your-voltage-api-key' ||
                   !VOLTAGE_ORG_ID || VOLTAGE_ORG_ID === 'your-org-id' ||
                   !VOLTAGE_ENV_ID || VOLTAGE_ENV_ID === 'your-env-id';

    if (isDemo) {
      // Generate a demo invoice
      const paymentId = `demo-payment-${Date.now()}`;
      const demoInvoice = `lnbc${amount}u1p0demo${Math.random().toString(36).substring(2, 15)}demo`;
      
      // Store demo payment details
      demoPayments[paymentId] = {
        id: paymentId,
        amount: amount,
        description: description || 'Demo Payment',
        state: 'PENDING',
        payment_request: demoInvoice,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expired: false,
        demo: true
      };
      
      console.log(`Generated demo invoice for ${amount} sats: ${demoInvoice}`);
      
      res.json({
        paymentId: paymentId,
        payment_request: demoInvoice,
        amount: amount,
        description: description || 'Demo Payment',
        state: 'PENDING',
        demo: true
      });
      return;
    }

    // Try to create real payment in Voltage
    try {
      console.log(`Creating invoice for ${amount} sats (${amount * 1000} msats)`);
      console.log(`Request payload:`, {
        payment_kind: 'bolt11',
        id: `00000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
        amount_msats: amount * 1000,
        currency: 'btc',
        memo: description || 'Payment',
        wallet_id: walletId
      });
      
             const payment = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments`, 'POST', {
         payment_kind: 'bolt11',
         id: `00000000-0000-0000-0000-${Date.now().toString().slice(-12)}`,
         amount_msats: amount * 1000, // Convert sats to millisats
         currency: 'btc',
         memo: description || 'Payment',
         wallet_id: walletId
       });

      console.log('Voltage API response:', payment);

             // The Voltage API returns a 202 status with empty body, so we need to poll for the payment details
       if (!payment || !payment.payment_request) {
         // Get the payment details by listing recent payments
         const payments = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments`);
         console.log('Fetched payments list:', payments);
         
         if (payments && payments.items && payments.items.length > 0) {
           // Find the most recent payment (should be the one we just created)
           const latestPayment = payments.items[0];
           console.log('Latest payment details:', latestPayment);
           
                       // Poll for the payment to be ready with exponential backoff and caching
            let paymentDetails = null;
            let attempts = 0;
            const maxAttempts = 12; // Reduced from 60 to 12 attempts
            let pollInterval = 2000; // Start with 2 seconds
            let lastPaymentData = null;
            
            while (attempts < maxAttempts) {
              console.log(`Polling attempt ${attempts + 1}/${maxAttempts} for payment ${latestPayment.id} (interval: ${pollInterval}ms)`);
              
              try {
                paymentDetails = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments/${latestPayment.id}`);
                console.log(`Payment status: ${paymentDetails.status}, has payment_request: ${!!paymentDetails.data?.payment_request}`);
                
                // Check if payment data has changed (caching optimization)
                const currentPaymentData = JSON.stringify({
                  status: paymentDetails.status,
                  hasPaymentRequest: !!paymentDetails.data?.payment_request,
                  error: paymentDetails.error
                });
                
                if (lastPaymentData === currentPaymentData && attempts > 0) {
                  console.log('Payment data unchanged, continuing to poll...');
                } else {
                  lastPaymentData = currentPaymentData;
                }
                
                // Stop condition 1: Payment request is ready
                if (paymentDetails.data?.payment_request) {
                  console.log('Payment request is ready, stopping polling');
                  break;
                }
                
                // Stop condition 2: Payment failed
                if (paymentDetails.status === 'failed' || paymentDetails.error) {
                  console.log('Payment failed, stopping polling');
                  throw new Error(`Payment failed: ${paymentDetails.error || 'Unknown error'}`);
                }
                
                // Stop condition 3: Payment completed (unlikely for receive, but possible)
                if (paymentDetails.status === 'completed') {
                  console.log('Payment completed, stopping polling');
                  break;
                }
                
                // Exponential backoff: increase interval up to 10 seconds
                pollInterval = Math.min(pollInterval * 1.5, 10000);
                
                // Wait before next attempt
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                attempts++;
                
              } catch (pollError) {
                console.error(`Polling error on attempt ${attempts + 1}:`, pollError.message);
                
                // Stop condition 4: Critical error (not just payment not ready)
                if (pollError.message.includes('404') || pollError.message.includes('500')) {
                  throw new Error(`Critical polling error: ${pollError.message}`);
                }
                
                // For other errors, continue polling unless we've reached max attempts
                if (attempts >= maxAttempts - 1) {
                  throw new Error(`Polling timeout after ${maxAttempts} attempts: ${pollError.message}`);
                }
                
                // Increase interval on errors
                pollInterval = Math.min(pollInterval * 2, 10000);
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                attempts++;
              }
            }
           
           // Stop condition 5: Timeout reached
           if (attempts >= maxAttempts) {
             throw new Error(`Invoice generation timeout after ${maxAttempts} seconds`);
           }
           
           console.log(`Invoice generation completed after ${attempts + 1} attempts`);
           
           res.json({
             paymentId: paymentDetails.id,
             payment_request: paymentDetails.data?.payment_request || paymentDetails.payment_request,
             amount: paymentDetails.requested_amount?.amount ? Math.floor(paymentDetails.requested_amount.amount / 1000) : amount, // Convert msats back to sats
             description: description || 'Payment',
             state: paymentDetails.status || paymentDetails.state || 'PENDING'
           });
         } else {
           throw new Error('Could not retrieve payment details after creation');
         }
       } else {
         // Return the payment details directly if available
         res.json({
           paymentId: payment.id || payment.data?.id,
           payment_request: payment.payment_request || payment.data?.payment_request,
           amount: payment.requested_amount?.amount ? Math.floor(payment.requested_amount.amount / 1000) : amount, // Convert msats back to sats
           description: description || 'Payment',
           state: payment.state || payment.status || 'PENDING'
         });
       }
    } catch (voltageError) {
      console.error('Voltage API error, falling back to demo mode:', voltageError.message);
      
      // Fall back to demo mode if Voltage API fails
      const paymentId = `demo-payment-${Date.now()}`;
      const demoInvoice = `lnbc${amount}u1p0demo${Math.random().toString(36).substring(2, 15)}demo`;
      
      // Store demo payment details
      demoPayments[paymentId] = {
        id: paymentId,
        amount: amount,
        description: description || 'Demo Payment (API Error)',
        state: 'PENDING',
        payment_request: demoInvoice,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expired: false,
        demo: true
      };
      
      res.json({
        paymentId: paymentId,
        payment_request: demoInvoice,
        amount: amount,
        description: description || 'Demo Payment (API Error)',
        state: 'PENDING',
        demo: true,
        warning: 'Using demo mode due to API configuration issues'
      });
    }
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ message: `Failed to create invoice: ${error.message}` });
  }
});

// In-memory storage for active payments to prevent excessive polling
let activePayments = new Map();

// Function to clean up expired demo payments
function cleanupExpiredDemoPayments() {
  const now = new Date();
  const oneHourInMs = 60 * 60 * 1000; // 1 hour in milliseconds
  
  Object.keys(demoPayments).forEach(paymentId => {
    const payment = demoPayments[paymentId];
    const createdAt = new Date(payment.created_at);
    
    if (now - createdAt > oneHourInMs && !payment.expired) {
      payment.expired = true;
      payment.updated_at = now.toISOString();
      console.log(`Marked demo payment ${paymentId} as expired`);
    }
  });
}

// Clean up expired payments every 5 minutes
setInterval(cleanupExpiredDemoPayments, 5 * 60 * 1000);

// Get payment status
app.get('/payments/:paymentId', authenticateToken, async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Check if this is a demo payment
    if (paymentId.startsWith('demo-payment-')) {
      // Look up the demo payment details
      const demoPayment = demoPayments[paymentId];
      if (demoPayment) {
        // Check if payment has expired
        if (demoPayment.expired) {
          res.json({
            id: demoPayment.id,
            state: 'expired',
            amount: demoPayment.amount,
            description: demoPayment.description,
            demo: true
          });
        } else {
          res.json({
            id: demoPayment.id,
            state: demoPayment.state,
            amount: demoPayment.amount,
            description: demoPayment.description,
            demo: true
          });
        }
      } else {
        // Demo payment not found in storage
        res.status(404).json({ 
          message: 'Demo payment not found',
          demo: true 
        });
      }
      return;
    }

    // Check if we have valid API credentials before making real API calls
    const hasValidCredentials = VOLTAGE_API_KEY && VOLTAGE_API_KEY !== 'your-voltage-api-key' &&
                               VOLTAGE_ORG_ID && VOLTAGE_ORG_ID !== 'your-org-id' &&
                               VOLTAGE_ENV_ID && VOLTAGE_ENV_ID !== 'your-env-id';

    if (!hasValidCredentials) {
      return res.status(400).json({ 
        message: 'API credentials not configured. Please set VOLTAGE_API_KEY, VOLTAGE_ORG_ID, and VOLTAGE_ENV_ID environment variables.',
        demo: true
      });
    }

    // Check if payment is in cache and completed/failed to avoid unnecessary API calls
    const cachedPayment = activePayments.get(paymentId);
    if (cachedPayment && (cachedPayment.state === 'completed' || cachedPayment.state === 'failed')) {
      console.log(`Returning cached payment status for ${paymentId}: ${cachedPayment.state}`);
      return res.json(cachedPayment);
    }

    const payment = await voltageApiCall(`/organizations/${VOLTAGE_ORG_ID}/environments/${VOLTAGE_ENV_ID}/payments/${paymentId}`);

    // Cache the payment result
    const paymentResult = {
      id: payment.id,
      state: payment.status || payment.state,
      amount: payment.data?.amount_msats ? Math.floor(payment.data.amount_msats / 1000) : 0, // Convert msats to sats
      description: payment.data?.memo || payment.memo || 'Payment',
      error: payment.error
    };

    activePayments.set(paymentId, paymentResult);

    // Clean up completed/failed payments from cache after 5 minutes
    if (paymentResult.state === 'completed' || paymentResult.state === 'failed') {
      setTimeout(() => {
        activePayments.delete(paymentId);
        console.log(`Cleaned up cached payment ${paymentId}`);
      }, 5 * 60 * 1000);
    }

    res.json(paymentResult);
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ message: 'Failed to get payment status' });
  }
});

// Update profile
app.put('/account/profile', authenticateToken, async (req, res) => {
  try {
    const { profile } = req.body;
    const { userId } = req.user;

    const user = users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (profile.name) user.name = profile.name;
    if (profile.email) user.email = profile.email;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        walletId: user.walletId
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Change password
app.put('/account/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { userId } = req.user;

    const user = users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Delete account
app.delete('/account', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;

    // Remove user from storage
    users = users.filter(u => u.id !== userId);
    sessions = sessions.filter(s => s.userId !== userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`ProtonPay Backend running on http://localhost:${PORT}`);
  console.log('Make sure to set VOLTAGE_API_KEY, VOLTAGE_ORG_ID, and VOLTAGE_ENV_ID environment variables');
});
