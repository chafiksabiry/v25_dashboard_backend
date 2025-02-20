const { OAuth2Client, GoogleAuth } = require('google-auth-library');
const http = require('http');
const axios = require('axios');
const path = require("path");
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/vertexai');
const { generateCallScoringPrompt } = require('../prompts/call-scoring-prompt');
const { parseCleanJson } = require('../parsers/parse-call-scoring-result');


// Retreive OAUTH2.0 credentials and Google Cloud variables form .env
const clientId = process.env.QAUTH2_CLIENT_ID;
const clientSecret = process.env.QAUTH2_CLIENT_SECRET;
const scope = process.env.QAUTH2_SCOPE;
const redirectUrl = process.env.REDIRECTION_URL;
const project = process.env.QAUTH2_PROJECT_ID;
const location = 'us-central1';

// Construct the absolute path to the service account JSON file
const keyPath = path.join(__dirname, "../config/vertexServiceAccount.json");

// Authenticate to Google cloud using the vertex service account
const auth = new GoogleAuth({
    keyFilename: keyPath,
    scopes: [scope],
});

// Create an instance of VertexAI class
const vertex_ai = new VertexAI({ project: project, location: location, googleAuthOptions: auth });

// Create an instance of GenerativeModel class
const generativeVisionModel = vertex_ai.getGenerativeModel({
    model: 'gemini-1.5-flash-002',
});

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
                        "text": "Please analyze this audio file and summarize the contents of the audio as bullet points"
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
        return aggregatedResponse.candidates[0].content;
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