const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const cron = require("node-cron")
require("dotenv").config()

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI ||  {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// PayPal Configuration
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET
const PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com"

// DEMO MODE - Set to true for 5-minute renewals instead of monthly
const DEMO_MODE = process.env.DEMO_MODE === "true" || true // Enable demo mode by default

// Validate PayPal credentials on startup
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.error("❌ MISSING PAYPAL CREDENTIALS!")
  console.error("Please update your .env file with valid PayPal credentials")
  process.exit(1)
}

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  credits: { type: Number, default: 0 },
  subscriptionStatus: { type: String, enum: ["active", "inactive", "cancelled"], default: "inactive" },
  lastPaymentDate: { type: Date, default: null },
  nextPaymentDate: { type: Date, default: null },
  subscriptionStartDate: { type: Date, default: null },
  monthlyCreditsUsed: { type: Number, default: 0 },
  currentMonthStart: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
})

const User = mongoose.model("User", userSchema)

// Payment Schema
const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  paypalOrderId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, required: true },
  creditsAdded: { type: Number, required: true },
  paymentType: { type: String, enum: ["subscription", "manual"], required: true },
  isAutoRenewal: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

const Payment = mongoose.model("Payment", paymentSchema)

// Helper function to get PayPal access token
async function getPayPalAccessToken() {
  try {
    console.log("🔑 Getting PayPal access token...")

    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64")

    const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Language": "en_US",
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw new Error(`PayPal token request failed: ${response.status} - ${responseText}`)
    }

    const data = JSON.parse(responseText)

    if (!data.access_token) {
      throw new Error("No access token received from PayPal")
    }

    console.log("✅ PayPal access token obtained successfully")
    return data.access_token
  } catch (error) {
    console.error("❌ Error getting PayPal access token:", error.message)
    throw error
  }
}

// Helper function to get next renewal date (5 minutes in demo mode, 1 month in production)
function getNextRenewalDate(date = new Date()) {
  const nextRenewal = new Date(date)
  if (DEMO_MODE) {
    // Demo mode: 5 minutes from now
    nextRenewal.setMinutes(nextRenewal.getMinutes() + 1)
    console.log(`📅 DEMO MODE: Next renewal in 5 minutes at ${nextRenewal.toLocaleString()}`)
  } else {
    // Production mode: 1 month from now
    nextRenewal.setMonth(nextRenewal.getMonth() + 1)
  }
  return nextRenewal
}

// Helper function to check if it's a new month
function isNewMonth(lastDate, currentDate = new Date()) {
  if (!lastDate) return true
  return lastDate.getMonth() !== currentDate.getMonth() || lastDate.getFullYear() !== currentDate.getFullYear()
}

// Routes

// Create User
app.post("/api/users", async (req, res) => {
  try {
    const { email, name } = req.body

    let user = await User.findOne({ email })
    if (user) {
      return res.json({ success: true, user })
    }

    user = new User({
      email,
      name,
      credits: 300, // Initial 300 credits
      currentMonthStart: new Date(),
    })
    await user.save()

    console.log(`👤 New user created: ${email} with 300 initial credits`)
    res.json({ success: true, user })
  } catch (error) {
    console.error("Create user error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get User
app.get("/api/users/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email })
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }
    res.json({ success: true, user })
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Test PayPal connection
app.get("/api/test-paypal", async (req, res) => {
  try {
    const accessToken = await getPayPalAccessToken()
    res.json({
      success: true,
      message: "PayPal connection successful",
      tokenLength: accessToken.length,
      demoMode: DEMO_MODE,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: "PayPal connection failed - Check your credentials",
    })
  }
})

// Create PayPal Order for Subscription
app.post("/api/create-subscription-order", async (req, res) => {
  try {
    const { userId } = req.body
    console.log("🚀 Creating subscription order for user:", userId)

    const accessToken = await getPayPalAccessToken()

    const orderData = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: "49.00",
          },
          description: DEMO_MODE
              ? "DEMO: Monthly Credit Subscription - 300 Credits (5min renewal)"
              : "Monthly Credit Subscription - 300 Credits ($49/month)",
          custom_id: `sub_${userId}`,
        },
      ],
      application_context: {
        brand_name: DEMO_MODE ? "Credits System (DEMO)" : "Credits System",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: `http://localhost:3000/?payment=success&type=subscription&userId=${userId}`,
        cancel_url: `http://localhost:3000/?payment=cancelled`,
      },
    }

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": `subscription-${userId}-${Date.now()}`,
      },
      body: JSON.stringify(orderData),
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw new Error(`PayPal order creation failed: ${response.status} - ${responseText}`)
    }

    const order = JSON.parse(responseText)

    if (order.id && order.links) {
      const approvalUrl = order.links.find((link) => link.rel === "approve")?.href

      console.log("✅ PayPal order created successfully:", order.id)

      res.json({
        success: true,
        orderId: order.id,
        approvalUrl: approvalUrl,
      })
    } else {
      res.status(500).json({
        success: false,
        error: "Invalid PayPal order response",
        details: order,
      })
    }
  } catch (error) {
    console.error("❌ PayPal subscription order error:", error.message)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Enhanced payment success handler
app.get("/api/payment-success", async (req, res) => {
  try {
    const { token, PayerID, userId, type } = req.query

    if (!token || !PayerID || !userId) {
      return res.status(400).json({
        success: false,
        error: "Missing payment parameters",
      })
    }

    console.log("💰 Processing payment success:", { token, PayerID, userId, type })

    // Capture the payment
    const captureResult = await capturePayPalOrder(token, userId, type || "subscription")

    if (captureResult.success) {
      res.json({
        success: true,
        message: "Payment processed successfully",
        user: captureResult.user,
        payment: captureResult.payment,
      })
    } else {
      res.status(400).json(captureResult)
    }
  } catch (error) {
    console.error("❌ Payment success handler error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Enhanced capture function
async function capturePayPalOrder(orderId, userId, paymentType, isAutoRenewal = false) {
  try {
    console.log("💰 Capturing PayPal order:", { orderId, userId, paymentType })

    const accessToken = await getPayPalAccessToken()

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": `capture-${orderId}-${Date.now()}`,
      },
    })

    const responseText = await response.text()
    console.log("🔍 PayPal capture response status:", response.status)

    if (!response.ok) {
      console.log("🔍 PayPal capture error:", responseText)
      throw new Error(`PayPal capture failed: ${response.status} - ${responseText}`)
    }

    const capture = JSON.parse(responseText)

    if (capture.status === "COMPLETED") {
      const user = await User.findById(userId)
      if (!user) {
        throw new Error("User not found")
      }

      const amount = Number.parseFloat(capture.purchase_units[0].payments.captures[0].amount.value)
      const creditsToAdd = 300 // Always 300 credits for $49

      // Add credits (including rollover from previous month)
      user.credits += creditsToAdd

      // Update subscription info
      user.subscriptionStatus = "active"
      user.lastPaymentDate = new Date()

      // Set next payment date (5 minutes in demo mode, 1 month in production)
      user.nextPaymentDate = getNextRenewalDate(new Date())

      // If this is the first subscription, set start date
      if (!user.subscriptionStartDate) {
        user.subscriptionStartDate = new Date()
      }

      // Reset monthly usage tracking for new month
      if (isNewMonth(user.currentMonthStart)) {
        user.monthlyCreditsUsed = 0
        user.currentMonthStart = new Date()
      }

      await user.save()

      // Save payment record
      const payment = new Payment({
        userId: user._id,
        paypalOrderId: orderId,
        amount: amount,
        status: "completed",
        creditsAdded: creditsToAdd,
        paymentType: "subscription",
        isAutoRenewal: isAutoRenewal,
      })
      await payment.save()

      console.log(`✅ Payment captured successfully for user: ${user.email}`)
      console.log(`📊 User now has ${user.credits} credits, subscription: ${user.subscriptionStatus}`)
      console.log(`📅 Next renewal: ${user.nextPaymentDate}`)

      return {
        success: true,
        user,
        payment,
        message: `Payment successful! Added ${creditsToAdd} credits. ${DEMO_MODE ? "Next renewal in 5 minutes." : "Next renewal in 1 month."}`,
      }
    } else {
      console.error("❌ PayPal capture failed:", capture)
      return {
        success: false,
        error: "Payment not completed",
        details: capture,
      }
    }
  } catch (error) {
    console.error("❌ Capture error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

// Manual capture endpoint (for testing)
app.post("/api/capture-order", async (req, res) => {
  try {
    const { orderId, userId, paymentType, isAutoRenewal = false } = req.body

    const result = await capturePayPalOrder(orderId, userId, paymentType, isAutoRenewal)

    if (result.success) {
      res.json(result)
    } else {
      res.status(400).json(result)
    }
  } catch (error) {
    console.error("❌ Manual capture error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Use Credits
app.post("/api/use-credits", async (req, res) => {
  try {
    const { userId, creditsToUse } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }

    if (user.credits < creditsToUse) {
      return res.status(400).json({ success: false, error: "Insufficient credits" })
    }

    // Deduct credits
    user.credits -= creditsToUse

    // Track monthly usage
    if (isNewMonth(user.currentMonthStart)) {
      user.monthlyCreditsUsed = creditsToUse
      user.currentMonthStart = new Date()
    } else {
      user.monthlyCreditsUsed += creditsToUse
    }

    await user.save()

    console.log(`💳 User ${user.email} used ${creditsToUse} credits, ${user.credits} remaining`)

    res.json({
      success: true,
      remainingCredits: user.credits,
      monthlyUsed: user.monthlyCreditsUsed,
      needsSubscription: user.credits === 0 && user.subscriptionStatus !== "active",
    })
  } catch (error) {
    console.error("Use credits error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Cancel Subscription
app.post("/api/cancel-subscription", async (req, res) => {
  try {
    const { userId } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }

    user.subscriptionStatus = "cancelled"
    user.nextPaymentDate = null
    await user.save()

    console.log(`❌ Subscription cancelled for user: ${user.email}`)

    res.json({
      success: true,
      message: "Subscription cancelled successfully. Your remaining credits will not expire.",
      user: user,
    })
  } catch (error) {
    console.error("Cancel subscription error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Reactivate Subscription
app.post("/api/reactivate-subscription", async (req, res) => {
  try {
    const { userId } = req.body
    console.log("🔄 Reactivating subscription for user:", userId)

    const accessToken = await getPayPalAccessToken()

    const orderData = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: "49.00",
          },
          description: DEMO_MODE
              ? "DEMO: Reactivate Monthly Subscription - 300 Credits (5min renewal)"
              : "Reactivate Monthly Subscription - 300 Credits",
          custom_id: `reactivate_${userId}`,
        },
      ],
      application_context: {
        brand_name: DEMO_MODE ? "Credits System (DEMO)" : "Credits System",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: `http://localhost:3000/?payment=success&type=subscription&userId=${userId}`,
        cancel_url: `http://localhost:3000/?payment=cancelled`,
      },
    }

    const response = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "PayPal-Request-Id": `reactivate-${userId}-${Date.now()}`,
      },
      body: JSON.stringify(orderData),
    })

    const responseText = await response.text()

    if (!response.ok) {
      throw new Error(`PayPal reactivation order creation failed: ${response.status} - ${responseText}`)
    }

    const order = JSON.parse(responseText)

    if (order.id && order.links) {
      const approvalUrl = order.links.find((link) => link.rel === "approve")?.href

      console.log("✅ PayPal reactivation order created:", order.id)

      res.json({
        success: true,
        orderId: order.id,
        approvalUrl: approvalUrl,
      })
    } else {
      res.status(500).json({
        success: false,
        error: "Invalid PayPal reactivation order response",
        details: order,
      })
    }
  } catch (error) {
    console.error("❌ PayPal reactivation error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Manual renewal trigger (for testing)
app.post("/api/trigger-renewal", async (req, res) => {
  try {
    const { userId } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }

    if (user.subscriptionStatus !== "active") {
      return res.status(400).json({ success: false, error: "No active subscription" })
    }

    // Simulate auto-renewal
    user.credits += 300
    user.lastPaymentDate = new Date()
    user.nextPaymentDate = getNextRenewalDate(new Date())
    user.monthlyCreditsUsed = 0
    user.currentMonthStart = new Date()

    await user.save()

    // Create payment record for manual renewal
    const payment = new Payment({
      userId: user._id,
      paypalOrderId: `manual-renewal-${Date.now()}-${user._id}`,
      amount: 49.0,
      status: "completed",
      creditsAdded: 300,
      paymentType: "subscription",
      isAutoRenewal: true,
    })
    await payment.save()

    console.log(`🔄 Manual renewal triggered for user: ${user.email}`)

    res.json({
      success: true,
      message: "Renewal triggered successfully! Added 300 credits.",
      user: user,
      payment: payment,
    })
  } catch (error) {
    console.error("Manual renewal error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get Payment History
app.get("/api/payments/:userId", async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(20)
    res.json({ success: true, payments })
  } catch (error) {
    console.error("Get payments error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Get User Stats
app.get("/api/user-stats/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }

    const totalPayments = await Payment.countDocuments({ userId: req.params.userId })
    const totalSpent = await Payment.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.params.userId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ])

    const stats = {
      totalCreditsRemaining: user.credits,
      monthlyCreditsUsed: user.monthlyCreditsUsed,
      subscriptionStatus: user.subscriptionStatus,
      nextPaymentDate: user.nextPaymentDate,
      totalPayments: totalPayments,
      totalSpent: totalSpent.length > 0 ? totalSpent[0].total : 0,
      subscriptionStartDate: user.subscriptionStartDate,
      demoMode: DEMO_MODE,
    }

    res.json({ success: true, stats })
  } catch (error) {
    console.error("Get user stats error:", error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// Enhanced cron job for automatic renewals
// In demo mode: runs every minute, in production: runs daily at 9 AM
const cronSchedule = DEMO_MODE ? "* * * * *" : "0 9 * * *" // Every minute vs daily at 9 AM

cron.schedule(cronSchedule, async () => {
  const modeText = DEMO_MODE ? "DEMO MODE - Every minute" : "PRODUCTION MODE - Daily at 9 AM"
  console.log(`🔄 Checking for automatic subscription renewals... (${modeText})`)

  try {
    const usersForRenewal = await User.find({
      subscriptionStatus: "active",
      nextPaymentDate: { $lte: new Date() },
    })

    console.log(`Found ${usersForRenewal.length} users for automatic renewal`)

    for (const user of usersForRenewal) {
      try {
        // Add 300 credits (including any rollover from previous month)
        user.credits += 300
        user.lastPaymentDate = new Date()
        user.nextPaymentDate = getNextRenewalDate(new Date())

        // Reset monthly usage for new month
        user.monthlyCreditsUsed = 0
        user.currentMonthStart = new Date()

        await user.save()

        // Create payment record for auto-renewal
        const payment = new Payment({
          userId: user._id,
          paypalOrderId: `auto-renewal-${Date.now()}-${user._id}`,
          amount: 49.0,
          status: "completed",
          creditsAdded: 300,
          paymentType: "subscription",
          isAutoRenewal: true,
        })
        await payment.save()

        console.log(`✅ Auto-renewed subscription for user: ${user.email} (${user.credits} total credits)`)
      } catch (error) {
        console.error(`❌ Failed to auto-renew for user ${user.email}:`, error)
      }
    }
  } catch (error) {
    console.error("Error processing automatic renewals:", error)
  }
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`💳 PayPal Environment: Sandbox`)
  console.log(`🎮 Demo Mode: ${DEMO_MODE ? "ENABLED (5-minute renewals)" : "DISABLED (monthly renewals)"}`)
  console.log(`📅 Auto-renewal cron job: ${DEMO_MODE ? "Every minute" : "Daily at 9 AM"}`)

  // Test PayPal connection on startup
  getPayPalAccessToken()
      .then(() => console.log("✅ PayPal connection test successful"))
      .catch((error) => {
        console.error("❌ PayPal connection test failed")
        console.error("Please update your PayPal credentials in the .env file")
      })
})
