# PayPal Recurring Credits System

A complete MERN stack application for managing recurring PayPal payments with a credit system.

## Features

- ✅ User registration and login
- ✅ Credit system with rollover
- ✅ Monthly recurring payments ($49/month for 300 credits)
- ✅ Manual credit top-up options
- ✅ PayPal integration (sandbox ready)
- ✅ Payment history tracking
- ✅ Automatic subscription renewal
- ✅ Real-time credit updates

## Setup Instructions

### Backend Setup

1. Navigate to the backend folder:
\`\`\`bash
cd backend
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Update the `.env` file with your PayPal credentials:
\`\`\`
PAYPAL_CLIENT_ID=your_paypal_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_client_secret_here
\`\`\`

4. Make sure MongoDB is running on your system

5. Start the backend server:
\`\`\`bash
npm run dev
\`\`\`

The backend will run on http://localhost:5000

### Frontend Setup

1. Navigate to the frontend folder:
\`\`\`bash
cd frontend
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Update the PayPal client ID in `index.html`:
Replace `YOUR_PAYPAL_CLIENT_ID` with your actual PayPal client ID in two places:
- In the PayPal SDK script tag
- This should match your backend .env file

4. Start the frontend server:
\`\`\`bash
npm start
\`\`\`

The frontend will run on http://localhost:3000

## How It Works

### Credit System
- New users get 300 initial credits
- Monthly subscription adds 300 credits every month
- Credits roll over from previous months
- Manual top-up available anytime

### Payment Flow
1. **Subscription**: $49/month for 300 credits with auto-renewal
2. **Manual Top-up**: Buy credits anytime when running low
3. **Credit Usage**: Use credits for your services/features

### Recurring Payments
- Automatic monthly renewal for active subscriptions
- Cron job checks daily for due payments
- Credits are added automatically on successful payment

## Demo Instructions

1. Start both backend and frontend servers
2. Open http://localhost:3000 in your browser
3. Register with any email and name
4. You'll get 300 initial credits
5. Test the subscription payment with PayPal sandbox
6. Test manual credit top-up
7. Use some credits to see the system in action

## PayPal Sandbox Testing

Use PayPal's test accounts:
- **Buyer Account**: Use any sandbox buyer account
- **Seller Account**: Your sandbox business account

## Production Deployment

1. Change PayPal environment from Sandbox to Live in `server.js`
2. Update PayPal credentials with live credentials
3. Update MongoDB connection for production database
4. Deploy backend to your server (Heroku, AWS, etc.)
5. Deploy frontend to your hosting service
6. Update API endpoints in frontend

## File Structure

\`\`\`
├── backend/
│   ├── server.js          # Main server file
│   ├── package.json       # Backend dependencies
│   └── .env              # Environment variables
├── frontend/
│   ├── index.html        # Main HTML file
│   ├── app.js           # Frontend JavaScript
│   └── package.json     # Frontend dependencies
└── README.md           # This file
\`\`\`

## Support

For any issues or questions, check the console logs in both browser and server terminal.
