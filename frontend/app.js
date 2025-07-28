const API_BASE = "http://localhost:5000/api"
let currentUser = null
let userStats = null

// Show message function
function showMessage(message, type = "info") {
  const messagesDiv = document.getElementById("messages")
  messagesDiv.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `

  // Auto dismiss after 5 seconds
  setTimeout(() => {
    messagesDiv.innerHTML = ""
  }, 5000)
}

// Check URL parameters for payment status
function checkPaymentStatus() {
  const urlParams = new URLSearchParams(window.location.search)
  const payment = urlParams.get("payment")
  const token = urlParams.get("token")
  const PayerID = urlParams.get("PayerID")
  const type = urlParams.get("type")
  const userId = urlParams.get("userId")

  if (payment === "success" && token && PayerID && type && userId) {
    console.log("🎉 Payment success detected, processing...")
    processPaymentSuccess(token, PayerID, userId, type)
  } else if (payment === "cancelled") {
    showMessage("Payment was cancelled. You can try again anytime.", "warning")
    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname)
  }
}

// Process payment success
async function processPaymentSuccess(token, PayerID, userId, type) {
  try {
    showMessage("Processing your payment...", "info")

    const response = await fetch(
        `${API_BASE}/payment-success?token=${token}&PayerID=${PayerID}&userId=${userId}&type=${type}`,
    )
    const data = await response.json()

    if (data.success) {
      showMessage(data.message || "Payment successful! 300 credits added to your account.", "success")

      // Update user data if logged in
      if (currentUser && currentUser._id === userId) {
        currentUser = data.user
        console.log("✅ User data updated after payment:", currentUser)
        updateDashboard()
        loadPaymentHistory()
        loadUserStats()

        // Force refresh the subscription section
        setTimeout(() => {
          updateSubscriptionSection()
        }, 1000)
      }
    } else {
      console.error("Payment processing failed:", data)
      showMessage("Payment processing failed: " + (data.error || "Unknown error"), "danger")
    }

    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname)
  } catch (error) {
    console.error("Payment processing error:", error)
    showMessage("Error processing payment: " + error.message, "danger")
  }
}

// Login user
async function loginUser() {
  const email = document.getElementById("userEmail").value
  const name = document.getElementById("userName").value

  if (!email || !name) {
    showMessage("Please enter both email and name", "warning")
    return
  }

  try {
    const response = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, name }),
    })

    const data = await response.json()

    if (data.success) {
      currentUser = data.user
      document.getElementById("loginSection").style.display = "none"
      document.getElementById("dashboard").style.display = "block"
      enhancedUpdateDashboard()
      loadPaymentHistory()
      loadUserStats()
      showMessage(`Welcome ${currentUser.name}!`, "success")
    } else {
      showMessage("Login failed: " + data.error, "danger")
    }
  } catch (error) {
    console.error("Login error:", error)
    showMessage("Network error: " + error.message, "danger")
  }
}

// Update dashboard
function updateDashboard() {
  console.log("📊 Updating dashboard for user:", currentUser.email, "Status:", currentUser.subscriptionStatus)

  document.getElementById("creditCount").textContent = currentUser.credits

  // Update subscription status
  const statusText = currentUser.subscriptionStatus.charAt(0).toUpperCase() + currentUser.subscriptionStatus.slice(1)
  document.getElementById("subscriptionStatus").textContent = `Subscription: ${statusText}`

  if (currentUser.nextPaymentDate) {
    const nextDate = new Date(currentUser.nextPaymentDate).toLocaleString()
    document.getElementById("subscriptionStatus").textContent += ` | Next Payment: ${nextDate}`
  }

  // Update subscription management section
  updateSubscriptionSection()

  // Show/hide credits exhausted warning
  const creditsExhaustedWarning = document.getElementById("creditsExhaustedWarning")
  const useCreditsBtn = document.getElementById("useCreditsBtn")

  if (currentUser.credits === 0) {
    creditsExhaustedWarning.style.display = "block"
    useCreditsBtn.disabled = true
    useCreditsBtn.innerHTML = '<i class="fas fa-ban"></i> No Credits Available'
  } else {
    creditsExhaustedWarning.style.display = "none"
    useCreditsBtn.disabled = false
    useCreditsBtn.innerHTML = '<i class="fas fa-play"></i> Use Credits'
  }

  // Add success animation to credit card
  const creditCard = document.querySelector(".credit-card")
  creditCard.classList.add("success-animation")
  setTimeout(() => {
    creditCard.classList.remove("success-animation")
  }, 600)
}

// Update subscription section based on status
function updateSubscriptionSection() {
  const activeDiv = document.getElementById("activeSubscription")
  const inactiveDiv = document.getElementById("inactiveSubscription")
  const cancelledDiv = document.getElementById("cancelledSubscription")
  const badge = document.getElementById("subscriptionBadge")
  const managementSection = document.getElementById("subscriptionManagement")

  // Hide all sections first
  activeDiv.style.display = "none"
  inactiveDiv.style.display = "none"
  cancelledDiv.style.display = "none"

  // Remove all status classes
  managementSection.classList.remove("subscription-active", "subscription-inactive", "subscription-cancelled")

  console.log("🔄 Updating subscription section, status:", currentUser.subscriptionStatus)

  switch (currentUser.subscriptionStatus) {
    case "active":
      activeDiv.style.display = "block"
      badge.textContent = "Active"
      badge.className = "badge bg-success"
      managementSection.classList.add("subscription-active")
      if (currentUser.nextPaymentDate) {
        document.getElementById("nextPaymentDate").textContent = new Date(currentUser.nextPaymentDate).toLocaleString()
      }
      break

    case "cancelled":
      cancelledDiv.style.display = "block"
      badge.textContent = "Cancelled"
      badge.className = "badge bg-warning"
      managementSection.classList.add("subscription-cancelled")
      break

    default: // inactive
      inactiveDiv.style.display = "block"
      badge.textContent = "Inactive"
      badge.className = "badge bg-secondary"
      managementSection.classList.add("subscription-inactive")
      break
  }
}

// Use credits
async function useCredits() {
  const creditsToUse = Number.parseInt(document.getElementById("creditsToUse").value)

  if (!creditsToUse || creditsToUse <= 0) {
    showMessage("Please enter a valid number of credits", "warning")
    return
  }

  if (creditsToUse > currentUser.credits) {
    showMessage("Insufficient credits available", "warning")
    return
  }

  try {
    const response = await fetch(`${API_BASE}/use-credits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: currentUser._id,
        creditsToUse: creditsToUse,
      }),
    })

    const data = await response.json()

    if (data.success) {
      currentUser.credits = data.remainingCredits
      updateDashboard()
      loadUserStats()
      document.getElementById("creditsToUse").value = ""

      if (data.needsSubscription) {
        showMessage(
            `Used ${creditsToUse} credits. You're out of credits! Subscribe to get 300 more credits.`,
            "warning",
        )
      } else {
        showMessage(`Successfully used ${creditsToUse} credits`, "success")
      }
    } else {
      showMessage("Error using credits: " + data.error, "danger")
    }
  } catch (error) {
    console.error("Use credits error:", error)
    showMessage("Network error: " + error.message, "danger")
  }
}

// Start subscription
async function startSubscription() {
  const btn = document.getElementById("subscribeBtn")
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating PayPal order...'

  try {
    console.log("Starting subscription for user:", currentUser._id)

    const response = await fetch(`${API_BASE}/create-subscription-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: currentUser._id }),
    })

    const data = await response.json()
    console.log("Subscription order response:", data)

    if (data.success && data.approvalUrl) {
      console.log("Redirecting to PayPal:", data.approvalUrl)
      window.location.href = data.approvalUrl
    } else {
      console.error("Failed to create PayPal order:", data)
      showMessage("Failed to create PayPal order: " + (data.error || "Unknown error"), "danger")
    }
  } catch (error) {
    console.error("Start subscription error:", error)
    showMessage("Network error: " + error.message, "danger")
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fab fa-paypal"></i> Subscribe Now - $49/month'
  }
}

// Cancel subscription
async function cancelSubscription() {
  if (!confirm("Are you sure you want to cancel your subscription? Your remaining credits won't expire.")) {
    return
  }

  try {
    const response = await fetch(`${API_BASE}/cancel-subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: currentUser._id }),
    })

    const data = await response.json()

    if (data.success) {
      currentUser = data.user
      updateDashboard()
      showMessage(data.message, "success")
    } else {
      showMessage("Failed to cancel subscription: " + data.error, "danger")
    }
  } catch (error) {
    console.error("Cancel subscription error:", error)
    showMessage("Network error: " + error.message, "danger")
  }
}

// Reactivate subscription
async function reactivateSubscription() {
  const btn = document.getElementById("reactivateBtn")
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating PayPal order...'

  try {
    console.log("Reactivating subscription for user:", currentUser._id)

    const response = await fetch(`${API_BASE}/reactivate-subscription`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: currentUser._id }),
    })

    const data = await response.json()
    console.log("Reactivation order response:", data)

    if (data.success && data.approvalUrl) {
      console.log("Redirecting to PayPal:", data.approvalUrl)
      window.location.href = data.approvalUrl
    } else {
      console.error("Failed to create PayPal reactivation order:", data)
      showMessage("Failed to create PayPal order: " + (data.error || "Unknown error"), "danger")
    }
  } catch (error) {
    console.error("Reactivate subscription error:", error)
    showMessage("Network error: " + error.message, "danger")
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fab fa-paypal"></i> Reactivate Subscription - $49/month'
  }
}

// Manual renewal trigger (for testing)
async function triggerRenewal() {
  if (!currentUser || currentUser.subscriptionStatus !== "active") {
    showMessage("No active subscription to renew", "warning")
    return
  }

  try {
    const response = await fetch(`${API_BASE}/trigger-renewal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: currentUser._id }),
    })

    const data = await response.json()

    if (data.success) {
      currentUser = data.user
      updateDashboard()
      loadPaymentHistory()
      loadUserStats()
      showMessage(data.message, "success")
    } else {
      showMessage("Failed to trigger renewal: " + data.error, "danger")
    }
  } catch (error) {
    console.error("Trigger renewal error:", error)
    showMessage("Network error: " + error.message, "danger")
  }
}

// Load payment history
async function loadPaymentHistory() {
  try {
    const response = await fetch(`${API_BASE}/payments/${currentUser._id}`)
    const data = await response.json()

    if (data.success) {
      const historyDiv = document.getElementById("paymentHistory")

      if (data.payments.length === 0) {
        historyDiv.innerHTML = '<p class="text-muted">No payment history found</p>'
        return
      }

      historyDiv.innerHTML = data.payments
          .map(
              (payment) => `
                <div class="history-item">
                    <strong>
                        <i class="fas fa-check-circle text-success"></i> 
                        ${payment.isAutoRenewal ? "Auto-Renewal" : "Manual Payment"}
                    </strong><br>
                    <small class="text-muted">
                        $${payment.amount.toFixed(2)} - ${payment.creditsAdded} credits - 
                        ${new Date(payment.createdAt).toLocaleString()}
                        ${payment.isAutoRenewal ? '<span class="badge bg-info ms-2">Auto</span>' : '<span class="badge bg-primary ms-2">Manual</span>'}
                    </small>
                </div>
            `,
          )
          .join("")
    }
  } catch (error) {
    console.error("Error loading payment history:", error)
  }
}

// Load user stats
async function loadUserStats() {
  try {
    const response = await fetch(`${API_BASE}/user-stats/${currentUser._id}`)
    const data = await response.json()

    if (data.success) {
      userStats = data.stats
      document.getElementById("monthlyUsed").textContent = userStats.monthlyCreditsUsed
      document.getElementById("totalPayments").textContent = userStats.totalPayments
      document.getElementById("totalSpent").textContent = `$${userStats.totalSpent.toFixed(2)}`

      // Show demo mode indicator
      if (userStats.demoMode) {
        const demoIndicator = document.createElement("div")
        demoIndicator.className = "alert alert-info mt-2"
        demoIndicator.innerHTML = "<strong>🎮 DEMO MODE:</strong> Renewals happen every 5 minutes instead of monthly!"

        // Add to dashboard if not already present
        if (!document.querySelector(".demo-indicator")) {
          demoIndicator.classList.add("demo-indicator")
          document.querySelector(".credit-card").after(demoIndicator)
        }
      }
    }
  } catch (error) {
    console.error("Error loading user stats:", error)
  }
}

// Auto-refresh user data every 30 seconds
setInterval(async () => {
  if (currentUser) {
    try {
      const response = await fetch(`${API_BASE}/users/${currentUser.email}`)
      const data = await response.json()

      if (data.success) {
        const oldCredits = currentUser.credits
        currentUser = data.user

        // Show notification if credits changed (auto-renewal happened)
        if (currentUser.credits > oldCredits) {
          showMessage(`🎉 Auto-renewal completed! Added ${currentUser.credits - oldCredits} credits.`, "success")
          loadPaymentHistory() // Refresh payment history
        }

        updateDashboard()
        loadUserStats()
      }
    } catch (error) {
      console.error("Error refreshing user data:", error)
    }
  }
}, 30000)

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  checkPaymentStatus()
})

// Add manual renewal button for testing (only show if subscription is active)
function addTestingButtons() {
  if (currentUser && currentUser.subscriptionStatus === "active") {
    const testingDiv = document.createElement("div")
    testingDiv.className = "subscription-section"
    testingDiv.innerHTML = `
      <h5><i class="fas fa-flask"></i> Testing Tools</h5>
      <div class="alert alert-warning">
        <strong>Demo Mode:</strong> Use these buttons to test the system
      </div>
      <button onclick="triggerRenewal()" class="btn btn-info me-2">
        <i class="fas fa-sync"></i> Trigger Manual Renewal
      </button>
      <small class="text-muted">Simulates an automatic renewal payment</small>
    `

    // Add after subscription management section
    document.getElementById("subscriptionManagement").after(testingDiv)
  }
}

// Call this after login
function enhancedUpdateDashboard() {
  updateDashboard()
  addTestingButtons()
}
