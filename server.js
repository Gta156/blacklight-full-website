// server.js for Blacklight NBT Tools (Handles Java to Bedrock translation)

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import only the necessary functions from the translator logic
// IMPORTANT: You need a translator.js file in the same directory containing these exported functions.
import {
    parseJavaCommand,
    javaToUniversal,
    universalToBedrock,
    formatBedrockCommand
} from './translator.js'; // Assuming translator.js is in the same directory

// --- Basic Server Setup ---
const app = express();
const port = process.env.PORT || 3000; // Use environment port or default to 3000

// Determine directory paths for serving static files and resolving modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Middleware ---
// Enable Cross-Origin Resource Sharing (useful if frontend is served differently, safe to keep)
app.use(cors());
// Parse incoming JSON request bodies
app.use(express.json({ limit: '10mb' })); // Allow larger command lists if needed
// Serve static files (index.html, script.js, etc.) from the current directory
app.use(express.static(__dirname));

// Simple request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});


// --- Translation API Endpoint ---
app.post('/translate', async (req, res) => {
    console.log('--- Translation Request Received ---');
    try {
        const { commands } = req.body;

        // Input validation
        if (!commands || !Array.isArray(commands)) {
            console.error("Invalid request: 'commands' field missing or not an array.");
            return res.status(400).json({ error: "Invalid request body: 'commands' must be an array." });
        }
        if (commands.length === 0) {
            console.log("Request contained empty command list.");
            return res.json({ translatedCommands: [] }); // Return empty list gracefully
        }

        console.log(`Processing ${commands.length} Java commands...`);

        const translatedCommands = [];
        const errors = []; // Optional: Collect errors to send back

        // Process commands sequentially
        for (let i = 0; i < commands.length; i++) {
            const originalJavaCommand = commands[i];
            const commandNumber = i + 1;

            if (!originalJavaCommand || typeof originalJavaCommand !== 'string' || !originalJavaCommand.trim()) {
                // Skip empty lines or invalid entries silently on the server,
                // as the frontend might send them if the file has blank lines.
                continue;
            }

            try {
                // 1. Parse
                const parsed = parseJavaCommand(originalJavaCommand);
                if (!parsed) {
                     // console.warn(`Cmd ${commandNumber}: Could not parse: ${originalJavaCommand}`);
                    errors.push(`Cmd ${commandNumber}: Invalid Java command format.`);
                    continue;
                }

                // 2. Java -> Universal
                const universal = await javaToUniversal(parsed);
                 if (!universal) {
                    // console.warn(`Cmd ${commandNumber}: No Universal mapping for ${parsed.blockId || 'parsed block'}.`);
                     errors.push(`Cmd ${commandNumber}: Cannot find Universal mapping for ${parsed.blockId}.`);
                     continue;
                 }

                 // 3. Universal -> Bedrock
                const bedrockRep = await universalToBedrock(parsed, universal); // Pass original parsed command too
                 if (!bedrockRep) {
                    // console.warn(`Cmd ${commandNumber}: Failed to convert ${parsed.blockId || 'universal block'} to Bedrock.`);
                    errors.push(`Cmd ${commandNumber}: Failed to convert ${parsed.blockId} to Bedrock.`);
                    continue;
                }

                 // 4. Format Bedrock Command
                 const finalBedrockCommand = formatBedrockCommand(bedrockRep);
                if (!finalBedrockCommand) {
                    // console.warn(`Cmd ${commandNumber}: Failed to format Bedrock command for ${parsed.blockId || 'bedrock rep'}.`);
                    errors.push(`Cmd ${commandNumber}: Error formatting Bedrock command for ${parsed.blockId}.`);
                    continue;
                 }

                 translatedCommands.push(finalBedrockCommand);

            } catch (error) {
                 // Catch errors specific to a single command's translation
                console.error(`Error translating command ${commandNumber} ("${originalJavaCommand}"):`, error);
                errors.push(`Cmd ${commandNumber}: Internal Error - ${error.message}`);
             }
        }

         console.log(`--- Translation Finished: ${translatedCommands.length} successful, ${errors.length} failed/skipped ---`);
         if (errors.length > 0) {
            console.log("First few errors:", errors.slice(0, 5));
         }

        res.json({
            translatedCommands: translatedCommands,
            // You could optionally send errors back:
            // errors: errors
        });

    } catch (error) {
         // Catch unexpected errors during the overall request processing
        console.error('!!! Critical Error in /translate endpoint:', error);
        res.status(500).json({ error: 'An internal server error occurred during translation.' });
    }
});

// --- Catch-all Route for Frontend ---
// This MUST be AFTER your API specific routes (like /translate)
app.get('*', (req, res) => {
     // Check if the request looks like it's asking for a file extension
     if (path.extname(req.path).length > 0) {
         // It might be asking for script.js, pako.min.js, etc.
         // Let express.static handle it or return 404 if not found
         res.status(404).send('Resource not found');
    } else {
        // Otherwise, serve the main HTML file for any non-API GET request
         console.log(`Serving index.html for path: ${req.url}`);
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});


// --- Start the Server ---
app.listen(port, () => {
     console.log(`\n=== Blacklight NBT Server Ready ===`);
    console.log(`  URL: http://localhost:${port}`);
     console.log(`  Serving files from: ${__dirname}`);
    console.log(`  Java <-> Bedrock Translation API Endpoint: POST /translate`);
     console.log(`  NOTE: Ensure 'translator.js' exists in the same directory.`);
     console.log(`  Ensure mapping directories ('java to_universal', etc.) are present if required by translator.js.`);
    console.log(`====================================\n`);
});