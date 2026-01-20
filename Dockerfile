FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

MONGODB_URI=mongodb://harx:gcZ62rl8hoME@38.242.208.242:27018/V25_CompanySearchWizard
PORT=5005
ZOHO_CLIENT_ID=1000.Y3FPXAUXOLBKTK7QQMXETNTRQSXVTI
ZOHO_CLIENT_SECRET=2b3bfd2cab82a29f67c449171d794fae77e399db17
ZOHO_ACCESS_TOKEN=1000.d2010ed8618379630bd0f3c10ddc95c5.b134a445802d4b823fe633183f333877
ZOHO_REDIRECT_URI=https://v25dashboardbackend-production.up.railway.app/api/zoho/auth/callback
ZOHO_SCOPE=SalesIQ.chattranscript.READ,SalesIQ.chatdetails.READ,SalesIQ.conversations.READ,SalesIQ.portals.READ,ZohoCRM.modules.ALL,ZohoCRM.modules.emails.ALL
ZOHO_AUTH_URL=https://accounts.zoho.com/oauth/v2/auth
ZOHO_TOKEN_URL=https://accounts.zoho.com/oauth/v2/token
ZOHO_API_URL=https://www.zohoapis.com/crm/v2/Leads
ZOHO_SALESIQ_PORTAL=harxtechnologiesinc
REACT_APP_URL=https://harxv25dashboardfrontend.netlify.app
BACKEND_URL=https://v25dashboardbackend-production.up.railway.app
SESSION_SECRET=2ad9bd79f6d7c91829f648bd5658c30d0c90c07270cb703d54dc76a3670763cb
QAUTH2_CLIENT_ID=606251928660-b1ehqmv6ui1bfbo0ejjbss18c7fhqa2d.apps.googleusercontent.com
QAUTH2_PROJECT_ID=harx-technologies-inc
QAUTH2_AUTH_URI=https://accounts.google.com/o/oauth2/auth
QAUTH2_TOKEN_URI=https://oauth2.googleapis.com/token
QAUTH2_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
QAUTH2_CLIENT_SECRET=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
QAUTH2_SCOPE=https://www.googleapis.com/auth/cloud-platform
GOOGLE_API_KEY=AIzaSyCHEKiraViKIrgvloZI-ZBIJqtDMeBuQD0
BUCKET_NAME=harx-audios-test
OPENAI_API_KEY=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

EXPOSE 5005

CMD ["npm", "start"]
