FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV MONGODB_URI=mongodb://harx:gcZ62rl8hoME@185.137.122.3:27017/V25_CompanySearchWizard
ENV PORT=5005
ENV ZOHO_CLIENT_ID=1000.JGREUI9K58EGNY3ARF8Z0SBZWLJTAA
ENV ZOHO_CLIENT_SECRET=7c88d9c5e4efd24043b1cb7376ce14d36b53160934
ENV ZOHO_ACCESS_TOKEN=1000.d2010ed8618379630bd0f3c10ddc95c5.b134a445802d4b823fe633183f333877
ENV ZOHO_REDIRECT_URI=https://api-dashboard.harx.ai/api/zoho/auth/callback
ENV ZOHO_SCOPE=SalesIQ.chattranscript.READ,SalesIQ.chatdetails.READ,SalesIQ.conversations.READ,SalesIQ.portals.READ,ZohoCRM.modules.ALL,ZohoCRM.modules.emails.ALL
ENV ZOHO_AUTH_URL=https://accounts.zoho.com/oauth/v2/auth
ENV ZOHO_TOKEN_URL=https://accounts.zoho.com/oauth/v2/token
ENV ZOHO_API_URL=https://www.zohoapis.com/crm/v2/Leads
ENV ZOHO_SALESIQ_PORTAL=harxtechnologiesinc
ENV REACT_APP_URL=https://dashboard.harx.ai
ENV BACKEND_URL=https://api-dashboard.harx.ai
ENV SESSION_SECRET=2ad9bd79f6d7c91829f648bd5658c30d0c90c07270cb703d54dc76a3670763cb
ENV QAUTH2_CLIENT_ID=606251928660-b1ehqmv6ui1bfbo0ejjbss18c7fhqa2d.apps.googleusercontent.com
ENV QAUTH2_PROJECT_ID=harx-technologies-inc
ENV QAUTH2_AUTH_URI=https://accounts.google.com/o/oauth2/auth
ENV QAUTH2_TOKEN_URI=https://oauth2.googleapis.com/token
ENV QAUTH2_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
ENV QAUTH2_CLIENT_SECRET=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
ENV QAUTH2_SCOPE=https://www.googleapis.com/auth/cloud-platform
ENV GOOGLE_API_KEY=AIzaSyCHEKiraViKIrgvloZI-ZBIJqtDMeBuQD0
ENV BUCKET_NAME=harx-audios-test

EXPOSE 5005

CMD ["npm", "start"]
