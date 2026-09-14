module.exports = {
  htmlLang: "en",
  card: "Card",
  cash: "Cash",
  bankTransfer: "Bank transfer",
  tip: "Tip",
  item: "Item",
  reservation: "Reservation",
  serviceFee: "Service fee",
  ticketId: "Ticket ID",
  fastTrack: "Fast track",
  minSpendPrepayment: "Minimum-spend prepayment (multi-use voucher)",
  print: "Print",
  download: "Download",
  subjectWithVoucher: (venue) => `Payment confirmation and voucher, ${venue}`,
  subjectWithoutVoucher: (venue, currency, amount) =>
    `Payment confirmation, ${venue}, ${currency} ${amount}`,
  subjectCancellation: (venue) => `Payment cancellation, ${venue}`,
  openInApp: "Open in the app",
  invoiceEmailSubject: (numbers) =>
    numbers
      ? `Invoices for your purchase (${numbers})`
      : "Invoices for your purchase",
  invoiceEmail: {
    title: "Your invoices",
    heading: "Your invoices are ready",
    intro:
      "Thank you for your purchase. The fiscalized invoices for this order are attached as PDF files.",
    attachNote:
      "Please keep the attached PDFs for your records. The same documents are available in the app under Wallet → Transaction history.",
    footer:
      "Need help? Write to us at",
    preheader: (numbers) =>
      numbers
        ? `Your invoices (${numbers}) are attached.`
        : "Your invoices are attached.",
    labelVenue: "Venue",
    labelOrder: "Order",
    labelInvoices: "Invoice numbers",
  },
  // Legacy one-line body kept for any leftover callers
  invoiceEmailBody:
    "<p>The fiscalized invoices for your purchase are attached.</p>",
  invoicePdf: {
    htmlLang: "en",
    title: "Invoice",
    titleSecondary: "Račun",
    pageWord: "page",
    details: "Invoice details",
    invoiceNumber: "Invoice number",
    fiscalizationNumber: "Fiscalization number (JIR)",
    fiscalProtectionCode: "Issuer protection code (ZKI)",
    issuedAt: "Issue date",
    paymentMethod: "Payment method",
    orderReference: "Order reference",
    parties: "Parties",
    seller: "Seller",
    buyer: "Buyer",
    items: "Items",
    item: "Item",
    vat: "VAT %",
    qty: "Qty",
    unitPrice: "Unit price",
    amount: "Amount",
    total: "Total",
    issuedBy: "Issued by",
    footer:
      "This document has been fiscalized and is valid without a signature or stamp. Issued {{ISSUED_AT}}. Enquiries: {{SUPPORT_EMAIL}}",
    guest: "Guest",
  },
  confirmation: {
    docTitle: "Payment confirmation",
    pageWord: "page",
    cancelled: "CANCELLED",
    cancels: "This confirmation cancels",
    sectionPayment: "Payment details",
    labelCustomer: "Customer",
    labelTransactionId: "Transaction ID",
    labelOrderReference: "Order / event reference",
    labelPaidAt: "Date and time of payment",
    labelPaymentMethod: "Payment method",
    labelAmount: "Amount",
    sectionParties: "Parties",
    roleServiceProvider: "Service provider",
    roleCollectedBy: "Payment collected by",
    sectionItems: "Paid items",
    emailItems: "Items",
    emailOrderReference: "Order reference",
    colItem: "Item",
    colVat: "VAT %",
    colQty: "Qty",
    colUnit: "Unit price",
    colAmount: "Amount",
    totalPaid: "Total paid",
    voucherTitle: "Minimum-spend voucher",
    voucherCode: "Voucher code",
    voucherValue: "Value",
    voucherValid: "Valid:",
    voucherRedeem: "Redeemable at:",
    voucherHelp:
      "The amount is deducted automatically from in-app orders, or staff redeem it by entering the code.",
    issuedBy: "Issued by",
    documentFooter:
      "This document was issued electronically and is valid without a signature or stamp. Issued {{ISSUED_AT}}.\n      Control record: {{DOCUMENT_HASH}} · Enquiries: {{SUPPORT_EMAIL}}",
    emailPreheader:
      "A payment of {{CURRENCY}} {{TOTAL_AMOUNT}} has been received. Confirmation {{CONFIRMATION_NUMBER}} is attached.",
    emailGreeting: "Payment received,<br>{{CUSTOMER_FIRST_NAME}}.",
    emailExpecting: "{{ORGANIZER_VENUE_NAME}} is expecting you.",
    confirmationNumber: "Confirmation number",
    emailVoucherValue:
      "Value {{CURRENCY}} {{VOUCHER_AMOUNT}} · valid {{VOUCHER_VALID_FROM}} – {{VOUCHER_VALID_TO}}",
    emailVoucherHelp:
      "The amount is deducted automatically from in-app orders, or staff can redeem it by entering the code.",
    coveringHtml:
      "The payment confirmation is attached, and it is always available in the app under\n              <strong>Wallet → Transaction history</strong>.<br><br>\n              Need help? Write to us at",
    cancellationTitle: "Payment cancellation",
  },
};
