# 🍔 Decentralized Micro-Payments for Food Truck Vendors

Welcome to a decentralized payment solution built on the Stacks blockchain for food truck vendors! This project enables instant micro-payments, transparent order tracking, and customer loyalty rewards using Clarity smart contracts.

## ✨ Features

- ⚡ **Instant Payments**: Process micro-payments instantly with minimal fees using STX tokens.
- 📜 **Order Transparency**: Immutable records of orders for vendors and customers.
- 🎁 **Loyalty Rewards**: Tokenized rewards for repeat customers to encourage loyalty.
- 🔐 **Secure Transactions**: Trustless payments via smart contracts, no intermediaries.
- ✅ **Dispute Resolution**: Verifiable proof of orders for resolving disputes.
- 🛒 **Vendor Profiles**: Public vendor ratings and order history for transparency.
- 🔄 **Refund Mechanism**: Automated refunds for unfulfilled orders.

## 🛠 How It Works

**For Customers**
1. Browse vendor profiles and menus via the dApp.
2. Place an order by calling the `place-order` function with payment in STX.
3. Receive a unique order ID and, upon successful delivery, earn loyalty tokens.
4. Verify order details or request refunds using the order ID.

**For Vendors**
1. Register a vendor profile with a unique ID and menu details.
2. Receive instant payments for orders, tracked immutably.
3. Issue loyalty tokens to customers via the `issue-loyalty-tokens` function.
4. Resolve disputes using order records or process refunds if needed.

**For Verifiers/Dispute Resolution**
- Use `get-order-details` to view order history and status.
- Check vendor ratings and payment proofs for transparency.
