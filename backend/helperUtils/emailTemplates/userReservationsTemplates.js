// emailTemplate.js
const APP_NAME = "Pleis App"; // Define the app name as a constant at the top
const currentYear = new Date().getFullYear(); // Dynamically get the current year

const reservationConfirmationEmailTemplate = ({
  userName,
  reservation,
  organizationName,
  currency = "EUR",
}) => {

  const formatPrice = (amount) =>
    `${currency} ${Number(amount || 0).toFixed(2)}`;

  /* ----------------------------------
     🕒 Timing Slots (Already formatted)
  ---------------------------------- */
  let timingHtml = "";

  if (reservation.timingSlots?.dateTimeSlots?.length) {
    timingHtml = reservation.timingSlots.dateTimeSlots
      .map(slot => {
        const times = slot.timeSlots
          .map(t => `${t.startTime} - ${t.endTime}`)
          .join("<br/>");

        return `
          <tr>
            <td style="padding:6px 0;">
              <strong>${slot.date}</strong><br/>
              ${times}
            </td>
          </tr>
        `;
      })
      .join("");
  } else if (reservation.timingSlots?.date) {
    timingHtml = `
      <tr>
        <td style="padding:6px 0;">
          <strong>${reservation.timingSlots.date}</strong><br/>
          ${reservation.timingSlots.startTime} - ${reservation.timingSlots.endTime}
        </td>
      </tr>
    `;
  }

  /* ----------------------------------
     🍽 Pre-Order Items
  ---------------------------------- */
  let preorderHtml = "";

  if (reservation.preOrderMenuItemsOrder?.items?.length) {
    const items = reservation.preOrderMenuItemsOrder.items
      .map(item => `
        <tr>
          <td width="40"><strong>${item.quantity} ×</strong></td>
          <td>${item.menuItemSnapShot?.title}</td>
          <td align="right"><strong>${formatPrice(item.finalPrice)}</strong></td>
        </tr>
      `)
      .join("");

    preorderHtml = `
      <tr>
        <td style="padding:20px;">
          <h3>Pre-Ordered Items</h3>
          <table width="100%" cellpadding="6" cellspacing="0" style="border-top:1px solid #eee;">
            ${items}
          </table>
        </td>
      </tr>
    `;
  }

  /* ----------------------------------
     🎯 Loyalty Points
  ---------------------------------- */
  let loyaltyHtml = "";

  if (reservation.transactions?.company?.points) {
    loyaltyHtml = `
      <tr>
        <td style="padding:20px;background:#f9f9f9;">
          <strong>Loyalty Points Earned:</strong><br/>
          Company Points: ${reservation.transactions.company.points}<br/>
          Global Points: ${reservation.transactions.global?.points || 0}
        </td>
      </tr>
    `;
  }

  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
  <td align="center">

  <table width="600" style="background:#ffffff;margin:20px auto;border-radius:8px;overflow:hidden;">

  <!-- HEADER -->
  <tr>
    <td style="background:#1B1A1D;color:#ffffff;padding:20px;text-align:center;">
      <h2 style="margin:0;">Reservation Confirmed</h2>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:20px;">
      Hello ${userName || "Customer"},<br/><br/>
      Your reservation at <strong>${organizationName}</strong> has been confirmed.
    </td>
  </tr>

  <!-- DETAILS -->
  <tr>
    <td style="padding:0 20px 20px 20px;">
      <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #eee;border-radius:6px;">
        <tr>
          <td bgcolor="#f7f7f7"><strong>Type</strong></td>
          <td>${reservation.reservationSnapshot.reservationType}</td>
        </tr>
        <tr>
          <td bgcolor="#f7f7f7"><strong>Party Size</strong></td>
          <td>${reservation.partySize}</td>
        </tr>
        <tr>
          <td bgcolor="#f7f7f7"><strong>Total Paid</strong></td>
          <td>${formatPrice(reservation.amount)}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- TIMING -->
  <tr>
    <td style="padding:0 20px;">
      <h3>Reservation Time</h3>
      <table width="100%" cellpadding="6" cellspacing="0">
        ${timingHtml}
      </table>
    </td>
  </tr>

  ${preorderHtml}

  ${loyaltyHtml}

  <!-- FOOTER -->
  <tr>
    <td align="center" style="padding:20px;color:#888;font-size:12px;">
      &copy; ${currentYear} ${APP_NAME}. All rights reserved.
    </td>
  </tr>

  </table>

  </td>
  </tr>
  </table>

  </body>
  </html>
  `;
};

const reservationCancelledEmailTemplate = ({
  userName,
  reservation,
  organizationName,
  currency = "EUR",
}) => {

  const formatPrice = (amount) =>
    `${currency} ${Number(amount || 0).toFixed(2)}`;

  /* ----------------------------------
     🕒 Timing Slots
  ---------------------------------- */
  let timingHtml = "";

  if (reservation.timingSlots?.dateTimeSlots?.length) {
    timingHtml = reservation.timingSlots.dateTimeSlots
      .map(slot => {
        const times = slot.timeSlots
          .map(t => `${t.startTime} - ${t.endTime}`)
          .join("<br/>");

        return `
          <tr>
            <td style="padding:6px 0;">
              <strong>${slot.date}</strong><br/>
              ${times}
            </td>
          </tr>
        `;
      })
      .join("");
  } else if (reservation.timingSlots?.date) {
    timingHtml = `
      <tr>
        <td style="padding:6px 0;">
          <strong>${reservation.timingSlots.date}</strong><br/>
          ${reservation.timingSlots.startTime} - ${reservation.timingSlots.endTime}
        </td>
      </tr>
    `;
  }

  /* ----------------------------------
     🍽 Pre-Order Items
  ---------------------------------- */
  let preorderHtml = "";

  if (reservation.preOrderMenuItemsOrder?.items?.length) {
    const items = reservation.preOrderMenuItemsOrder.items
      .map(item => `
        <tr>
          <td width="40"><strong>${item.quantity} ×</strong></td>
          <td>${item.menuItemSnapShot?.title}</td>
          <td align="right"><strong>${formatPrice(item.finalPrice)}</strong></td>
        </tr>
      `)
      .join("");

    preorderHtml = `
      <tr>
        <td style="padding:20px;">
          <h3>Pre-Ordered Items</h3>
          <table width="100%" cellpadding="6" cellspacing="0" style="border-top:1px solid #eee;">
            ${items}
          </table>
        </td>
      </tr>
    `;
  }

  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;background:#f4f4f4;font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0">
  <tr>
  <td align="center">

  <table width="600" style="background:#ffffff;margin:20px auto;border-radius:8px;overflow:hidden;">

  <!-- HEADER -->
  <tr>
    <td style="background:#1B1A1D;color:#ffffff;padding:20px;text-align:center;">
      <h2 style="margin:0;">Reservation Payment Failed</h2>
    </td>
  </tr>

  <!-- STATUS BADGE -->
  <tr>
    <td align="center" style="padding:15px;">
      <span style="
        background:#ffebee;
        color:#c62828;
        padding:8px 16px;
        border-radius:20px;
        font-weight:bold;
        font-size:14px;">
        PAYMENT FAILED
      </span>
    </td>
  </tr>

  <!-- GREETING -->
  <tr>
    <td style="padding:20px;">
      Hello ${userName || "Customer"},<br/><br/>
      Unfortunately, your reservation at 
      <strong>${organizationName}</strong> could not be completed due to a payment failure.
      <br/><br/>
      No charges were applied.
    </td>
  </tr>

  <!-- DETAILS -->
  <tr>
    <td style="padding:0 20px 20px 20px;">
      <table width="100%" cellpadding="10" cellspacing="0" style="border:1px solid #eee;border-radius:6px;">
        <tr>
          <td bgcolor="#f7f7f7"><strong>Type</strong></td>
          <td>${reservation.reservationSnapshot?.reservationType || "-"}</td>
        </tr>
        <tr>
          <td bgcolor="#f7f7f7"><strong>Party Size</strong></td>
          <td>${reservation.partySize}</td>
        </tr>
        <tr>
          <td bgcolor="#f7f7f7"><strong>Amount Attempted</strong></td>
          <td>${formatPrice(reservation.amount)}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- TIMING -->
  <tr>
    <td style="padding:0 20px;">
      <h3>Reservation Time</h3>
      <table width="100%" cellpadding="6" cellspacing="0">
        ${timingHtml}
      </table>
    </td>
  </tr>

  ${preorderHtml}

  <!-- FOOTER -->
  <tr>
    <td align="center" style="padding:20px;color:#888;font-size:12px;">
      &copy; ${currentYear} ${APP_NAME}. All rights reserved.
    </td>
  </tr>

  </table>

  </td>
  </tr>
  </table>

  </body>
  </html>
  `;
};
// Export both functions
module.exports = {
  reservationConfirmationEmailTemplate,
  reservationCancelledEmailTemplate,
};
