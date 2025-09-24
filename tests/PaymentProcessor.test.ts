import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_AMOUNT = 101;
const ERR_ORDER_ALREADY_PAID = 103;
const ERR_ORDER_NOT_FOUND = 106;
const ERR_INVALID_VENDOR = 107;
const ERR_PAYMENT_ALREADY_PROCESSED = 109;
const ERR_ESCROW_NOT_SET = 111;
const ERR_INVALID_FEE_RATE = 113;
const ERR_MAX_PAYMENTS_EXCEEDED = 114;
const ERR_INVALID_CURRENCY = 115;
const ERR_INVALID_LOCATION = 116;
const ERR_INVALID_GRACE_PERIOD = 117;
const ERR_INVALID_INTEREST_RATE = 118;
const ERR_NOT_OWNER = 119;
const ERR_INVALID_UPDATE_PARAM = 120;

interface Payment {
  customer: string;
  vendor: string;
  amount: number;
  status: string;
  timestamp: number;
  fee: number;
  currency: string;
  location: string;
  gracePeriod: number;
  interestRate: number;
}

interface PaymentUpdate {
  updateStatus: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PaymentProcessorMock {
  state: {
    contractOwner: string;
    escrowContract: string | null;
    paymentFeeRate: number;
    maxPayments: number;
    nextPaymentId: number;
    creationFee: number;
    payments: Map<number, Payment>;
    paymentUpdates: Map<number, PaymentUpdate>;
  } = {
    contractOwner: "ST1OWNER",
    escrowContract: null,
    paymentFeeRate: 1,
    maxPayments: 10000,
    nextPaymentId: 0,
    creationFee: 500,
    payments: new Map(),
    paymentUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CUSTOMER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      escrowContract: null,
      paymentFeeRate: 1,
      maxPayments: 10000,
      nextPaymentId: 0,
      creationFee: 500,
      payments: new Map(),
      paymentUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CUSTOMER";
    this.stxTransfers = [];
  }

  setEscrowContract(contractPrincipal: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    this.state.escrowContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setPaymentFeeRate(newRate: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    if (newRate < 0 || newRate > 10) return { ok: false, value: false };
    this.state.paymentFeeRate = newRate;
    return { ok: true, value: true };
  }

  setMaxPayments(newMax: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxPayments = newMax;
    return { ok: true, value: true };
  }

  setCreationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.creationFee = newFee;
    return { ok: true, value: true };
  }

  processPayment(
    orderId: number,
    vendor: string,
    amount: number,
    currency: string,
    location: string,
    gracePeriod: number,
    interestRate: number
  ): Result<number> {
    if (this.state.nextPaymentId >= this.state.maxPayments) return { ok: false, value: ERR_MAX_PAYMENTS_EXCEEDED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (vendor === this.caller) return { ok: false, value: ERR_INVALID_VENDOR };
    if (!["STX", "BTC", "USD"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!location || location.length > 50) return { ok: false, value: ERR_INVALID_LOCATION };
    if (gracePeriod > 30) return { ok: false, value: ERR_INVALID_GRACE_PERIOD };
    if (interestRate > 20) return { ok: false, value: ERR_INVALID_INTEREST_RATE };
    if (this.state.payments.has(orderId)) return { ok: false, value: ERR_ORDER_ALREADY_PAID };
    if (!this.state.escrowContract) return { ok: false, value: ERR_ESCROW_NOT_SET };

    const fee = Math.floor(amount * (this.state.paymentFeeRate / 100));
    const netAmount = amount - fee;
    this.stxTransfers.push({ amount, from: this.caller, to: this.state.escrowContract });
    this.stxTransfers.push({ amount: fee, from: this.state.escrowContract, to: this.state.contractOwner });

    const payment: Payment = {
      customer: this.caller,
      vendor,
      amount: netAmount,
      status: "pending",
      timestamp: this.blockHeight,
      fee,
      currency,
      location,
      gracePeriod,
      interestRate,
    };
    this.state.payments.set(orderId, payment);
    this.state.nextPaymentId++;
    return { ok: true, value: orderId };
  }

  completePayment(orderId: number): Result<boolean> {
    const payment = this.state.payments.get(orderId);
    if (!payment) return { ok: false, value: false };
    if (payment.vendor !== this.caller) return { ok: false, value: false };
    if (payment.status !== "pending") return { ok: false, value: false };
    if (!this.state.escrowContract) return { ok: false, value: false };

    this.stxTransfers.push({ amount: payment.amount, from: this.state.escrowContract, to: payment.vendor });
    const updated: Payment = { ...payment, status: "completed", timestamp: this.blockHeight };
    this.state.payments.set(orderId, updated);
    this.state.paymentUpdates.set(orderId, {
      updateStatus: "completed",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  refundPayment(orderId: number): Result<boolean> {
    const payment = this.state.payments.get(orderId);
    if (!payment) return { ok: false, value: false };
    if (payment.customer !== this.caller && payment.vendor !== this.caller) return { ok: false, value: false };
    if (payment.status !== "pending") return { ok: false, value: false };
    if (!this.state.escrowContract) return { ok: false, value: false };

    this.stxTransfers.push({ amount: payment.amount, from: this.state.escrowContract, to: payment.customer });
    const updated: Payment = { ...payment, status: "refunded", timestamp: this.blockHeight };
    this.state.payments.set(orderId, updated);
    this.state.paymentUpdates.set(orderId, {
      updateStatus: "refunded",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getPaymentCount(): Result<number> {
    return { ok: true, value: this.state.nextPaymentId };
  }
}

describe("PaymentProcessor", () => {
  let contract: PaymentProcessorMock;

  beforeEach(() => {
    contract = new PaymentProcessorMock();
    contract.reset();
  });

  it("processes payment successfully", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    const result = contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const payment = contract.state.payments.get(1);
    expect(payment?.amount).toBe(990);
    expect(payment?.status).toBe("pending");
    expect(payment?.fee).toBe(10);
    expect(contract.stxTransfers).toEqual([
      { amount: 1000, from: "ST1CUSTOMER", to: "ST2ESCROW" },
      { amount: 10, from: "ST2ESCROW", to: "ST1OWNER" },
    ]);
  });

  it("rejects payment without escrow", () => {
    const result = contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ESCROW_NOT_SET);
  });

  it("rejects invalid amount", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    const result = contract.processPayment(1, "ST3VENDOR", 0, "STX", "TruckLocation", 7, 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("completes payment successfully", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    contract.caller = "ST3VENDOR";
    const result = contract.completePayment(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const payment = contract.state.payments.get(1);
    expect(payment?.status).toBe("completed");
    expect(contract.stxTransfers[2]).toEqual({ amount: 990, from: "ST2ESCROW", to: "ST3VENDOR" });
  });

  it("rejects complete by non-vendor", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    contract.caller = "ST4UNAUTH";
    const result = contract.completePayment(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("refunds payment successfully", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    contract.caller = "ST1CUSTOMER";
    const result = contract.refundPayment(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const payment = contract.state.payments.get(1);
    expect(payment?.status).toBe("refunded");
    expect(contract.stxTransfers[2]).toEqual({ amount: 990, from: "ST2ESCROW", to: "ST1CUSTOMER" });
  });

  it("rejects refund by unauthorized", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    contract.caller = "ST4UNAUTH";
    const result = contract.refundPayment(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets fee rate successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setPaymentFeeRate(2);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.paymentFeeRate).toBe(2);
  });

  it("rejects fee rate by non-owner", () => {
    contract.caller = "ST1CUSTOMER";
    const result = contract.setPaymentFeeRate(2);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct payment count", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    contract.processPayment(2, "ST3VENDOR", 2000, "STX", "TruckLocation", 7, 5);
    const result = contract.getPaymentCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("parses payment params with Clarity types", () => {
    const currency = stringAsciiCV("STX");
    const amount = uintCV(1000);
    expect(currency.value).toBe("STX");
    expect(amount.value).toEqual(BigInt(1000));
  });

  it("rejects max payments exceeded", () => {
    contract.caller = "ST1OWNER";
    contract.setEscrowContract("ST2ESCROW");
    contract.caller = "ST1CUSTOMER";
    contract.state.maxPayments = 1;
    contract.processPayment(1, "ST3VENDOR", 1000, "STX", "TruckLocation", 7, 5);
    const result = contract.processPayment(2, "ST3VENDOR", 2000, "STX", "TruckLocation", 7, 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PAYMENTS_EXCEEDED);
  });
});