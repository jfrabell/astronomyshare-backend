// services/emailService.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');

const mailgun = new Mailgun(formData);

// Ensure dotenv is configured and variables are loaded before this file is required/run
// Reads credentials from your .env file
const mgClient = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY,
    url: `https://${process.env.MAILGUN_HOST}`
});

// This is the function that will actually send the email via Mailgun
const sendEmail = async ({ to, subject, text, html }) => {
    const mailgunDomain = process.env.MAILGUN_DOMAIN; // Get domain from .env
    const fromEmail = `No Reply <noreply@${mailgunDomain}>`; // Sender address

    console.log(`[emailService]Attempting to send email from ${fromEmail} to ${to} via Mailgun domain ${mailgunDomain}`);

    const data = {
        from: fromEmail,
        to: Array.isArray(to) ? to.join(',') : to,
        subject: subject,
        text: text,
        html: html
    };

    try {
        // Call the Mailgun API to send the message
        const result = await mgClient.messages.create(mailgunDomain, data);
        console.log('Mailgun API response:', result);
        return { success: true, messageId: result.id };
    } catch (error) {
        console.error('Error sending email via Mailgun:', error);
        if (error.status) {
          console.error('Mailgun Error Status:', error.status);
        }
        if (error.details) {
          console.error('Mailgun Error Details:', error.details);
        }
        throw error; // Pass the error back to the caller
    }
};

// Make the sendEmail function available for other files to import
module.exports = { sendEmail };