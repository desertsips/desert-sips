const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { total, description, notes, subscribe, order } = req.body;

  if (!total || total < 100) {
    return res.status(400).json({ error: 'Invalid order total' });
  }

  try {
    const orderSummary = order.map(b =>
      `Bottle ${b.bottle}: ${b.drink}${b.boosts.length ? ` [+${b.boosts.join(', ')}]` : ''}`
    ).join('\n');

    const metadata = {
      order_summary: orderSummary.substring(0, 500),
      notes: notes ? notes.substring(0, 200) : '',
      subscribe: subscribe ? 'yes' : 'no',
    };

    if (subscribe) {
      // Create a recurring subscription via Stripe
      // First create a price object dynamically
      const price = await stripe.prices.create({
        currency: 'usd',
        unit_amount: total,
        recurring: { interval: 'week' },
        product_data: {
          name: 'Desert Sips — Weekly Subscription',
          metadata,
        },
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${req.headers.origin}?order=success`,
        cancel_url: `${req.headers.origin}#order`,
        payment_method_types: ['card', 'cashapp'],
        subscription_data: { metadata },
        custom_text: {
          submit: { message: 'Cancellations require 7-day notice via email to hello@desertsips.co' }
        },
        metadata,
      });

      return res.status(200).json({ url: session.url });

    } else {
      // One-time payment
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: total,
            product_data: {
              name: 'Desert Sips Order',
              description: description.substring(0, 500),
            },
          },
          quantity: 1,
        }],
        payment_method_types: ['card', 'cashapp'],
        success_url: `${req.headers.origin}?order=success`,
        cancel_url: `${req.headers.origin}#order`,
        custom_text: {
          submit: { message: 'Delivery included. Arriving Sunday morning to the Enclave.' }
        },
        metadata,
      });

      return res.status(200).json({ url: session.url });
    }

  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
