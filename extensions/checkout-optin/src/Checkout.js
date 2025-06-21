import {
  useCheckoutSettings,
  useOrder,
  useCheckoutApi,
  Banner,
  Checkbox,
  Text,
  BlockStack,
  InlineStack,
  View,
} from '@shopify/checkout-ui-extensions-react';

export default function CheckoutOptIn() {
  const [isOptedIn, setIsOptedIn] = React.useState(false);
  const [showOptIn, setShowOptIn] = React.useState(false);
  const [prizeAmount, setPrizeAmount] = React.useState('$1,000');
  const [threshold, setThreshold] = React.useState(50);
  
  const { current: order } = useOrder();
  const { shop } = useCheckoutSettings();
  const api = useCheckoutApi();

  // Check if customer qualifies for sweepstakes
  React.useEffect(() => {
    if (order?.cost?.totalAmount?.amount && shop?.domain) {
      const orderTotal = parseFloat(order.cost.totalAmount.amount);
      
      fetch('https://raffle-bee-production.up.railway.app/api/cart-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cartTotal: orderTotal,
          shopDomain: shop.domain
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.qualified) {
          setShowOptIn(true);
          setThreshold(data.threshold);
          setPrizeAmount(data.prizeAmount || '$1,000');
        }
      })
      .catch(error => {
        console.error('RaffleBee: Error checking qualification:', error);
      });
    }
  }, [order, shop]);

  // Handle opt-in change
  const handleOptInChange = (checked) => {
    setIsOptedIn(checked);
    
    // Store opt-in preference for after order completion
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rafflebee_optin', checked ? 'true' : 'false');
    }
  };

  if (!showOptIn) {
    return null;
  }

  return (
    <View>
      <Banner status="info">
        <BlockStack spacing="base">
          <Text emphasis="strong">🎯 Congratulations! You qualify for our sweepstakes!</Text>
          <Text>
            Your order of ${order?.cost?.totalAmount?.amount || '0'} qualifies you to enter 
            our quarterly sweepstakes for a chance to win {prizeAmount}!
          </Text>
          
          <Checkbox
            checked={isOptedIn}
            onChange={handleOptInChange}
          >
            <Text>
              Yes, enter me in the sweepstakes! I understand this is optional and 
              I can opt-out at any time. Winners are selected quarterly.
            </Text>
          </Checkbox>
          
          {isOptedIn && (
            <View padding="base" background="subdued" cornerRadius="base">
              <Text size="small" appearance="subdued">
                ✓ You're entered! We'll notify you if you win. Good luck!
              </Text>
            </View>
          )}
          
          <Text size="small" appearance="subdued">
            By opting in, you agree to our sweepstakes terms. 
            No purchase necessary. US residents only.
          </Text>
        </BlockStack>
      </Banner>
    </View>
  );
}