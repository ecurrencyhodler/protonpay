#!/bin/bash

echo "⚡ Setting up ProtonPay Chrome Extension"
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Navigate to backend directory and install dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install

if [ $? -eq 0 ]; then
    echo "✅ Backend dependencies installed successfully"
else
    echo "❌ Failed to install backend dependencies"
    exit 1
fi

cd ..

# Create environment variables template
echo "🔧 Creating environment variables template..."
cat > backend/.env.example << EOF
# Voltage API Configuration
VOLTAGE_API_KEY=your-voltage-api-key-here
VOLTAGE_ORG_ID=your-organization-id-here
VOLTAGE_ENV_ID=your-environment-id-here

# JWT Secret (change this in production)
JWT_SECRET=your-secret-key-change-in-production
EOF

echo "✅ Environment template created at backend/.env.example"

# Create icons placeholder
echo "🎨 Creating icons placeholder..."
mkdir -p icons
if [ ! -f icons/icon16.png ]; then
    echo "⚠️  Please add icon files to the icons/ directory:"
    echo "   - icon16.png (16x16 pixels)"
    echo "   - icon48.png (48x48 pixels)"
    echo "   - icon128.png (128x128 pixels)"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Copy backend/.env.example to backend/.env and fill in your Voltage API credentials"
echo "2. Add icon files to the icons/ directory"
echo "3. Start the backend server: cd backend && npm start"
echo "4. Load the extension in Chrome: chrome://extensions/ → Load unpacked"
echo "5. Create a test account using the registration endpoint"
echo ""
echo "For detailed instructions, see README.md"
