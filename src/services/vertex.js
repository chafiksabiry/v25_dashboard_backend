const { OAuth2Client, GoogleAuth } = require('google-auth-library');
const http = require('http');
const axios = require('axios');
const path = require("path");
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/vertexai');
const { generateCallScoringPrompt } = require('../prompts/call-scoring-prompt');
const { generateCallPostActionsPrompt } = require('../prompts/call-action-plan');
const { generateAudioSummaryPrompt } = require('../prompts/call-summary-prompt');
const { parseCleanJson } = require('../parsers/parse-call-scoring-result');


const fs = require('fs');
const fsPromises = require('fs').promises;

// Retreive OAUTH2.0 credentials and Google Cloud variables form .env
const clientId = process.env.QAUTH2_CLIENT_ID;
const clientSecret = process.env.QAUTH2_CLIENT_SECRET;
const scope = process.env.QAUTH2_SCOPE;
const redirectUrl = process.env.REDIRECTION_URL;

let projectID = (process.env.GOOGLE_CLOUD_PROJECT || process.env.QAUTH2_PROJECT_ID || 'harx-technologies-inc').replace(/"/g, '');
const location = 'us-central1';

// Setup credentials - match wizard/KB method (temp files)
let vertexCredentialsPath;
let storageCredentialsPath;

const setupGCPCredentials = async () => {
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Vertex AI Credentials
    const vertexCreds = (process.env.VERTEX_AI_CREDENTIALS || process.env.GCP_VERTEX_AI_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
    console.log('Setting up Vertex AI credentials...');
    if (vertexCreds && vertexCreds.startsWith('{')) {
        vertexCredentialsPath = path.join(tempDir, 'vertex-credentials.json');
        await fsPromises.writeFile(vertexCredentialsPath, vertexCreds);
        console.log('Using Vertex AI credentials from JSON env var');
    } else {
        vertexCredentialsPath = vertexCreds || path.join(__dirname, "../config/vertexServiceAccount.json");
        console.log('Using Vertex AI credentials from path:', vertexCredentialsPath);
    }

    // Storage Credentials
    const storageCreds = (process.env.CLOUD_STORAGE_CREDENTIALS || process.env.GCP_STORAGE_CREDENTIALS || process.env.GCP_CLOUD_STORAGE_CREDENTIALS || process.env.GCP_VERTEX_AI_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
    console.log('Setting up Storage credentials...');
    if (storageCreds && storageCreds.startsWith('{')) {
        storageCredentialsPath = path.join(tempDir, 'storage-credentials.json');
        await fsPromises.writeFile(storageCredentialsPath, storageCreds);
        console.log('Using Storage credentials from JSON env var');
    } else {
        storageCredentialsPath = storageCreds || path.join(__dirname, "../config/vertexServiceAccount.json"); // Fallback to same key if others missing
        console.log('Using Storage credentials from path:', storageCredentialsPath);
    }
};


// Vérifier que les variables d'environnement requises sont définies
const requiredEnvVars = {
    QAUTH2_CLIENT_ID: clientId,
    QAUTH2_CLIENT_SECRET: clientSecret,
    QAUTH2_SCOPE: scope,
    REDIRECTION_URL: redirectUrl
};

const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

if (missingVars.length > 0) {
    console.warn('Warning: Missing environment variables:', missingVars.join(', '));
    console.warn('Using default project ID:', projectID);
}

// Initialisation asynchrone pour Vertex AI
let vertex_ai;
let generativeVisionModel;
let storage;

const initializeServices = async () => {
    if (vertex_ai) return;

    await setupGCPCredentials();

    // Use raw options object for VertexAI
    const vertexAuthOptions = {
        keyFilename: vertexCredentialsPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    };

    // Allow model override via env var, but use gemini-2.0-flash as default
    let modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash';

    console.log(`[VertexService] Initializing Generative Model: ${modelName} in project: ${projectID}`);

    vertex_ai = new VertexAI({ project: projectID, location: location, googleAuthOptions: vertexAuthOptions });
    generativeVisionModel = vertex_ai.getGenerativeModel({ model: modelName });

    storage = new Storage({
        projectId: projectID,
        keyFilename: storageCredentialsPath
    });
};


// Get the summary of an audio 
exports.getAudioSummary = async (file_uri) => {
    try {
        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/mpeg", // we can change the mime_type after
                            "file_uri": file_uri
                        }
                    },
                    {
                        "text": generateAudioSummaryPrompt()
                    }
                ]
            }],
        };
        await initializeServices();
        const streamingResp = await generativeVisionModel.generateContentStream(request);

        for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
        }
        const aggregatedResponse = await streamingResp.response;
        console.log(aggregatedResponse.candidates[0].content);
        //return aggregatedResponse.candidates[0].content;
        return parseCleanJson(aggregatedResponse.candidates[0].content.parts[0].text);

    } catch (error) {
        console.error("Error analyzing the audio:", error);
        throw new Error("Audio analyzis failed");
    }
};

// Get the transcription of an audio 
exports.getAudioTranscription = async (file_uri) => {
    try {
        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/mpeg", // we can change the mime_type after
                            "file_uri": file_uri
                        }
                    },
                    {
                        "text": "Generate a transcription of the audio, only extract speech and ignore background audio."
                    }
                ]
            }],
        };
        await initializeServices();
        const result = await generativeVisionModel.generateContent(request);

        /* for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
        } */
        const aggregatedResponse = result.response;
        return { transcription: aggregatedResponse.candidates[0].content.parts[0].text };
    } catch (error) {
        console.error("Error analyzing the audio:", error);
        throw new Error("Audio analyzis failed");
    }
};

// Get the scoring of a call 
exports.getCallScoring = async (file_uri) => {
    try {
        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/wav", // we can change the mime_type after
                            "file_uri": file_uri
                        }
                    },
                    {
                        "text": generateCallScoringPrompt()
                    }
                ]
            }],
        };
        await initializeServices();
        const result = await generativeVisionModel.generateContent(request);

        const response = result.response;
        console.log('Response: ', JSON.stringify(response));
        return parseCleanJson(response.candidates[0].content.parts[0].text);
        //return response;
    } catch (error) {
        console.error("Error analyzing the audio:", error);
        throw new Error("Audio analyzis failed");
    }
};

//getCallPostActions
exports.getCallPostActions = async (file_uri) => {
    try {
        const request = {
            contents: [{
                role: 'user', parts: [
                    {
                        "file_data": {
                            "mime_type": "audio/wav", // we can change the mime_type after
                            "file_uri": file_uri
                        }
                    },
                    {
                        "text": generateCallPostActionsPrompt()
                    }
                ]
            }],
        };
        await initializeServices();
        const result = await generativeVisionModel.generateContent(request);

        const response = result.response;
        console.log('Response: ', JSON.stringify(response));
        return parseCleanJson(response.candidates[0].content.parts[0].text);
        //return response;
    } catch (error) {
        console.error("Service : Error during generating follow-up actions:", error);
        throw new Error("Audio analyzis failed");
    }
};