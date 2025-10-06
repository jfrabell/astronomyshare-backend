// src/custom-message-handler/index.js

const fs = require('fs');
const path = require('path');

// Helper function to read HTML template files
const readTemplate = (templateName) => {
    return fs.readFileSync(path.join(__dirname, 'templates', templateName), 'utf8');
};

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    const { triggerSource, request } = event;
    const { userAttributes, codeParameter } = request;
    const username = userAttributes.name || userAttributes.email; // Use name if available, else email
    const email = userAttributes.email;

    // The URL your user will click to verify their account or reset password
    // Ensure this is configured in your environment variables for different stages (dev, prod)
    const verificationLink = `${process.env.FRONTEND_URL}/verify?code=${codeParameter}&email=${email}`;
    const passwordResetLink = `${process.env.FRONTEND_URL}/reset-password?code=${codeParameter}&email=${email}`;

    let emailSubject = '';
    let emailMessage = '';

    switch (triggerSource) {
        case 'CustomMessage_SignUp':
        case 'CustomMessage_ResendCode':
            emailSubject = 'Welcome to AstronomyShare! Please verify your email.';
            let signUpTemplate = readTemplate('verify-email.html');
            signUpTemplate = signUpTemplate.replace('{{username}}', username);
            signUpTemplate = signUpTemplate.replace('{{verification_link}}', verificationLink);
            emailMessage = signUpTemplate;
            break;

        case 'CustomMessage_ForgotPassword':
            emailSubject = 'AstronomyShare Password Reset Request';
            let forgotPasswordTemplate = readTemplate('forgot-password.html');
            forgotPasswordTemplate = forgotPasswordTemplate.replace('{{username}}', username);
            forgotPasswordTemplate = forgotPasswordTemplate.replace('{{password_reset_link}}', passwordResetLink);
            emailMessage = forgotPasswordTemplate;
            break;

        // Add other cases as needed (e.g., CustomMessage_AdminCreateUser)
        default:
            // Fallback or error
            console.log(`Unhandled trigger source: ${triggerSource}`);
            break;
    }

    // Set the response if a message was generated
    if (emailMessage && emailSubject) {
        event.response.emailMessage = emailMessage;
        event.response.emailSubject = emailSubject;
    }

    return event;
};