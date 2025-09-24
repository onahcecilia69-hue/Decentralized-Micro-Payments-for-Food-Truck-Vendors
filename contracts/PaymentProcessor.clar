(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-AMOUNT u101)
(define-constant ERR-PAYMENT-FAILED u102)
(define-constant ERR-ORDER-ALREADY-PAID u103)
(define-constant ERR-INSUFFICIENT-BALANCE u104)
(define-constant ERR-INVALID-STATUS u105)
(define-constant ERR-ORDER-NOT-FOUND u106)
(define-constant ERR-INVALID-VENDOR u107)
(define-constant ERR-INVALID-CUSTOMER u108)
(define-constant ERR-PAYMENT-ALREADY-PROCESSED u109)
(define-constant ERR-INVALID-TIMESTAMP u110)
(define-constant ERR-ESCROW-NOT-SET u111)
(define-constant ERR-TRANSFER-FAILED u112)
(define-constant ERR-INVALID-FEE-RATE u113)
(define-constant ERR-MAX-PAYMENTS-EXCEEDED u114)
(define-constant ERR-INVALID-CURRENCY u115)
(define-constant ERR-INVALID-LOCATION u116)
(define-constant ERR-INVALID-GRACE-PERIOD u117)
(define-constant ERR-INVALID-INTEREST-RATE u118)
(define-constant ERR-NOT-OWNER u119)
(define-constant ERR-INVALID-UPDATE-PARAM u120)

(define-data-var contract-owner principal tx-sender)
(define-data-var escrow-contract (optional principal) none)
(define-data-var payment-fee-rate uint u1)
(define-data-var max-payments uint u10000)
(define-data-var next-payment-id uint u0)
(define-data-var creation-fee uint u500)

(define-map payments
  { order-id: uint }
  {
    customer: principal,
    vendor: principal,
    amount: uint,
    status: (string-ascii 20),
    timestamp: uint,
    fee: uint,
    currency: (string-ascii 10),
    location: (string-utf8 50),
    grace-period: uint,
    interest-rate: uint
  }
)

(define-map payment-updates
  { order-id: uint }
  {
    update-status: (string-ascii 20),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-payment (order-id uint))
  (map-get? payments { order-id: order-id })
)

(define-read-only (get-payment-updates (order-id uint))
  (map-get? payment-updates { order-id: order-id })
)

(define-read-only (get-owner)
  (ok (var-get contract-owner))
)

(define-read-only (get-escrow-contract)
  (ok (var-get escrow-contract))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-vendor (vendor principal))
  (if (not (is-eq vendor tx-sender))
      (ok true)
      (err ERR-INVALID-VENDOR))
)

(define-private (validate-customer (customer principal))
  (if (not (is-eq customer tx-sender))
      (ok true)
      (err ERR-INVALID-CUSTOMER))
)

(define-private (validate-status (status (string-ascii 20)))
  (if (or (is-eq status "pending") (is-eq status "completed") (is-eq status "refunded"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-fee-rate (rate uint))
  (if (and (>= rate u0) (<= rate u10))
      (ok true)
      (err ERR-INVALID-FEE-RATE))
)

(define-private (validate-currency (cur (string-ascii 10)))
  (if (or (is-eq cur "STX") (is-eq cur "BTC") (is-eq cur "USD"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-location (loc (string-utf8 50)))
  (if (and (> (len loc) u0) (<= (len loc) u50))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-grace-period (period uint))
  (if (<= period u30)
      (ok true)
      (err ERR-INVALID-GRACE-PERIOD))
)

(define-private (validate-interest-rate (rate uint))
  (if (<= rate u20)
      (ok true)
      (err ERR-INVALID-INTEREST-RATE))
)

(define-public (set-escrow-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (var-set escrow-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-payment-fee-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (try! (validate-fee-rate new-rate))
    (var-set payment-fee-rate new-rate)
    (ok true)
  )
)

(define-public (set-max-payments (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-payments new-max)
    (ok true)
  )
)

(define-public (set-creation-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-OWNER))
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set creation-fee new-fee)
    (ok true)
  )
)

(define-public (process-payment
  (order-id uint)
  (vendor principal)
  (amount uint)
  (currency (string-ascii 10))
  (location (string-utf8 50))
  (grace-period uint)
  (interest-rate uint)
)
  (let (
        (customer tx-sender)
        (fee (* amount (var-get payment-fee-rate)))
        (net-amount (- amount fee))
        (escrow (unwrap! (var-get escrow-contract) (err ERR-ESCROW-NOT-SET)))
        (next-id (var-get next-payment-id))
      )
    (asserts! (< next-id (var-get max-payments)) (err ERR-MAX-PAYMENTS-EXCEEDED))
    (try! (validate-amount amount))
    (try! (validate-vendor vendor))
    (try! (validate-customer customer))
    (try! (validate-currency currency))
    (try! (validate-location location))
    (try! (validate-grace-period grace-period))
    (try! (validate-interest-rate interest-rate))
    (asserts! (is-none (map-get? payments { order-id: order-id })) (err ERR-ORDER-ALREADY-PAID))
    (try! (stx-transfer? amount customer escrow))
    (try! (as-contract (stx-transfer? fee tx-sender (var-get contract-owner))))
    (map-set payments { order-id: order-id }
      {
        customer: customer,
        vendor: vendor,
        amount: net-amount,
        status: "pending",
        timestamp: block-height,
        fee: fee,
        currency: currency,
        location: location,
        grace-period: grace-period,
        interest-rate: interest-rate
      }
    )
    (var-set next-payment-id (+ next-id u1))
    (print { event: "payment-processed", order-id: order-id, amount: net-amount })
    (ok order-id)
  )
)

(define-public (complete-payment (order-id uint))
  (let ((payment (unwrap! (map-get? payments { order-id: order-id }) (err ERR-ORDER-NOT-FOUND))))
    (asserts! (is-eq (get vendor payment) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status payment) "pending") (err ERR-PAYMENT-ALREADY-PROCESSED))
    (let ((escrow (unwrap! (var-get escrow-contract) (err ERR-ESCROW-NOT-SET))))
      (try! (as-contract (stx-transfer? (get amount payment) tx-sender (get vendor payment))))
    )
    (map-set payments { order-id: order-id }
      (merge payment { status: "completed", timestamp: block-height })
    )
    (map-set payment-updates { order-id: order-id }
      { update-status: "completed", update-timestamp: block-height, updater: tx-sender }
    )
    (print { event: "payment-completed", order-id: order-id })
    (ok true)
  )
)

(define-public (refund-payment (order-id uint))
  (let ((payment (unwrap! (map-get? payments { order-id: order-id }) (err ERR-ORDER-NOT-FOUND))))
    (asserts! (or (is-eq (get customer payment) tx-sender) (is-eq (get vendor payment) tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status payment) "pending") (err ERR-PAYMENT-ALREADY-PROCESSED))
    (let ((escrow (unwrap! (var-get escrow-contract) (err ERR-ESCROW-NOT-SET))))
      (try! (as-contract (stx-transfer? (get amount payment) tx-sender (get customer payment))))
    )
    (map-set payments { order-id: order-id }
      (merge payment { status: "refunded", timestamp: block-height })
    )
    (map-set payment-updates { order-id: order-id }
      { update-status: "refunded", update-timestamp: block-height, updater: tx-sender }
    )
    (print { event: "payment-refunded", order-id: order-id })
    (ok true)
  )
)

(define-public (get-payment-count)
  (ok (var-get next-payment-id))
)