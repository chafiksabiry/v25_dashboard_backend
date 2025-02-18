FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV MONGODB_URI=mongodb://harx:gcZ62rl8hoME@185.137.122.3:27017/V25_CompanySearchWizard
ENV PORT=5000
ENV ZOHO_CLIENT_ID=1000.J3KD66XC2LO0F6OCJCXX2KHBBJXI6O
ENV ZOHO_CLIENT_SECRET=0fecc8599d17d0b4462d9ed0e2da705fc9a3bd791d
ENV ZOHO_REDIRECT_URI=http://38.242.208.242:5005/api/zoho/auth/callback
ENV ZOHO_SCOPE=ZohoCRM.modules.Leads.ALL
ENV ZOHO_AUTH_URL=https://accounts.zoho.com/oauth/v2/auth
ENV ZOHO_TOKEN_URL=https://accounts.zoho.com/oauth/v2/token
ENV ZOHO_API_URL=https://www.zohoapis.com/crm/v2/Leads
ENV REACT_APP_URL=http://38.242.208.242:7190
ENV BACKEND_URL=http://38.242.208.242:5005
ENV SESSION_SECRET=2ad9bd79f6d7c91829f648bd5658c30d0c90c07270cb703d54dc76a3670763cb


EXPOSE 5000

CMD ["npm", "start"]
