// RaffleBee Post-Purchase Opt-in Script
// This script runs after checkout completion to handle sweepstakes opt-in

(function() {
  // Check if we're on a thank you page
  if (window.location.pathname.includes('/thank_you') || window.location.pathname.includes('/orders/')) {
    // Get order information from Shopify
    const orderInfo = window.Shopify?.checkout;
    if (!orderInfo) return;

    const orderTotal = parseFloat(orderInfo.total_price);
    const shopDomain = window.location.hostname;
    const orderId = orderInfo.order_id;

    // Check if customer qualifies for sweepstakes
    fetch('https://raffle-bee-production.up.railway.app/api/cart-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cartTotal: orderTotal,
        shopDomain: shopDomain
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.qualified && orderId) {
        showOptInModal(orderId, shopDomain, data.prizeAmount || '$1,000', orderTotal);
      }
    })
    .catch(error => {
      console.error('RaffleBee: Error checking qualification:', error);
    });
  }

  function showOptInModal(orderId, shopDomain, prizeAmount, orderTotal) {
    // Create modal HTML
    const modalHTML = `
      <div id="rafflebee-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          background: white;
          padding: 30px;
          border-radius: 12px;
          max-width: 500px;
          margin: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        ">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 48px; margin-bottom: 10px;">🎯</div>
            <h2 style="margin: 0; color: #333; font-size: 24px; font-weight: 600;">
              Congratulations!
            </h2>
            <p style="color: #666; margin: 10px 0; font-size: 16px;">
              Your order of $${orderTotal.toFixed(2)} qualifies you for our quarterly sweepstakes!
            </p>
          </div>
          
          <div style="
            background: linear-gradient(135deg, #008060, #00a86b);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            margin-bottom: 20px;
          ">
            <div style="font-size: 32px; font-weight: bold; margin-bottom: 5px;">
              ${prizeAmount}
            </div>
            <div style="font-size: 14px; opacity: 0.9;">
              Quarterly Prize Pool
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
            Would you like to enter our sweepstakes? It's completely optional and free to enter. 
            Winners are selected quarterly, and we'll notify you by email if you win.
          </p>
          
          <div style="display: flex; gap: 10px;">
            <button id="rafflebee-yes" style="
              flex: 1;
              background: #008060;
              color: white;
              border: none;
              padding: 12px 20px;
              border-radius: 6px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
            ">
              Yes, Enter Me!
            </button>
            <button id="rafflebee-no" style="
              flex: 1;
              background: #f1f1f1;
              color: #666;
              border: none;
              padding: 12px 20px;
              border-radius: 6px;
              font-size: 16px;
              cursor: pointer;
            ">
              No Thanks
            </button>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 15px; margin-bottom: 0;">
            No purchase necessary. US residents only. You can opt-out anytime.
          </p>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Handle button clicks
    document.getElementById('rafflebee-yes').onclick = function() {
      submitOptIn(orderId, shopDomain, true);
    };

    document.getElementById('rafflebee-no').onclick = function() {
      submitOptIn(orderId, shopDomain, false);
    };

    // Close modal when clicking outside
    document.getElementById('rafflebee-modal').onclick = function(e) {
      if (e.target === this) {
        submitOptIn(orderId, shopDomain, false);
      }
    };
  }

  function submitOptIn(orderId, shopDomain, optIn) {
    // Submit opt-in choice to RaffleBee API
    fetch('https://raffle-bee-production.up.railway.app/api/opt-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: orderId,
        customerOptIn: optIn,
        shopDomain: shopDomain
      })
    })
    .then(response => response.json())
    .then(data => {
      // Remove modal
      const modal = document.getElementById('rafflebee-modal');
      if (modal) {
        modal.remove();
      }

      // Show confirmation message
      if (optIn) {
        showThankYouMessage();
      }
    })
    .catch(error => {
      console.error('RaffleBee: Error submitting opt-in:', error);
      // Remove modal anyway
      const modal = document.getElementById('rafflebee-modal');
      if (modal) {
        modal.remove();
      }
    });
  }

  function showThankYouMessage() {
    const thankYouHTML = `
      <div id="rafflebee-thanks" style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #008060;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 300px;
      ">
        <div style="font-weight: 600; margin-bottom: 5px;">🎉 You're entered!</div>
        <div style="font-size: 14px; opacity: 0.9;">
          Good luck in our quarterly sweepstakes drawing!
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', thankYouHTML);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      const thanks = document.getElementById('rafflebee-thanks');
      if (thanks) {
        thanks.remove();
      }
    }, 5000);
  }
})();