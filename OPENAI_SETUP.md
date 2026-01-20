# OpenAI Configuration Setup

## Problem
The file processing endpoint is returning empty results because the OpenAI API key is not configured.

## Error Response
```json
{
    "success": true,
    "data": {
        "leads": [],
        "validation": {
            "totalRows": 2400,
            "validRows": 0,
            "invalidRows": 0,
            "errors": [
                "1173 chunks failed to process"
            ]
        }
    }
}
```

## Solution

### 1. Create .env file
Create a `.env` file in the `v25_dashboard_backend` directory:

```bash
# OpenAI Configuration - REQUIRED
OPENAI_API_KEY=sk-your_actual_openai_api_key_here

# Other configurations...
MONGODB_URI=mongodb://localhost:27017/harx_dashboard
PORT=5000
NODE_ENV=development
FRONTEND_URL=https://harx25pageslinks.netlify.app
```

### 2. Get OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)
4. Replace `sk-your_actual_openai_api_key_here` in the .env file

### 3. Restart the server
```bash
npm restart
# or
node src/index.js
```

### 4. Test the endpoint
The endpoint should now process files correctly and return actual lead data instead of empty results.

## Verification
Check the server logs for these messages:
- `🔑 Checking OpenAI API key...`
- `✅ OpenAI API key found and valid format`

If you see `❌ OpenAI API key not found`, the .env file is not loaded correctly.
