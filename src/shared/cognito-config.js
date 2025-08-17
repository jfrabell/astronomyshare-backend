const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
global.fetch = require('node-fetch'); // Needed if running Node.js outside the browser

const poolData = {
  UserPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID, // e.g. 'us-east-1_XXXXXX'
  ClientId: process.env.REACT_APP_COGNITO_CLIENT_ID       // e.g. 'XXXXXXXXXXXX'
};

const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

module.exports = { userPool };
//a comment
