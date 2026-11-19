const speech = require('@google-cloud/speech');
const { SPEECH_VARS, googleAuthOptions, requireGoogleAuth, isCredentialsError } = require('./gcpCredentials');

// Identifiants : GCP_SPEECH_TO_TEXT_CREDENTIALS (JSON complet du compte de service, voir gcpCredentials.js), sinon
// GOOGLE_APPLICATION_CREDENTIALS (fichier hors dépôt). Aucun fichier de clé. Client créé au premier appel : sans identifiants,
// le serveur démarre et l'appel échoue avec une erreur 503 claire nommant la variable.
if (process.env.NODE_ENV !== 'test') googleAuthOptions(SPEECH_VARS, 'Speech-to-Text');
let speechClient = null;
const getClient = () => {
    if (!speechClient) speechClient = new speech.SpeechClient(requireGoogleAuth(SPEECH_VARS, 'Speech-to-Text'));
    return speechClient;
};

exports.transcribeLongAudio = async (languageCode, fileUri) => {
    try {
        const config = {
            encoding: "LINEAR16", // Ensure the correct encoding for the uploaded file OGG_OPUS 
            languageCode: languageCode,
            sampleRateHertz: 48000,
            enableAutomaticPunctuation: true, // Improve readability with punctuation
        };

        const audio = {
            uri: fileUri, // Google Cloud Storage URI (gs://bucket-name/file.flac)
        };

        const request = { config, audio };

        console.log("Starting long audio transcription...");

        // Long-running operation for large audio files
        const [operation] = await getClient().longRunningRecognize(request);

        console.log("Waiting for transcription to complete...");
        const [response] = await operation.promise(); // Wait for the operation to complete

        // Extract and join transcriptions
        const transcription = response.results
            .map(result => result.alternatives[0].transcript)
            .join("\n");

        console.log(`Transcription completed: \n${transcription}`);
        return transcription;
    } catch (error) {
        if (isCredentialsError(error)) throw error;
        console.error("Error transcribing long audio:", error);
        throw new Error("Long audio transcription failed");
    }
};