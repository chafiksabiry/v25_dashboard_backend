const { OAuth2Client } = require('google-auth-library');
const http = require('http');
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/vertexai');
const { generateCallScoringPrompt } = require('../prompts/call-scoring-prompt');
const { generateCallPostActionsPrompt } = require('../prompts/call-action-plan');
const { generateAudioSummaryPrompt } = require('../prompts/call-summary-prompt');
const { parseCleanJson } = require('../parsers/parse-call-scoring-result');
const { VERTEX_VARS, googleAuthOptions, isCredentialsError } = require('./gcpCredentials');


// Retreive OAUTH2.0 credentials and Google Cloud variables form .env
const clientId = process.env.QAUTH2_CLIENT_ID;
const clientSecret = process.env.QAUTH2_CLIENT_SECRET;
const scope = process.env.QAUTH2_SCOPE;
const redirectUrl = process.env.REDIRECTION_URL;
const project = process.env.QAUTH2_PROJECT_ID || 'harx-ai'; // Valeur par défaut
const location = 'us-central1';

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
    console.warn('Using default project ID:', project);
}

// Identifiants : VERTEX_AI_CREDENTIALS (JSON complet du compte de service, voir gcpCredentials.js), sinon
// GOOGLE_APPLICATION_CREDENTIALS (fichier hors dépôt). Aucun fichier de clé dans le dépôt.
// Client créé au premier appel : sans identifiants, le serveur démarre et les routes Vertex répondent 503 (message clair).
function vertexClientOptions(env = process.env, logger = console) {
    const auth = googleAuthOptions(VERTEX_VARS, 'Vertex AI', env, logger);
    return {
        ...(auth.configError ? { configError: auth.configError } : {}),
        options: {
            project: env.QAUTH2_PROJECT_ID || auth.projectId || project,
            location: location,
            googleAuthOptions: {
                ...(auth.credentials ? { credentials: auth.credentials } : {}),
                scopes: ['https://www.googleapis.com/auth/cloud-platform']
            }
        }
    };
}

let cachedModel = null;
function getModel() {
    if (!cachedModel) {
        const { options, configError } = vertexClientOptions();
        if (configError) throw configError;
        cachedModel = new VertexAI(options).getGenerativeModel({ model: 'gemini-1.5-flash-002' });
    }
    return cachedModel;
}

// Avertissement au démarrage si les identifiants manquent (sans exception ; la valeur n'est jamais journalisée).
if (process.env.NODE_ENV !== 'test') googleAuthOptions(VERTEX_VARS, 'Vertex AI');

// Compatibilité avec le code existant : `generativeVisionModel.generateContent(...)`.
const generativeVisionModel = {
    generateContent: (request) => getModel().generateContent(request),
    generateContentStream: (request) => getModel().generateContentStream(request),
};
exports.vertexClientOptions = vertexClientOptions;

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
        const streamingResp = await generativeVisionModel.generateContentStream(request);
        for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
        }
        const aggregatedResponse = await streamingResp.response;
        console.log(aggregatedResponse.candidates[0].content);
        //return aggregatedResponse.candidates[0].content;
        return parseCleanJson(aggregatedResponse.candidates[0].content.parts[0].text);

    } catch (error) {
        if (isCredentialsError(error)) throw error;
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
        const result = await generativeVisionModel.generateContent(request);
        /* for await (const item of streamingResp.stream) {
            console.log('stream chunk: ', JSON.stringify(item));
        } */
        const aggregatedResponse = result.response;
        return { transcription: aggregatedResponse.candidates[0].content.parts[0].text };
    } catch (error) {
        if (isCredentialsError(error)) throw error;
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
        const result = await generativeVisionModel.generateContent(request);
        const response = result.response;
        console.log('Response: ', JSON.stringify(response));
        return parseCleanJson(response.candidates[0].content.parts[0].text);
        //return response;
    } catch (error) {
        if (isCredentialsError(error)) throw error;
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
        const result = await generativeVisionModel.generateContent(request);
        const response = result.response;
        console.log('Response: ', JSON.stringify(response));
        return parseCleanJson(response.candidates[0].content.parts[0].text);
        //return response;
    } catch (error) {
        if (isCredentialsError(error)) throw error;
        console.error("Service : Error during generating follow-up actions:", error);
        throw new Error("Audio analyzis failed");
    }
};