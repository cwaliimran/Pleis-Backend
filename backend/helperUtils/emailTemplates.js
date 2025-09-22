// emailTemplate.js
const APP_NAME = "Pleis App"; // Define the app name as a constant at the top
const currentYear = new Date().getFullYear(); // Dynamically get the current year

// Function to generate Registration link email template
const registrationEmailTemplate = (verificationLink) => `
 <!DOCTYPE html>
<html>
  <head>
    <style>
      .email-container {
        font-family: Arial, sans-serif;
        line-height: 1.5;
        color: #333;
      }
      .email-header {
        background-color: #1B1A1D;
        color: white;
        text-align: center;
        padding: 10px 0;
      }
      .email-body {
        margin: 20px;
      }
      .verify-link {
        display: inline-block;
        padding: 10px 20px;
        margin: 15px 0;
        background-color: #1B1A1D;
        color: white;
        text-decoration: none;
        border-radius: 5px;
        font-weight: bold;
      }
      .footer {
        text-align: center;
        margin-top: 20px;
        color: #888;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="email-header">
        <h2>Welcome to ${APP_NAME}</h2>
      </div>
      <div class="email-body">
        <p>Hello,</p>
        <p>Thank you for registering with us. Please click the button below to verify your email and complete your registration:</p>
        <p>
           <a href="${verificationLink}" 
             style="
               display:inline-block; 
               padding:10px 20px; 
               background-color:#1B1A1D; 
               color:#ffffff !important; 
               text-decoration:none !important; 
               border-radius:5px; 
               font-weight:bold;
             ">
            Verify Email
          </a>
        </p>
        <p>If you didn't initiate this request, please ignore this email.</p>
      </div>
      <div class="footer">
        &copy; ${currentYear} ${APP_NAME}. All rights reserved.
      </div>
    </div>
  </body>
</html>

`;

// Function to generate Forgot Password Verification Link email template
const forgotPasswordEmailTemplate = (resetLink) => `
<!DOCTYPE html>
<html>
  <head>
    <style>
      .email-container {
        font-family: Arial, sans-serif;
        line-height: 1.5;
        color: #333;
      }
      .email-header {
        background-color: #1B1A1D;
        color: white;
        text-align: center;
        padding: 10px 0;
      }
      .email-body {
        margin: 20px;
      }
      .verify-link {
        display: inline-block;
        padding: 10px 20px;
        margin: 15px 0;
        background-color: #1B1A1D;
        color: white;
        text-decoration: none;
        border-radius: 5px;
        font-weight: bold;
      }
      .footer {
        text-align: center;
        margin-top: 20px;
        color: #888;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="email-header">
        <h2>Password Reset Request</h2>
      </div>
      <div class="email-body">
        <p>Hello,</p>
        <p>We received a request to reset your password for your account at ${APP_NAME}. Please click the button below to reset your password:</p>
        <p>
           <a href="${resetLink}" 
             style="
               display:inline-block; 
               padding:10px 20px; 
               background-color:#1B1A1D; 
               color:#ffffff !important; 
               text-decoration:none !important; 
               border-radius:5px; 
               font-weight:bold;
             ">
            Reset Password
          </a>
        </p>
        <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
      </div>
      <div class="footer">
        &copy; ${currentYear} ${APP_NAME}. All rights reserved.
      </div>
    </div>
  </body>
</html>
`;


/**
 * Generates an account status email template based on user status.
 * @param {string} status - One of: pending, active, rejected, suspended, deleted
 * @param {string} userName - The user's name
 * @returns {string} - HTML email template
 */

// const html = accountStatusEmailTemplate('active', 'John Doe');
// then send `html` via your email service


const accountStatusEmailTemplate = (status, userName) => {
  let statusMessage = '';
  let headerText = '';

  switch (status.toLowerCase()) {
    case 'active':
      statusMessage = 'Congratulations! Your account has been activated. You can now access all features of your account.';
      headerText = 'Account Activated';
      break;
    case 'pending':
      statusMessage = 'Your account is pending verification. Please complete any required steps to activate your account.';
      headerText = 'Account Pending';
      break;
    case 'rejected':
      statusMessage = 'We are sorry. Your account verification request has been rejected. Please contact support for more details.';
      headerText = 'Account Rejected';
      break;
    case 'suspended':
      statusMessage = 'Your account has been suspended due to policy violations. Please contact support for assistance.';
      headerText = 'Account Suspended';
      break;
    case 'deleted':
      statusMessage = 'Your account has been deleted. If you believe this is a mistake, please contact our support team.';
      headerText = 'Account Deleted';
      break;
    default:
      statusMessage = `Your account status has been updated to "${status}". Please contact support for more details.`;
      headerText = 'Account Status Update';
  }

  const currentYear = new Date().getFullYear();
  const headerBgColor = '#1B1A1D';
  const headerTextColor = '#ffffff';
  const footerColor = '#888888';

  return `
  <!DOCTYPE html>
  <html>
    <body style="margin:0; padding:0; font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" bgcolor="${headerBgColor}" style="padding: 10px 0; color: ${headerTextColor};">
            <h2 style="margin:0; font-size:24px;">${headerText}</h2>
          </td>
        </tr>
        <tr>
          <td>
            <table width="600" align="center" cellpadding="0" cellspacing="0" style="margin:20px auto;">
              <tr>
                <td>
                  <p>Hello ${userName},</p>
                  <p style="font-size: 1.2em; margin: 15px 0;">${statusMessage}</p>
                  <p>If you have any questions, please contact our support team.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0; color: ${footerColor}; font-size: 12px;">
            &copy; ${currentYear} ${APP_NAME}. All rights reserved.
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
};


const stripeEmailTemplate = ({ name, link }) => `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        .email-container {
          font-family: Arial, sans-serif;
          line-height: 1.5;
          color: #333;
        }
        .email-header {
          background-color: #1B1A1D;
          color: white;
          text-align: center;
          padding: 10px 0;
        }
        .email-body {
          margin: 20px;
        }
        .otp {
          font-size: 1.5em;
          color: #1B1A1D;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          color: #888;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="email-header">
          <h2>Stripe Account Completion</h2>
        </div>
        <div class="email-body">
         <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;margin:0 auto" bgcolor="#fff">
	<tbody>
	<tr>
		<td colspan="2" style="padding:20px 20px 20px 20px">
			<p style="font-family: 'Montserrat', sans-serif; font-size: 15px;">Hey ${name},</p>
			<p style="font-family: 'Montserrat', sans-serif;font-size: 15px;text-align: justify;">
				You’re almost ready to start a whole new experience
			</p>
			<p style="font-family: 'Montserrat', sans-serif;font-size: 15px;text-align: justify;">
				Simply click the big blue button below to verify the details you have provided to us, so you can be paid on time.
			</p>
			<p style="font-family: 'Montserrat', sans-serif;font-size: 15px;text-align: justify;">
				Before clicking, it is important to remember to have a copy of your <b>ID and a Proof of Address</b> for the verification stage. This is an important anti-fraud measure that helps us to keep your money safe and comply with regulations.
			</p>
			<b style="font-family: 'Montserrat', sans-serif;text-align: justify;">Please see a list of accepted IDs below:</b>
			<ul style="padding-left: 14px;font-family: 'Montserrat', sans-serif; font-size: 15px;text-align: justify; ">
				<li>Valid passport (all four corners must be showing)</li>
				<li>Valid photocard driving licence (not provisional and only if not used for proof of address)</li>
				<li>Valid Government issued national identity card bearing a photograph (electronic copy only - both sides)</li>
			</ul>
			<b style="font-family: 'Montserrat', sans-serif;text-align: justify;">
				We can accept a clear scan of your document or a photo upload
			</b>
			<p style="font-family: 'Montserrat', sans-serif; font-size: 15px;text-align: justify;">Acceptable proof of business or individual address:</p>
			<ul style="padding-left: 14px;font-family: 'Montserrat', sans-serif; font-size: 15px;text-align: justify; ">
				<li>Gas bill / electricity bill / landline telephone bill (maximum 90 days old; may be printed online)</li>
				<li>Council tax bill / water bill (must relate to the current charging period)</li>
			</ul>
			<p style="font-family: 'Montserrat', sans-serif; font-size: 15px;text-align: justify;">
				We are happy to accept a PDF download or screenshot of these documents if your accounts are online and paperless
			</p>
			<a href="${link}" style="font-family: 'Montserrat', sans-serif;background: #1B1A1D;border: none;height: 30px;width: 60%;border-radius: 12px;text-align: center;margin: 0 auto;display: block;color: #fff;cursor: pointer; padding-top:10px">Verify your account</a>
			<p style="font-family: 'Montserrat', sans-serif; font-size: 15px;">
				We wish you a good experience
			</p>
         <p style="font-family: 'Montserrat', sans-serif; font-size: 15px;">
        Best Regards,
        <br>
         Pleis Team
        </p>
		</td>
	</tr>
	</tbody></table>
        </div>
        <div class="footer">
          &copy; ${currentYear} ${APP_NAME}. All rights reserved.
        </div>
      </div>
    </body>
  </html>
`;

// Export both functions
module.exports = {
  registrationEmailTemplate,
  forgotPasswordEmailTemplate,
  accountStatusEmailTemplate,
  stripeEmailTemplate,
};
