# ProtonPay Chrome Extension

A minimal Chrome extension wallet for Bitcoin Lightning payments using the Voltage Payments API (v1).

## Demo
Here is a demo of creating an invoice and paying it using Voltage's test mutiny wallet environment:

https://github.com/user-attachments/assets/13320824-ca8b-4790-a7ba-0a70ea1861a8



## Features

- **Authentication**: Secure login with email and password
- **Dashboard**: View balance and transaction history
- **Send Payments**: Send Lightning payments using invoices
- **Receive Payments**: Generate invoices and QR codes for receiving payments
- **Account Management**: Update profile, change password, and delete account
- **Real-time Status**: Poll payment status until completion

## Project Structure

```
ProtonPay Chrome Extension/
├── manifest.json              # Chrome extension manifest
├── background.js              # Background service worker
├── popup.html                 # Main popup interface
├── popup.js                   # Popup functionality
├── options.html               # Account settings page
├── options.js                 # Options page functionality
├── styles/
│   ├── popup.css             # Popup styling
│   └── options.css           # Options page styling
├── scripts/
│   ├── popup.js              # Popup logic
│   └── options.js            # Options page logic
├── backend/
│   ├── server.js             # Local backend server
│   └── package.json          # Backend dependencies
└── icons/                    # Extension icons
    └── README.md
```

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (create a `.env` file or set them in your shell):
   ```bash
   export VOLTAGE_API_KEY="your-voltage-api-key"
   export VOLTAGE_ORG_ID="your-organization-id"
   export VOLTAGE_ENV_ID="your-environment-id"
   ```

4. Start the backend server:
   ```bash
   npm start
   ```

   The server will run on `http://localhost:3000`

### 2. Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions/`

2. Enable "Developer mode" in the top right

3. Click "Load unpacked" and select the root directory of this project

4. The extension should now appear in your extensions list

5. Click the extension icon to open the wallet

### 3. Create Test Account

Since this is a single-user wallet, you'll need to create a test account first. You can do this by making a POST request to the backend:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

## Usage

### Login
- Enter your email and password to log in
- The extension will automatically create a Voltage wallet for you on first login

### Dashboard
- View your current balance in satoshis
- See recent transaction history
- Use the Send and Receive buttons for payments

### Send Payment
1. Click "Send" on the dashboard
2. Paste a Lightning invoice (starts with `lnbc...`)
3. Click "Send Payment"
4. The extension will poll for payment status until completion

### Receive Payment
1. Click "Receive" on the dashboard
2. Enter the amount in satoshis
3. Add an optional description
4. Click "Generate Invoice"
5. Copy the invoice or scan the QR code
6. The extension will poll for payment status until received

### Account Settings
- Access via the extension options page
- Update your name and email
- Change your password
- Delete your account (removes all data)

## API Integration

The extension communicates with a local backend server that handles:

- User authentication and session management
- Voltage API integration
- Wallet creation and management
- Payment processing and status polling

### Voltage API Endpoints Used

- `GET /wallets/{walletId}` - Get wallet balance
- `POST /wallets` - Create new wallet
- `GET /wallets/{walletId}/payments` - Get transaction history
- `POST /payments` - Send/receive payments
- `GET /payments/{paymentId}` - Get payment status

## Security Features

- JWT-based authentication
- Secure password hashing with bcrypt
- Session management with chrome.storage.local
- CORS protection on backend
- Input validation and sanitization

## Development

### Backend Development
```bash
cd backend
npm run dev  # Uses nodemon for auto-restart
```

### Extension Development
- Make changes to the extension files
- Go to `chrome://extensions/`
- Click the refresh icon on the extension to reload

### Testing
- Test with real Lightning invoices
- Use testnet for development
- Monitor backend logs for API calls

## Troubleshooting

### Common Issues

1. **Backend not starting**: Check if port 3000 is available
2. **API errors**: Verify Voltage API credentials are correct
3. **Extension not loading**: Check manifest.json syntax
4. **CORS errors**: Ensure backend is running on localhost:3000

### Debug Mode
- Open Chrome DevTools for the popup (right-click extension icon → Inspect)
- Check backend console for API logs
- Use Chrome's extension debugging tools

## Production Considerations

Before deploying to production:

1. Replace in-memory storage with a proper database
2. Use environment variables for all secrets
3. Implement proper error handling and logging
4. Add rate limiting and security headers
5. Use HTTPS for all communications
6. Implement proper backup and recovery procedures
7. Add comprehensive testing

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the Voltage API documentation
3. Check Chrome extension documentation
4. Create an issue in the project repository
