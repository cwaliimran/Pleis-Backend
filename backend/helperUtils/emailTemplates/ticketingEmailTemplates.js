const APP_NAME = "Pleis App";
const currentYear = new Date().getFullYear();

const ticketConfirmationEmailTemplate = ({
  userName,
  organizationName,
  eventTitle,
  eventDate,
  eventTime,
  venue,
  tickets,
  orderPricing,
  currency = "€",
}) => {

  const formatPrice = (amount) =>
    `${currency}${Number(amount || 0).toFixed(2)}`;

  const ticketCards = tickets.map(ticket => `
  <tr>
    <td align="center" style="padding:30px 0;">
      <table width="480" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border-radius:20px;padding:25px;text-align:center;color:#000000;">

        <tr>
          <td style="font-size:18px;font-weight:bold;">
            ${organizationName}
          </td>
        </tr>

        <tr>
          <td style="padding-top:8px;font-size:16px;">
            ${eventTitle}
          </td>
        </tr>

        <tr>
          <td style="padding-top:6px;">
            ${eventDate} ${eventTime ? `• ${eventTime}` : ""}
          </td>
        </tr>

        <tr>
          <td style="padding-top:4px;font-size:13px;color:#777;">
            ${venue}
          </td>
        </tr>

        <tr>
          <td style="padding-top:20px;font-weight:bold;font-size:16px;">
            Ticket ID: ${ticket.ticketBookingId}
          </td>
        </tr>

      </table>
    </td>
  </tr>
`).join("");

  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;background:#000000;font-family:Arial,sans-serif;color:#ffffff;">

  <table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center">

  <!-- HEADER -->
  <table width="600" style="margin:20px auto;background:#1B1A1D;border-radius:12px;">
    <tr>
      <td align="center" style="padding:25px;">
        <h2 style="margin:0;color:#ffffff;">🎟 Ticket Confirmed</h2>
      </td>
    </tr>
  </table>

  <!-- GREETING -->
  <table width="600" style="margin:0 auto;background:#111111;border-radius:12px;">
    <tr>
      <td style="padding:25px;">
        Hello ${userName},<br/><br/>
        You're all set! Show this ticket at the entrance to get in.
      </td>
    </tr>
  </table>

  ${ticketCards}

  <!-- ORDER SUMMARY -->
  <table width="600" style="margin:20px auto;background:#111111;border-radius:12px;">
    <tr>
      <td style="padding:25px;">
        <strong>Order Summary</strong><br/><br/>

        Subtotal: ${formatPrice(orderPricing.subtotal)}<br/>
        Tax: ${formatPrice(orderPricing.taxAmount)}<br/>
        <hr style="border:0;border-top:1px solid #333;margin:10px 0;"/>
        <strong>Total: ${formatPrice(orderPricing.total)}</strong>
      </td>
    </tr>
  </table>

  <!-- FOOTER -->
  <table width="600" style="margin:20px auto;">
    <tr>
      <td align="center" style="color:#888;font-size:12px;">
        © ${currentYear} ${APP_NAME}. All rights reserved.
      </td>
    </tr>
  </table>

  </td></tr></table>

  </body>
  </html>
  `;
};


const ticketFailedEmailTemplate = ({
  userName,
  eventTitle,
  orderPricing,
  currency = "€",
}) => {

  const formatPrice = (amount) =>
    `${currency}${Number(amount || 0).toFixed(2)}`;

  return `
  <html>
  <body style="background:#000;color:#fff;font-family:Arial;">

  <table width="600" align="center" style="margin:40px auto;background:#111;border-radius:12px;">
    <tr>
      <td style="padding:25px;text-align:center;">
        <h2 style="color:#ff4d4f;margin:0;">Payment Failed</h2>
      </td>
    </tr>

    <tr>
      <td style="padding:25px;">
        Hello ${userName},<br/><br/>
        Your payment for <strong>${eventTitle}</strong> could not be processed.
        <br/><br/>
        Amount Attempted: <strong>${formatPrice(orderPricing.total)}</strong>
      </td>
    </tr>

  </table>

  </body>
  </html>
  `;
};


module.exports = {
  ticketConfirmationEmailTemplate,
  ticketFailedEmailTemplate,
};