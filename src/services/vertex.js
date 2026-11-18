const { VertexAI } = require('@google-cloud/vertexai');
const { generateCallScoringPrompt } = require('../prompts/call-scoring-prompt');
const { generateCallPostActionsPrompt } = require('../prompts/call-action-plan');
const { generateAudioSummaryPrompt } = require('../prompts/call-summary-prompt');
const { parseCleanJson } = require('../parsers/parse-call-scoring-result');
const { VERTEX_VARS, googleAuthOptions } = require('./gcpCredentials');

/**
 * Vertex AI (Gemini) : même logique que le service des appels (v25_dash_calls_backend, vertexai.service.js, PR #37).
 *  - Identifiants : VERTEX_AI_CREDENTIALS (JSON du compte de service, voir gcpCredentials.js), sinon ADC. Aucun fichier de clé.
 *  - Modèle : VERTEX_AI_MODEL s'il est servi, sinon gemini-3.1-flash-lite (gemini-1.5-flash-002 est retiré depuis le 24/09/2025).
 *  - Emplacement : VERTEX_AI_LOCATION (défaut `eu`). `eu`, `us` et `global` exigent un apiEndpoint explicite.
 * Le client est créé au premier appel : sans identifiants, le service démarre et l'appel échoue avec un message clair.
 */
const DEFAULT_VERTEX_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_VERTEX_LOCATION = 'eu';
const MULTI_REGION_ENDPOINTS = {
    eu: 'aiplatform.eu.rep.googleapis.com',
    us: 'aiplatform.us.rep.googleapis.com',
    global: 'aiplatform.googleapis.com',
};
const RETIRED_MODEL_PATTERNS = [/^gemini-1\.5-/, /^gemini-2\.0-/, /^gemini-2\.5-(?:flash|flash-lite|pro)(?:$|-(?:preview.*|0\d\d)$)/];
const MULTI_REGION_ONLY_MODEL_PATTERNS = [/^gemini-3\.1-flash-lite$/];
const cleanEnv = (value) => String(value || '').replace(/"/g, '').trim();

function resolveVertexModel(env = process.env, logger = console) {
    const requested = cleanEnv(env.VERTEX_AI_MODEL);
    if (!requested) return DEFAULT_VERTEX_MODEL;
    if (RETIRED_MODEL_PATTERNS.some((re) => re.test(requested.toLowerCase()))) {
        logger.warn(`⚠️ [vertex] VERTEX_AI_MODEL="${requested}" est un modèle retiré par Google : utilisation de ${DEFAULT_VERTEX_MODEL}.`);
        return DEFAULT_VERTEX_MODEL;
    }
    return requested;
}

function resolveVertexLocation(env = process.env, model = resolveVertexModel(env), logger = console) {
    let location = cleanEnv(env.VERTEX_AI_LOCATION).toLowerCase() || DEFAULT_VERTEX_LOCATION;
    const multiRegionOnly = MULTI_REGION_ONLY_MODEL_PATTERNS.some((re) => re.test(String(model).toLowerCase()));
    if (multiRegionOnly && !MULTI_REGION_ENDPOINTS[location]) {
        logger.warn(`⚠️ [vertex] VERTEX_AI_LOCATION="${location}" : le modèle ${model} n'est servi qu'en global, us ou eu. Utilisation de ${DEFAULT_VERTEX_LOCATION}.`);
        location = DEFAULT_VERTEX_LOCATION;
    }
    return { location, apiEndpoint: MULTI_REGION_ENDPOINTS[location] };
}

function vertexClientOptions(env = process.env, logger = console) {
    const model = resolveVertexModel(env, logger);
    const { location, apiEndpoint } = resolveVertexLocation(env, model, logger);
    const auth = googleAuthOptions(VERTEX_VARS, 'Vertex AI', env, logger);
    const project = cleanEnv(env.GOOGLE_CLOUD_PROJECT || env.QAUTH2_PROJECT_ID) || auth.projectId || 'harx-ai';
    return {
        model,
        options: {
            project,
            location,
            ...(apiEndpoint ? { apiEndpoint } : {}),
            googleAuthOptions: {
                ...(auth.credentials ? { credentials: auth.credentials } : {}),
                scopes: ['https://www.googleapis.com/auth/cloud-platform'],
            },
        },
    };
}

let cachedModel = null;
function getModel() {
    if (!cachedModel) {
        const { model, options } = vertexClientOptions();
        console.log(`🧠 [vertex] Vertex AI : projet ${options.project}, emplacement ${options.location}, modèle ${model}`);
        cachedModel = new VertexAI(options).getGenerativeModel({ model });
    }
    return cachedModel;
}
// Compatibilité avec le code existant : `generativeVisionModel.generateContent(...)`.
const generativeVisionModel = {
    generateContent: (request) => getModel().generateContent(request),
    generateContentStream: (request) => getModel().generateContentStream(request),
};

exports.DEFAULT_VERTEX_MODEL = DEFAULT_VERTEX_MODEL;
exports.DEFAULT_VERTEX_LOCATION = DEFAULT_VERTEX_LOCATION;
exports.MULTI_REGION_ENDPOINTS = MULTI_REGION_ENDPOINTS;
exports.resolveVertexModel = resolveVertexModel;
exports.resolveVertexLocation = resolveVertexLocation;
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
        console.error("Service : Error during generating follow-up actions:", error);
        throw new Error("Audio analyzis failed");
    }
};