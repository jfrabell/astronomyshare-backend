// services/emailService.js
const formData = require('form-data');
const Mailgun = require('mailgun.js');
let mgClient; // Keep client instance in module scope to be reused by warm Lambdas
const getMailgunClient = () => {
    // Initialize client only once per container
    if (mgClient) {
        return mgClient;
    }
    const apiKey = process.env.MAILGUN_API_KEY;
    const host = process.env.MAILGUN_HOST;
    if (!apiKey || !host) {
        console.error("[emailService] CRITICAL: Mailgun API Key or Host is not configured in environment variables.");
        throw new Error("Mailgun service is not configured.");
    }
    const mailgun = new Mailgun(formData);
    mgClient = mailgun.client({
        username: 'api',
        key: apiKey,
        url: `https://${host}`
    });
    console.log('[emailService] Mailgun client initialized.');
    return mgClient;
};
// This is the function that will actually send the email via Mailgun
const sendEmail = async ({ to, subject, text, html }) => {
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    if (!mailgunDomain) {
        console.error("[emailService] CRITICAL: Mailgun Domain is not configured in environment variables.");
        throw new Error("Mailgun service is not configured.");
    }
    const fromEmail = `No Reply <noreply@${mailgunDomain}>`; // Sender address
    console.log(`[emailService] Attempting to send email from ${fromEmail} to ${to} via Mailgun domain ${mailgunDomain}`);
    const data = {
        from: fromEmail,
        to: Array.isArray(to) ? to.join(',') : to,
        subject: subject,
        text: text,
        html: html
    };
    try {
        const client = getMailgunClient();
        const result = await client.messages.create(mailgunDomain, data);
        console.log('Mailgun API response:', result);
        return { success: true, messageId: result.id };
    } catch (error) {
        console.error('Error sending email via Mailgun. Full error object:', JSON.stringify(error, null, 2));
        throw error; // Pass the error back to the caller
    }
};
// Make the sendEmail function available for other files to import
module.exports = { sendEmail };