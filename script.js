// Single script.js for Blacklight NBT Tools

document.addEventListener('DOMContentLoaded', function() {
    console.log('Blacklight NBT Tools script initialized.');

    // --- Navigation ---
    const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const toolSections = document.querySelectorAll('.tool-section');
    const offcanvasElement = document.getElementById('mainNavSidebar');
    let sidebarInstance = null;
    if (offcanvasElement) {
         // Initialize Offcanvas only if it hasn't been initialized yet
         // Check if Bootstrap thinks it's initialized
         if (!bootstrap.Offcanvas.getInstance(offcanvasElement)) {
             sidebarInstance = new bootstrap.Offcanvas(offcanvasElement);
         } else {
             sidebarInstance = bootstrap.Offcanvas.getInstance(offcanvasElement);
         }
    } else {
        console.error("Sidebar offcanvas element not found.");
    }


    function showToolSection(toolId) {
        toolSections.forEach(section => {
            if (section.id === toolId) {
                section.classList.add('active');
                 // Reset logic removed from here - reset happens explicitly via Brand click or manual action if needed
            } else {
                section.classList.remove('active');
            }
        });
         // Update active link in sidebar
         sidebarLinks.forEach(link => {
             link.classList.toggle('active', link.dataset.toolId === toolId);
         });
         console.log(`Navigated to tool: ${toolId}`);
         // Hide sidebar only if it's currently shown and the instance exists
         if (sidebarInstance && offcanvasElement?.classList.contains('show')) {
              sidebarInstance.hide(); // Hide sidebar after selection
         }
    }

     // Utility to capitalize first letter for function calls
     function capitalizeFirstLetter(string) {
         if (!string) return string;
        return string.charAt(0).toUpperCase() + string.slice(1);
     }


    sidebarLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault();
            const toolId = this.dataset.toolId;
            if (toolId) {
                showToolSection(toolId);
            }
        });
    });

    // Show the default active tool on load (Java to Bedrock)
    showToolSection('java-to-bedrock');

     // --- Global Helper Functions ---

     function displayValidationMessage(elementId, message, type = 'error') {
        const msgElement = document.getElementById(elementId);
        if (!msgElement) {
            console.error(`Validation message element not found: ${elementId}`);
            return;
        }
        msgElement.textContent = message;
        msgElement.className = 'validation-message'; // Reset classes
        msgElement.classList.add(type); // Add 'info', 'success', or 'error' class
        msgElement.style.display = 'block';
        // Optional: Scroll into view
        // msgElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Auto-hide for non-info messages after 5 seconds
        if (type !== 'info') {
            setTimeout(() => {
                // Hide only if the message hasn't changed
                if (msgElement.textContent === message && msgElement.style.display === 'block') {
                    msgElement.style.display = 'none';
                }
            }, 5000);
        }
    }

    function hideValidationMessage(elementId) {
        const msgElement = document.getElementById(elementId);
        if (msgElement) {
            msgElement.style.display = 'none';
            msgElement.textContent = '';
        }
    }

     function setButtonState(buttonId, text, isLoading = false) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.disabled = isLoading;
        if (isLoading) {
             button.innerHTML = `<span class="btn-spinner" role="status" aria-hidden="true"></span> ${text}`;
        } else {
            // Restore original icon if needed (find icon within button)
             const icon = button.querySelector('i.fas, i.fab'); // Look for fas or fab icons
             button.innerHTML = icon ? `${icon.outerHTML} ${text}` : text;
        }
     }

    function updateFileNameDisplay(elementId, file) {
        const displayElement = document.getElementById(elementId);
        if (displayElement) {
            displayElement.textContent = file ? file.name : 'No file selected';
        }
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
         console.log(`Download triggered for: ${filename}`);
    }

    // Function to setup Drop Area and Input interactions
    function setupFileHandling(dropAreaId, inputId, nameDisplayId, fileHandlerFunction) {
        const dropArea = document.getElementById(dropAreaId);
        const fileInput = document.getElementById(inputId);
        const nameDisplay = document.getElementById(nameDisplayId);
        // Removed defaultDropText extraction as it wasn't used consistently

        if (!dropArea || !fileInput || !nameDisplay) {
            console.error(`Missing elements for file handling setup: ${dropAreaId}, ${inputId}, ${nameDisplayId}`);
            return;
        }

        const handleFileSelection = (file) => {
            // Clear previous validation first
             hideValidationMessage(`${dropAreaId.replace('-drop-area', '')}-validation-message`);

            if (file) {
                // More robust file type check using accept attribute and extension
                const acceptAttr = fileInput.accept || "";
                 const acceptedTypes = acceptAttr.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
                let isValid = false;
                if (acceptedTypes.length === 0) {
                    isValid = true; // No accept attribute means any file is okay? Assume so.
                } else {
                    isValid = acceptedTypes.some(type => {
                         if (type.startsWith('.')) { // Check extension
                             return file.name.toLowerCase().endsWith(type);
                        } else if (type.endsWith('/*')) { // Check major mime type (e.g., 'text/*')
                             return file.type.startsWith(type.slice(0, -1));
                         } else { // Check exact mime type
                            return file.type === type;
                        }
                     });
                }

                if (!isValid) {
                    displayValidationMessage(`${dropAreaId.replace('-drop-area', '')}-validation-message`, `Invalid file type. Expected: ${acceptAttr || 'any'}`, 'error');
                     updateFileNameDisplay(nameDisplayId, null);
                     fileInput.value = null; // Clear the actual input
                     if (fileHandlerFunction) fileHandlerFunction(null); // Notify handler of invalid file
                     return;
                }

                // If valid file
                 nameDisplay.textContent = file.name;
                if (fileHandlerFunction) {
                     fileHandlerFunction(file);
                 }
                 console.log(`File ready for ${dropAreaId}: ${file.name}`);
            } else { // File selection cancelled or cleared
                nameDisplay.textContent = 'No file selected';
                 if (fileHandlerFunction) {
                     fileHandlerFunction(null); // Notify handler
                 }
             }
        };

         // Prevent default drag behaviors
         ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
           dropArea.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
         });
         // Highlight on drag over
         ['dragenter', 'dragover'].forEach(eventName => {
           dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
         });
         // Remove highlight on drag leave/drop
         ['dragleave', 'drop'].forEach(eventName => {
           dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
         });

         // Handle dropped files
         dropArea.addEventListener('drop', (e) => {
           const dt = e.dataTransfer;
           if (dt.files.length > 0) {
              // Assign to input to maintain consistency and trigger change event
              fileInput.files = dt.files;
              // Manually call handler
              handleFileSelection(fileInput.files[0]);
           }
         }, false);

         // Allow clicking the area to trigger file input
         dropArea.addEventListener('click', () => fileInput.click());

          // Update drop area text when file is selected via click
         fileInput.addEventListener('change', () => {
              handleFileSelection(fileInput.files[0]);
         });
     }


    // ========================================================================
    //  TOOL SPECIFIC LOGIC START
    // ========================================================================

    // ------------------------------------------
    //  1. JAVA TO BEDROCK TRANSLATOR LOGIC
    // ------------------------------------------
    (() => {
        let javaCommandsContent = ''; // Tool-specific state

        const dropAreaId = 'java-bedrock-drop-area';
        const inputId = 'java-bedrock-input-file';
        const nameDisplayId = 'java-bedrock-file-name';
        const translateButtonId = 'java-bedrock-translate-button';
        const downloadButtonId = 'java-bedrock-download-button';
        const previewTextId = 'java-bedrock-preview-text';
        const outputPreviewId = 'java-bedrock-output-preview';
        const validationMsgId = 'java-bedrock-validation-message';

        const translateButton = document.getElementById(translateButtonId);
        const downloadButton = document.getElementById(downloadButtonId);
        const previewText = document.getElementById(previewTextId);
        const outputPreview = document.getElementById(outputPreviewId);

        function handleJavaFile(file) {
             if (!file) {
                 javaCommandsContent = '';
                 if (translateButton) translateButton.disabled = true;
                 if (downloadButton) downloadButton.disabled = true;
                 if (outputPreview) outputPreview.style.display = 'none';
                 if (previewText) previewText.value = ''; // Clear preview on file removal
                 console.log('Java file selection cleared.');
                 return;
             }
            const reader = new FileReader();
            reader.onload = function(e) {
                javaCommandsContent = e.target.result;
                if (translateButton) translateButton.disabled = false;
                if (downloadButton) downloadButton.disabled = true;
                if (outputPreview) outputPreview.style.display = 'none';
                if (previewText) previewText.value = ''; // Clear previous preview
                hideValidationMessage(validationMsgId); // Hide validation on new file load
            };
            reader.onerror = function(e) {
                 displayValidationMessage(validationMsgId, 'Error reading file.', 'error');
                 console.error("Java file reading error:", e);
                 javaCommandsContent = '';
                 if (translateButton) translateButton.disabled = true;
                if (downloadButton) downloadButton.disabled = true;
            };
             reader.readAsText(file);
        }

        function resetJavaToBedrock() {
             javaCommandsContent = '';
             const fileInput = document.getElementById(inputId);
             if (fileInput) fileInput.value = null;
             updateFileNameDisplay(nameDisplayId, null);
             if (outputPreview) outputPreview.style.display = 'none';
             if (previewText) previewText.value = '';
             hideValidationMessage(validationMsgId);
             if (translateButton) setButtonState(translateButtonId, 'Translate Commands', false);
             if (translateButton) translateButton.disabled = true;
             if (downloadButton) downloadButton.disabled = true;
             console.log("Java to Bedrock tool reset.");
        }
        // Make reset function globally accessible if needed
        window.resetJavaToBedrock = resetJavaToBedrock;


        // Setup file handling for this tool
        setupFileHandling(dropAreaId, inputId, nameDisplayId, handleJavaFile);

        // Translate Button Click
        if (translateButton) {
            translateButton.addEventListener('click', async () => {
                if (!javaCommandsContent) {
                    displayValidationMessage(validationMsgId, 'Please select a file with Java commands.', 'error');
                    return;
                }

                const commands = javaCommandsContent.split(/\r?\n/).filter(cmd => cmd.trim().length > 0);
                if (commands.length === 0) {
                    displayValidationMessage(validationMsgId, 'File contains no valid commands.', 'error');
                    return;
                }

                setButtonState(translateButtonId, 'Translating...', true);
                hideValidationMessage(validationMsgId);
                if (downloadButton) downloadButton.disabled = true;
                if (previewText) previewText.value = ''; // Clear previous results during load
                if (outputPreview) outputPreview.style.display = 'none';


                try {
                     displayValidationMessage(validationMsgId, 'Contacting server...', 'info'); // Initial feedback
                    const response = await fetch('/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ commands }),
                    });
                     hideValidationMessage(validationMsgId); // Hide 'Contacting' message

                    if (!response.ok) {
                        let errorMsg = `Translation failed: ${response.status} ${response.statusText}`;
                        try {
                             const errorData = await response.json();
                             errorMsg = `Translation failed: ${errorData.error || errorMsg}`;
                         } catch (e) { /* Ignore if response not JSON */ }
                         throw new Error(errorMsg);
                    }

                    const result = await response.json();

                    if (!result.translatedCommands || !Array.isArray(result.translatedCommands)) {
                         throw new Error('Invalid response format from server.');
                    }

                    // Display translated commands
                    if (previewText) previewText.value = result.translatedCommands.join('\n');
                    if (outputPreview) outputPreview.style.display = 'block';
                    const hasCommands = result.translatedCommands.length > 0;
                     if (downloadButton) downloadButton.disabled = !hasCommands;
                    if (hasCommands) {
                         displayValidationMessage(validationMsgId, 'Translation successful!', 'success');
                     } else {
                         displayValidationMessage(validationMsgId, 'Translation finished, but no commands were generated (check mappings/input).', 'info');
                     }

                } catch (error) {
                     console.error('Translation error:', error);
                     displayValidationMessage(validationMsgId, error.message || 'An unexpected error occurred during translation.', 'error');
                     if (outputPreview) outputPreview.style.display = 'none'; // Hide output on error
                } finally {
                     // Restore original button text using FontAwesome icon if present
                    setButtonState(translateButtonId, 'Translate Commands', false);
                }
            });
        } else { console.error(`Button ${translateButtonId} not found.`); }

        // Download Button Click
         if (downloadButton) {
             downloadButton.addEventListener('click', () => {
                if (!previewText || !previewText.value) {
                    displayValidationMessage(validationMsgId, 'No translated commands to download.', 'error');
                    return;
                }
                const blob = new Blob([previewText.value], { type: 'text/plain;charset=utf-8' });
                triggerDownload(blob, 'translated_bedrock_commands.txt');
            });
        } else { console.error(`Button ${downloadButtonId} not found.`); }

         // Initial state
        if (translateButton) translateButton.disabled = true;
        if (downloadButton) downloadButton.disabled = true;


    })(); // End Java to Bedrock IIFE


    // ------------------------------------------
    //  2. RAW COMMANDS TO NBT LOGIC
    // ------------------------------------------
    (() => {
        let rawCommandsContent = ''; // Tool-specific state

        const dropAreaId = 'raw-to-nbt-drop-area';
        const inputId = 'raw-to-nbt-input-file';
        const nameDisplayId = 'raw-to-nbt-file-name';
        const generateButtonId = 'raw-to-nbt-generate-button';
        const downloadButtonId = 'raw-to-nbt-download-button';
        const previewTextId = 'raw-to-nbt-preview-text';
        const outputPreviewId = 'raw-to-nbt-output-preview';
        const validationMsgId = 'raw-to-nbt-validation-message';
        const titleInputId = 'raw-to-nbt-title';
        const bytesInputId = 'raw-to-nbt-bytes-per-npc';

        const generateButton = document.getElementById(generateButtonId);
        const downloadButton = document.getElementById(downloadButtonId);
        const previewText = document.getElementById(previewTextId);
        const outputPreview = document.getElementById(outputPreviewId);
        const titleInput = document.getElementById(titleInputId);
        const bytesInput = document.getElementById(bytesInputId);

        // --- Core Processing Functions (Unchanged) ---
        function getUtf8ByteLength(str) { const encoder = new TextEncoder(); return encoder.encode(str).length; }
        function escapeQuotes(command) { return command.replace(/"/g, '\\\\\\"'); }
        function getUsefulCommands(content) { return content.split(/\r?\n/).map(cmd => cmd.trim()).filter(cmd => cmd.length > 0 && !cmd.startsWith('#')); }
        function separateCommands(commands) {
             const normalCommands=[], equalsCommands=[]; const escapedCommands=commands.map(escapeQuotes);
             escapedCommands.forEach(cmd => { /^\s*[\w.]+ *=/.test(cmd)||cmd.includes(' = ')?equalsCommands.push(cmd):normalCommands.push(cmd); });
            console.log(`Raw2NBT Separated: ${normalCommands.length} normal, ${equalsCommands.length} equals.`);
             return { normalCommands, equalsCommands };
         }
        function getBlockOpener(nbtName){return `{Block:{name:"minecraft:moving_block",states:{},version:17959425},Count:1b,Damage:0s,Name:"minecraft:moving_block",WasPickedUp:0b,tag:{display:{Lore:["Â§lÂ§bBuild By: Â§dBlacklightî„€","Â§3Tool By: Â§aCommunity","Â§9Powered By: Â§eBlacklight NBTî„‚","Â§fdiscord.gg/3pZvgq4XPq","Â§6${nbtName} Build    î„ƒ","Â§4Warning: Â§cDont Hold Too","Â§cMany Or You Will Lag!!Â§âˆ†"],Name:"Â§lÂ§dBuild: Â§gÂ§l${nbtName}"},ench:[{id:28s,lvl:1s}],movingBlock:{name:"minecraft:sea_lantern",states:{},version:17879555},movingEntity:{Occupants:[`;}
        function getBlockCloser(){return `],id:"Beehive"}}}`}
        function getNpcOpener(section, nbtName){return `{ActorIdentifier:"minecraft:npc<>",SaveData:{Actions:"[{"button_name" : "Build: ${section}","data" : [`;}
        function getNpcCloser(section, nbtName){return `],"mode" : 0,"text" : "","type" : 1}]",CustomName:"Â§lÂ§dBuild: ${nbtName}",CustomNameVisible:1b,InterativeText:"Â§eBlacklight NBT Tool\\nÂ§bSection: ${section}\\nÂ§fdiscord.gg/3pZvgq4XPq î„ƒ\\nÂ§6Enjoy ${nbtName}!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBuild: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`}
        function getEqualsNpcOpener(section, nbtName){return `{ActorIdentifier:"minecraft:npc<>",SaveData:{"Actions":"[{\\"button_name\\" : \\"Build: ${section}\\",       \\"data\\" : [`;}
        function getEqualsNpcCloser(section, nbtName){return `],       \\"mode\\" : 0,       \\"text\\" : \\"\\",       \\"type\\" : 1}]",CustomName:"Â§lÂ§dBuild: ${nbtName}",CustomNameVisible:1b,InteractiveText:"§eBlacklight NBT Tool\\nÂ§bSection: ${section}\\nÂ§fdiscord.gg/3pZvgq4XPq î„ƒ\\n§6Enjoy ${nbtName}!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBuild: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`}
        function commandJoinerNormal(commands){return commands.map(cmd=>`{"cmd_line":"${cmd}","cmd_ver":12}`).join(',');}
        function commandJoinerEquals(commands){return commands.map(cmd=>`{\\"cmd_line\\":\\"${cmd}\\",\\"cmd_ver\\":42}`).join(',');}
        function processNpcCommandsByBytes(commands,maxBytes,nbtName,startSection,joiner,isEquals){const npcDataList=[];let currentCommands=[];let currentSection=startSection;const openerFunc=isEquals?getEqualsNpcOpener:getNpcOpener;const closerFunc=isEquals?getEqualsNpcCloser:getNpcCloser;for(let i=0;i<commands.length;i++){const cmd=commands[i];const candidateCommands=[...currentCommands,cmd];const candidateJoined=joiner(candidateCommands);const openerText=openerFunc(currentSection,nbtName);const closerText=closerFunc(currentSection,nbtName);const candidateBlock=openerText+candidateJoined+closerText;const candidateByteLength=getUtf8ByteLength(candidateBlock);if(currentCommands.length>0&&candidateByteLength>maxBytes){let npcBlockToFinalize=currentCommands;const finalCommands=[...npcBlockToFinalize];finalCommands.push(`/dialogue open @e[tag=${nbtName}${currentSection+1},type=NPC] @initiator`);finalCommands.push('/kill @s');const finalJoined=joiner(finalCommands);const finalNpcBlock=openerFunc(currentSection,nbtName)+finalJoined+closerFunc(currentSection,nbtName);npcDataList.push(finalNpcBlock);currentCommands=[cmd];currentSection++}else if(candidateByteLength<=maxBytes){currentCommands.push(cmd)}else{console.warn(`Warn: Cmd idx ${startSection*1e3+i} starting w/ "${cmd.substring(0,30)}..." is larger than max bytes (${maxBytes}), creating oversized block.`);if(currentCommands.length>0){const finalCommands=[...currentCommands];finalCommands.push(`/dialogue open @e[tag=${nbtName}${currentSection+1},type=NPC] @initiator`);finalCommands.push('/kill @s');const finalJoined=joiner(finalCommands);npcDataList.push(openerFunc(currentSection,nbtName)+finalJoined+closerFunc(currentSection,nbtName));currentSection++}const oversizedCmds=[cmd];oversizedCmds.push('/kill @s');const oversizedJoined=joiner(oversizedCmds);npcDataList.push(openerFunc(currentSection,nbtName)+oversizedJoined+closerFunc(currentSection,nbtName));currentCommands=[];currentSection++}};if(currentCommands.length>0){const finalCommands=[...currentCommands];finalCommands.push('/kill @s');const finalJoined=joiner(finalCommands);const finalNpcBlock=openerFunc(currentSection,nbtName)+finalJoined+closerFunc(currentSection,nbtName);npcDataList.push(finalNpcBlock)};return {npcData:npcDataList.join(','),count:npcDataList.length}}
        // --- End Core Processing Functions ---


        function handleRawCommandsFile(file) {
            if (!file) {
                rawCommandsContent = '';
                if(generateButton) generateButton.disabled = true;
                if (downloadButton) downloadButton.disabled = true;
                 if (outputPreview) outputPreview.style.display = 'none';
                 if (previewText) previewText.value = ''; // Clear preview
                 return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                rawCommandsContent = e.target.result;
                 console.log(`Raw commands file loaded (${file.name})`);
                if (generateButton) generateButton.disabled = false;
                if (downloadButton) downloadButton.disabled = true;
                if (outputPreview) outputPreview.style.display = 'none';
                 if (previewText) previewText.value = ''; // Clear previous preview
                 hideValidationMessage(validationMsgId);
            };
            reader.onerror = function() {
                displayValidationMessage(validationMsgId, 'Error reading file.', 'error');
                rawCommandsContent = '';
                if (generateButton) generateButton.disabled = true;
            };
            reader.readAsText(file);
        }

        function resetRawToNbt() {
             rawCommandsContent = '';
             const fileInput = document.getElementById(inputId);
             if (fileInput) fileInput.value = null;
             updateFileNameDisplay(nameDisplayId, null);
             if (outputPreview) outputPreview.style.display = 'none';
             if (previewText) previewText.value = '';
             if (titleInput) titleInput.value = 'MyBuild'; // Reset to default
             if (bytesInput) bytesInput.value = '2000'; // Reset to default
             hideValidationMessage(validationMsgId);
             if (generateButton) setButtonState(generateButtonId, 'Generate NBT', false);
             if (generateButton) generateButton.disabled = true;
             if (downloadButton) downloadButton.disabled = true;
             console.log("Raw to NBT tool reset.");
         }
        window.resetRawToNbt = resetRawToNbt;


        // Setup file handling
         setupFileHandling(dropAreaId, inputId, nameDisplayId, handleRawCommandsFile);


         // Generate Button Click
         if (generateButton) {
            generateButton.addEventListener('click', () => {
                 if (!rawCommandsContent) {
                    displayValidationMessage(validationMsgId, 'Please select a commands file.', 'error');
                    return;
                }

                const nbtTitle = titleInput?.value?.trim() || 'MyBuild';
                let maxBytes = 2000; // Default
                 if (bytesInput && bytesInput.value) {
                    try {
                         maxBytes = parseInt(bytesInput.value, 10);
                         if (isNaN(maxBytes) || maxBytes <= 50) {
                            displayValidationMessage(validationMsgId, 'Bytes per NPC must be a number greater than 50.', 'error');
                            return;
                        }
                    } catch {
                         displayValidationMessage(validationMsgId, 'Invalid number for Bytes per NPC.', 'error');
                         return;
                     }
                }

                 setButtonState(generateButtonId, 'Generating...', true);
                 hideValidationMessage(validationMsgId);
                 if (outputPreview) outputPreview.style.display = 'none';
                 if (downloadButton) downloadButton.disabled = true;
                 if (previewText) previewText.value = ''; // Clear during load


                // Use setTimeout to allow UI update before heavy processing
                setTimeout(() => {
                    try {
                        console.log(`Raw2NBT Starting generation: "${nbtTitle}", MaxBytes=${maxBytes}.`);
                        const allCommands = getUsefulCommands(rawCommandsContent);
                        if (allCommands.length === 0) {
                             displayValidationMessage(validationMsgId, 'No valid commands found in the file.', 'info');
                            throw new Error("No commands"); // Stop processing
                        }

                         const { normalCommands, equalsCommands } = separateCommands(allCommands);

                         let combinedNpcData = ''; let normalCount = 0; let equalsCount = 0; let currentSectionIndex = 1;

                         if (normalCommands.length > 0) {
                            const result = processNpcCommandsByBytes(normalCommands,maxBytes,nbtTitle,currentSectionIndex,commandJoinerNormal,false);
                             combinedNpcData += result.npcData; normalCount = result.count; currentSectionIndex += normalCount;
                         }
                         if (equalsCommands.length > 0) {
                            if(combinedNpcData.length>0 && result.npcData.length>0) combinedNpcData += ','; // Add comma only if needed
                             const result = processNpcCommandsByBytes(equalsCommands,maxBytes,nbtTitle,currentSectionIndex,commandJoinerEquals,true);
                             combinedNpcData += result.npcData; equalsCount = result.count;
                         }

                        const fullNbtData = getBlockOpener(nbtTitle) + combinedNpcData + getBlockCloser();

                        if (previewText) previewText.value = fullNbtData;
                         if (outputPreview) outputPreview.style.display = 'block';
                        if (downloadButton) downloadButton.disabled = false;
                         displayValidationMessage(validationMsgId, `NBT generated: ${normalCount + equalsCount} NPC blocks.`, 'success');
                         console.log(`Raw2NBT Generated: ${normalCount} normal, ${equalsCount} equals NPCs.`);

                    } catch (error) {
                         // Don't display generic error if specific one was already shown (e.g., "No commands")
                         if (error.message !== "No commands") {
                             console.error("Error generating NBT:", error);
                             displayValidationMessage(validationMsgId, `Error generating NBT: ${error.message}`, 'error');
                         }
                    } finally {
                        setButtonState(generateButtonId, 'Generate NBT', false);
                    }
                }, 50); // 50ms timeout

            });
        }

        // Download Button Click
        if (downloadButton) {
             downloadButton.addEventListener('click', () => {
                if (!previewText || !previewText.value) {
                    displayValidationMessage(validationMsgId, 'No NBT data to download.', 'error');
                    return;
                 }
                 const nbtTitle = titleInput?.value?.trim() || 'MyBuild';
                 const fileName = `BB NBT ${nbtTitle}.txt`;
                 const blob = new Blob([previewText.value], { type: 'text/plain;charset=utf-8' });
                 triggerDownload(blob, fileName);
             });
        }

         // Initial state
        if (generateButton) generateButton.disabled = true;
        if (downloadButton) downloadButton.disabled = true;

    })(); // End Raw to NBT IIFE


    // ------------------------------------------
    //  3. NBT TO RAW COMMANDS LOGIC <-- **MODIFIED**
    // ------------------------------------------
    (() => {
         let nbtFileContent = ''; // Tool-specific state

         const dropAreaId = 'nbt-to-raw-drop-area';
         const inputId = 'nbt-to-raw-input-file';
         const nameDisplayId = 'nbt-to-raw-file-name';
         const extractButtonId = 'nbt-to-raw-extract-button';
         const downloadButtonId = 'nbt-to-raw-download-button';
         const previewTextId = 'nbt-to-raw-preview-text';
         const outputPreviewId = 'nbt-to-raw-output-preview';
         const validationMsgId = 'nbt-to-raw-validation-message';
         const filterCheckboxId = 'nbt-to-raw-filter-checkbox'; // <-- Get filter checkbox ID

         const extractButton = document.getElementById(extractButtonId);
         const downloadButton = document.getElementById(downloadButtonId);
         const previewText = document.getElementById(previewTextId);
         const outputPreview = document.getElementById(outputPreviewId);
         const filterCheckbox = document.getElementById(filterCheckboxId); // <-- Get filter checkbox element

        // --- Core Processing Functions (Unchanged from previous) ---
        const primaryRegex = /"cmd_line"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
         // Make fallback slightly stricter on starting keyword
        const fallbackRegex = /^\/?(setblock|fill)\s+((?:~?-?\d+\s*){3})\s*(?:((?:~?-?\d+\s*){3})\s+)?([\w:]+)(?:\[[^\]]*\])?(?:\s*\{[^}]*\})?/gm; // Multi-line

         function postProcessCommands(commands) {
             // Fix the specific Horion escaping '\\\\\"' back to '"'
             // And also handle the simpler standard JSON escape '\\"' back to '"'
             return commands.map(cmd => cmd.replace(/\\\\\\\"/g, '"').replace(/\\\"/g, '"').trim());
         }
         // --- End Core Processing Functions ---


        function handleNbtFile(file) {
            if (!file) {
                nbtFileContent = '';
                if(extractButton) extractButton.disabled = true;
                if(downloadButton) downloadButton.disabled = true;
                 if (outputPreview) outputPreview.style.display = 'none';
                 if (previewText) previewText.value = '';
                 return;
             }
            const reader = new FileReader();
             reader.onload = function(e) {
                nbtFileContent = e.target.result;
                console.log(`Text NBT file loaded (${file.name})`);
                if (extractButton) extractButton.disabled = false;
                if (downloadButton) downloadButton.disabled = true;
                 if (outputPreview) outputPreview.style.display = 'none';
                 if (previewText) previewText.value = '';
                 hideValidationMessage(validationMsgId);
            };
             reader.onerror = function() {
                 displayValidationMessage(validationMsgId, 'Error reading file.', 'error');
                nbtFileContent = '';
                 if (extractButton) extractButton.disabled = true;
            };
            reader.readAsText(file);
        }

        function resetNbtToRaw() {
            nbtFileContent = '';
            const fileInput = document.getElementById(inputId);
            if (fileInput) fileInput.value = null;
             updateFileNameDisplay(nameDisplayId, null);
            if (outputPreview) outputPreview.style.display = 'none';
            if (previewText) previewText.value = '';
             if (filterCheckbox) filterCheckbox.checked = false; // <-- Reset filter checkbox
             hideValidationMessage(validationMsgId);
              if (extractButton) setButtonState(extractButtonId, 'Extract Raw Commands', false);
             if (extractButton) extractButton.disabled = true;
             if (downloadButton) downloadButton.disabled = true;
             console.log("NBT to Raw tool reset.");
         }
         window.resetNbtToRaw = resetNbtToRaw;

         // Setup file handling
        setupFileHandling(dropAreaId, inputId, nameDisplayId, handleNbtFile);


         // Extract Button Click
        if (extractButton) {
            extractButton.addEventListener('click', () => {
                if (!nbtFileContent) {
                    displayValidationMessage(validationMsgId, 'Please select or drop a text NBT file first.', 'error');
                    return;
                }
                 if (!filterCheckbox) { // Should not happen, but safeguard
                    displayValidationMessage(validationMsgId, 'Filter checkbox element missing.', 'error');
                     return;
                 }

                setButtonState(extractButtonId, 'Extracting...', true);
                hideValidationMessage(validationMsgId);
                if (outputPreview) outputPreview.style.display = 'none';
                if (downloadButton) downloadButton.disabled = true;
                if (previewText) previewText.value = ''; // Clear previous


                 // Use setTimeout to allow UI update
                 setTimeout(() => {
                    try {
                        // 1. Extract all commands
                        const cmdLineMatches = Array.from(nbtFileContent.matchAll(primaryRegex), match => match[1]);
                         const fallbackMatches = Array.from(nbtFileContent.matchAll(fallbackRegex), match => match[0]);
                         const uniqueRawCommands = [...new Set([...cmdLineMatches, ...fallbackMatches])];
                         const processedCommands = postProcessCommands(uniqueRawCommands);

                        // 2. ** APPLY FILTER **
                         const filterEnabled = filterCheckbox.checked;
                         let finalCommands = processedCommands; // Default to all commands

                         if (filterEnabled) {
                             finalCommands = processedCommands.filter(cmd => {
                                 const lowerCmd = cmd.toLowerCase().trim().replace(/^\//, ''); // remove leading / if present
                                 return lowerCmd.startsWith('setblock') || lowerCmd.startsWith('fill');
                             });
                             console.log(`NBT2Raw: Filtered ${processedCommands.length} down to ${finalCommands.length} setblock/fill commands.`);
                         } else {
                            console.log(`NBT2Raw: Showing all ${finalCommands.length} extracted commands.`);
                         }

                        // 3. Display Output
                        const hasCommands = finalCommands.length > 0;
                        if (hasCommands) {
                            if (previewText) previewText.value = finalCommands.join('\n');
                            displayValidationMessage(validationMsgId, `${finalCommands.length} commands ${filterEnabled ? 'filtered and ' : ''}extracted.`, 'success');
                             if (downloadButton) downloadButton.disabled = false;
                         } else {
                             const msg = filterEnabled
                               ? '// No setblock/fill commands were found in the file.'
                                : '// No commands matching any known patterns were found.';
                            if (previewText) previewText.value = msg;
                             displayValidationMessage(validationMsgId, msg.replace('// ',''), 'info');
                            if (downloadButton) downloadButton.disabled = true;
                         }
                         if (outputPreview) outputPreview.style.display = 'block';

                     } catch (error) {
                         console.error("Error extracting NBT:", error);
                        displayValidationMessage(validationMsgId, `Error extracting commands: ${error.message}`, 'error');
                         if (downloadButton) downloadButton.disabled = true;
                     } finally {
                        setButtonState(extractButtonId, 'Extract Raw Commands', false);
                    }
                }, 50); // 50ms timeout
             });
         } else { console.error(`Button ${extractButtonId} not found.`); }

        // Download Button Click
         if (downloadButton) {
            downloadButton.addEventListener('click', () => {
                if (!previewText || !previewText.value || previewText.value.startsWith('// No')) { // Improved check
                     displayValidationMessage(validationMsgId, 'No extracted commands to download.', 'error');
                     return;
                }
                const originalFileInput = document.getElementById(inputId);
                 const originalFileName = originalFileInput?.files[0]?.name || 'extracted';
                 const baseName = originalFileName.replace(/\.[^/.]+$/, ""); // Remove extension
                const isFiltered = filterCheckbox && filterCheckbox.checked;
                const fileNameSuffix = isFiltered ? '_filtered_commands.txt' : '_commands.txt';
                const blob = new Blob([previewText.value], { type: 'text/plain;charset=utf-8' });
                triggerDownload(blob, `${baseName}${fileNameSuffix}`);
            });
        } else { console.error(`Button ${downloadButtonId} not found.`); }

         // Initial state
         if (extractButton) extractButton.disabled = true;
        if (downloadButton) downloadButton.disabled = true;
        if (filterCheckbox) filterCheckbox.checked = false; // Default to unchecked

    })(); // End NBT to Raw IIFE


    // ------------------------------------------
    //  4. SCHEMATIC TO COMMANDS LOGIC
    // ------------------------------------------
    (() => {
         let schematicFile = null; // Tool-specific state
         let fullGeneratedCommands = []; // Store full command list

         const dropAreaId = 'schem-drop-area';
         const inputId = 'schem-file-input';
         const nameDisplayId = 'schem-file-name';
         const generateButtonId = 'schem-generate-button';
         const statusMsgId = 'schem-status-message';
         const outputNameInputId = 'schem-output-name';
         const includeAirCheckboxId = 'schem-include-air';
         const offsetXInputId = 'schem-offset-x';
         const offsetYInputId = 'schem-offset-y';
         const offsetZInputId = 'schem-offset-z';
         const outputPreviewId = 'schem-to-cmd-output-preview';
         const previewTextId = 'schem-to-cmd-preview-text';
         const downloadButtonId = 'schem-download-button';

         const generateButton = document.getElementById(generateButtonId);
         const outputNameInput = document.getElementById(outputNameInputId);
         const includeAirCheckbox = document.getElementById(includeAirCheckboxId);
         const offsetXInput = document.getElementById(offsetXInputId);
         const offsetYInput = document.getElementById(offsetYInputId);
         const offsetZInput = document.getElementById(offsetZInputId);
         const outputPreview = document.getElementById(outputPreviewId);
         const previewText = document.getElementById(previewTextId);
         const downloadButton = document.getElementById(downloadButtonId);

         // --- Core Processing Functions (Unchanged) ---
         const TAG_END=0,TAG_BYTE=1,TAG_SHORT=2,TAG_INT=3,TAG_LONG=4,TAG_FLOAT=5,TAG_DOUBLE=6,TAG_BYTE_ARRAY=7,TAG_STRING=8,TAG_LIST=9,TAG_COMPOUND=10,TAG_INT_ARRAY=11,TAG_LONG_ARRAY=12;
         class BinaryReader{constructor(b){this.view=new DataView(b);this.position=0}ensureReadableBytes(c){if(this.position+c>this.view.byteLength)throw new Error(`Not enough bytes. Need ${c}, have ${this.view.byteLength-this.position} at pos ${this.position}`)}readByte(){this.ensureReadableBytes(1);const v=this.view.getInt8(this.position);this.position+=1;return v}readShort(){this.ensureReadableBytes(2);const v=this.view.getInt16(this.position,false);this.position+=2;return v}readInt(){this.ensureReadableBytes(4);const v=this.view.getInt32(this.position,false);this.position+=4;return v}readLong(){this.ensureReadableBytes(8);const h=this.view.getInt32(this.position,false);const l=this.view.getInt32(this.position+4,false);this.position+=8;return(BigInt(h)<<32n)|(BigInt(l)&0xFFFFFFFFn)}readFloat(){this.ensureReadableBytes(4);const v=this.view.getFloat32(this.position,false);this.position+=4;return v}readDouble(){this.ensureReadableBytes(8);const v=this.view.getFloat64(this.position,false);this.position+=8;return v}readBytes(l){this.ensureReadableBytes(l);const b=new Uint8Array(this.view.buffer,this.view.byteOffset+this.position,l);this.position+=l;return b}readString(){const l=this.readShort();if(l<0)throw new Error(`Inv Str Len: ${l}`);if(l===0)return"";return new TextDecoder("utf-8").decode(this.readBytes(l))}}
         function readTagPayload(r,t){switch(t){case TAG_END:return null;case TAG_BYTE:return r.readByte();case TAG_SHORT:return r.readShort();case TAG_INT:return r.readInt();case TAG_LONG:return r.readLong();case TAG_FLOAT:return r.readFloat();case TAG_DOUBLE:return r.readDouble();case TAG_BYTE_ARRAY:{const l=r.readInt();if(l<0)throw new Error(`Inv TAG_BYTE_ARRAY Len: ${l}`);return r.readBytes(l)}case TAG_STRING:return r.readString();case TAG_LIST:{const listT=r.readByte();const l=r.readInt();if(l<0)throw new Error(`Inv TAG_LIST Len: ${l}`);const list=[];for(let i=0;i<l;i++){list.push(readTagPayload(r,listT))};return{listType:listT,value:list}}case TAG_COMPOUND:{const comp={};while(true){const tag=readNamedTag(r);if(tag===null||tag.type===TAG_END)break;comp[tag.name]=tag.payload};return comp}case TAG_INT_ARRAY:{const l=r.readInt();if(l<0)throw new Error(`Inv TAG_INT_ARRAY Len: ${l}`);const arr=[];for(let i=0;i<l;i++){arr.push(r.readInt())};return arr}case TAG_LONG_ARRAY:{const l=r.readInt();if(l<0)throw new Error(`Inv TAG_LONG_ARRAY Len: ${l}`);const arr=[];for(let i=0;i<l;i++){arr.push(r.readLong())};return arr}default:throw new Error(`Unsup NBT type: ${t} at pos ${r.position-1}`)}}
         function readNamedTag(r){const t=r.readByte();if(t===TAG_END)return{type:TAG_END,name:"",payload:null};const n=r.readString();const p=readTagPayload(r,t);return{type:t,name:n,payload:p}}
         function loadSchematicNBT(b){const r=new BinaryReader(b);const root=readNamedTag(r);if(!root||root.type!==TAG_COMPOUND)throw new Error(`Root must be COMPOUND, found ${root?root.type:'null'}`);return root.payload}
         function* varIntIterator(bA){let idx=0;const dV=new DataView(bA.buffer,bA.byteOffset,bA.byteLength);while(idx<bA.length){let v=0;let s=0;let byte;do{if(idx>=bA.length)throw new Error("VarInt Err: End of buffer");byte=dV.getUint8(idx++);v|=(byte&0x7F)<<s;s+=7;if(s>35)throw new Error("VarInt too big")}while((byte&0x80)!==0);yield v}}
         function createInvertedPalette(pN){const inv=new Map();if(!pN||typeof pN!=='object')throw new Error("Inv palette: Expected COMPOUND");for(const[bS,idV]of Object.entries(pN)){if(typeof idV!=='number'){console.warn(`Inv palette entry for ${bS}: Expected num, got ${typeof idV}. Skip.`);continue}inv.set(idV,bS)};if(inv.size===0)console.warn("Empty inverted palette created.");return inv}
         function endRun(cmds,s,e,y,z,dx,dy,dz,bT){const rL=e-s+1;if(rL<=0)return;const sX=Math.floor(dx+s);const eX=Math.floor(dx+e);const cY=Math.floor(dy+y);const cZ=Math.floor(dz+z);if(typeof bT!=='string'||!bT.includes(':')){console.warn(`Skip run, inv blockType: ${bT}`);return};if(rL>=3){cmds.push(`fill ~${sX} ~${cY} ~${cZ} ~${eX} ~${cY} ~${cZ} ${bT}`)}else{for(let i=s;i<=e;i++){const cX=Math.floor(dx+i);cmds.push(`setblock ~${cX} ~${cY} ~${cZ} ${bT}`)}}}
         function generateSchemCommands(sD,dims,offset,incAir){if(!Array.isArray(dims)||dims.length!==3||dims.some(d=>typeof d!=='number'||d<=0))throw new Error(`Inv dims: ${JSON.stringify(dims)}`);if(!Array.isArray(offset)||offset.length!==3||offset.some(o=>typeof o!=='number'))throw new Error(`Inv offset: ${JSON.stringify(offset)}`);const[w,h,l]=dims.map(Math.floor);const[dx,dy,dz]=offset.map(Math.floor);let bD,pN;if(sD.Palette&&sD.BlockData){pN=sD.Palette;bD=sD.BlockData}else if(sD.blocks&&typeof sD.blocks==='object'&&sD.blocks.data&&sD.blocks.palette){pN=sD.blocks.palette;bD=sD.blocks.data;console.log("Found nested blocks (lc).")}else if(sD.Blocks&&typeof sD.Blocks==='object'&&sD.Blocks.Data&&sD.Blocks.Palette){pN=sD.Blocks.Palette;bD=sD.Blocks.Data;console.log("Found nested Blocks (Cap).")}else{console.error("Schem Keys:",Object.keys(sD));throw new Error("Missing keys: 'Palette'/'BlockData' or nested.")};if(typeof pN!=='object'||pN===null)throw new Error(`Inv Palette type: ${typeof pN}`);if(!(bD instanceof Uint8Array)){if(Array.isArray(bD)&&bD.every(b=>typeof b==='number')){console.warn("BlockData was Array, converting.");bD=new Uint8Array(bD)}else{throw new Error(`Inv BlockData type: ${bD?.constructor?.name||typeof bD}`)}};const expBC=w*h*l;const invP=createInvertedPalette(pN);if(invP.size===0)throw new Error("Palette empty.");const iter=varIntIterator(bD);const cmds=[];let bI=0;let rS=null,rBT=null;let y=0,z=0;try{for(y=0;y<h;y++){for(z=0;z<l;z++){rS=null;rBT=null;for(let x=0;x<w;x++){const iR=iter.next();if(iR.done){console.warn(`BlockData ended early at ${bI}(x=${x},y=${y},z=${z}). Exp ${expBC}.`);if(rS!==null)endRun(cmds,rS,x-1,y,z,dx,dy,dz,rBT);throw new Error(`Out of block data at ${bI}. Exp ${expBC}`)}const pI=iR.value;bI++;if(!invP.has(pI)){console.warn(`Pal idx ${pI} miss at (x=${x},y=${y},z=${z}). Max:${invP.size-1}. Skip.`);if(rS!==null){endRun(cmds,rS,x-1,y,z,dx,dy,dz,rBT);rS=null};continue};const bT=invP.get(pI);if(!incAir&&bT==="minecraft:air"){if(rS!==null){endRun(cmds,rS,x-1,y,z,dx,dy,dz,rBT);rS=null};continue};if(rS===null){rS=x;rBT=bT}else if(bT!==rBT){endRun(cmds,rS,x-1,y,z,dx,dy,dz,rBT);rS=x;rBT=bT}};if(rS!==null)endRun(cmds,rS,w-1,y,z,dx,dy,dz,rBT)}};if(bI<expBC)console.warn(`Processed ${bI} blocks, expected ${expBC}.`);if(!iter.next().done)console.warn(`BlockData still has data after ${expBC} blocks.`) } catch(e){console.error(`Error in cmd gen loop near (y=${y},z=${z}):`,e);throw e;};console.log(`Gen ${cmds.length} commands (Air:${incAir}). Blocks:${bI}.`);return cmds}
        // --- End Core Processing Functions ---


        function handleSchemFile(file) {
            schematicFile = file; // Store the file object
            if (generateButton) generateButton.disabled = !file;
            if (downloadButton) downloadButton.disabled = true;
            if (outputPreview) outputPreview.style.display = 'none'; // Hide previous preview
            if (previewText) previewText.value = '';
             fullGeneratedCommands = []; // Clear previous commands
            hideValidationMessage(statusMsgId); // Hide validation on new file
             console.log(`Schematic file staged: ${file?.name}`);
         }

        function resetSchemToCommands() {
             schematicFile = null;
             fullGeneratedCommands = [];
             const fileInput = document.getElementById(inputId);
             if (fileInput) fileInput.value = null;
             updateFileNameDisplay(nameDisplayId, null);
             if (outputPreview) outputPreview.style.display = 'none';
             if (previewText) previewText.value = '';
             hideValidationMessage(statusMsgId);
             if (outputNameInput) outputNameInput.value = 'SchemCommands';
             if (includeAirCheckbox) includeAirCheckbox.checked = true;
             if (offsetXInput) offsetXInput.value = '0';
             if (offsetYInput) offsetYInput.value = '0';
             if (offsetZInput) offsetZInput.value = '0';
             if (generateButton) setButtonState(generateButtonId, 'Generate Commands', false);
             if (generateButton) generateButton.disabled = true;
             if (downloadButton) downloadButton.disabled = true;
             console.log("Schematic to Commands tool reset.");
         }
        window.resetSchemToCommands = resetSchemToCommands;

        // Setup file handling
         setupFileHandling(dropAreaId, inputId, nameDisplayId, handleSchemFile);

         // Generate Button Click
        if (generateButton) {
            generateButton.addEventListener('click', () => {
                 if (!schematicFile) {
                     displayValidationMessage(statusMsgId, 'Please select a .schem file first!', 'error');
                     return;
                 }
                 if (!outputNameInput || !includeAirCheckbox || !offsetXInput || !offsetYInput || !offsetZInput) {
                    displayValidationMessage(statusMsgId, 'Required UI inputs not found.', 'error'); return;
                }


                const outputName = outputNameInput.value.trim() || 'SchemCommands';
                const includeAir = includeAirCheckbox.checked;
                 const offsetX = parseInt(offsetXInput.value, 10) || 0;
                 const offsetY = parseInt(offsetYInput.value, 10) || 0;
                 const offsetZ = parseInt(offsetZInput.value, 10) || 0;

                 displayValidationMessage(statusMsgId, 'Reading file...', 'info');
                 setButtonState(generateButtonId, 'Processing...', true);
                 if (outputPreview) outputPreview.style.display = 'none';
                 if (previewText) previewText.value = '';
                 if (downloadButton) downloadButton.disabled = true;
                 fullGeneratedCommands = [];


                 const reader = new FileReader();
                 reader.onload = function(event) {
                     // Wrap processing in timeout for UI responsiveness
                     setTimeout(() => {
                         try {
                             displayValidationMessage(statusMsgId, 'Decompressing & Parsing NBT...', 'info');
                             const compressedData = new Uint8Array(event.target.result);
                             let nbtDataBuffer;
                             if (compressedData[0]===0x1f && compressedData[1]===0x8b){ const decData=pako.inflate(compressedData); nbtDataBuffer=decData.buffer; }
                             else { console.warn("File not Gzipped; trying raw NBT."); nbtDataBuffer=compressedData.buffer; }

                             const schematicNbt = loadSchematicNBT(nbtDataBuffer);
                             console.log("Schem NBT parsed:", schematicNbt); // Log structure

                             let width, height, length;
                             if(typeof schematicNbt.Width==='number'){width=schematicNbt.Width;height=schematicNbt.Height;length=schematicNbt.Length;}
                             else if(schematicNbt.Schematic && typeof schematicNbt.Schematic==='object' && typeof schematicNbt.Schematic.Width==='number'){width=schematicNbt.Schematic.Width;height=schematicNbt.Schematic.Height;length=schematicNbt.Schematic.Length;console.log("Found nested Schematic dimensions.")}
                              else if(typeof schematicNbt.width==='number'){width=schematicNbt.width;height=schematicNbt.height;length=schematicNbt.length;console.log("Found lowercase dimensions.")}
                              else { console.error("NBT Keys:",Object.keys(schematicNbt)); throw new Error("Missing dimensions (Width/Height/Length) in NBT."); }

                              if (width<=0||height<=0||length<=0) throw new Error(`Invalid dims: W=${width},H=${height},L=${length}`);
                             const dims=[width,height,length];const offset=[offsetX,offsetY,offsetZ];

                            displayValidationMessage(statusMsgId, `Generating for ${width}x${height}x${length}...`, 'info');

                             fullGeneratedCommands = generateSchemCommands(schematicNbt, dims, offset, includeAir);

                            if (fullGeneratedCommands.length === 0) {
                                displayValidationMessage(statusMsgId, 'Warning: No commands generated.', 'info');
                             } else {
                                const previewCount = 100; // Limit preview
                                if (previewText) previewText.value = fullGeneratedCommands.slice(0, previewCount).join('\n') + (fullGeneratedCommands.length > previewCount ? `\n\n... (${fullGeneratedCommands.length - previewCount} more commands hidden)` : '');
                                if (outputPreview) outputPreview.style.display = 'block';
                                if (downloadButton) downloadButton.disabled = false;
                                 displayValidationMessage(statusMsgId, `Success! ${fullGeneratedCommands.length} commands generated. Preview shown.`, 'success');
                            }
                         } catch (e) {
                             console.error("Error processing schematic:", e);
                            displayValidationMessage(statusMsgId, `Error: ${e.message || 'Unknown error.'}`, 'error');
                             fullGeneratedCommands = []; // Clear on error
                            if (downloadButton) downloadButton.disabled = true;
                         } finally {
                            setButtonState(generateButtonId, 'Generate Commands', false);
                        }
                     }, 50); // End setTimeout
                 }; // End reader.onload

                 reader.onerror = () => {
                    displayValidationMessage(statusMsgId, 'Error reading the schematic file.', 'error');
                     setButtonState(generateButtonId, 'Generate Commands', false);
                 };
                reader.readAsArrayBuffer(schematicFile);
             });
         }

         // Download Button Click
         if(downloadButton) {
             downloadButton.addEventListener('click', () => {
                 if (!fullGeneratedCommands || fullGeneratedCommands.length === 0) {
                     displayValidationMessage(statusMsgId, 'No commands available to download.', 'error');
                    return;
                }
                const commandsText = fullGeneratedCommands.join('\n');
                 const blob = new Blob([commandsText], { type: 'text/plain;charset=utf-8' });
                 const outputName = outputNameInput?.value?.trim() || 'SchemCommands';
                 const now = new Date();
                const timestamp = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
                triggerDownload(blob, `${outputName}_${timestamp}.txt`);
            });
         }

        // Initial state
        if (generateButton) generateButton.disabled = true;
        if (downloadButton) downloadButton.disabled = true;

    })(); // End Schematic to Commands IIFE

     // ------------------------------------------
     //  5. COMMANDS TO STRUCTURE LOGIC
     // ------------------------------------------
    (() => {
         let cmdStructFileContent = ''; // Tool-specific state
         let cmdStructGeneratedData = null; // Store the final JSON structure data

         const dropAreaId = 'cmd-struct-drop-area';
         const inputId = 'cmd-struct-input-file';
         const nameDisplayId = 'cmd-struct-file-name';
         const convertButtonId = 'cmd-struct-convert-button';
         const downloadButtonId = 'cmd-struct-download-button';
         const outputPreviewId = 'cmd-struct-output-preview';
         const previewContainerId = 'cmd-struct-preview-container';
         const previewTextId = 'cmd-struct-preview-text';
         const validationMsgId = 'cmd-struct-validation-message';

         const convertButton = document.getElementById(convertButtonId);
         const downloadButton = document.getElementById(downloadButtonId);
         const outputPreview = document.getElementById(outputPreviewId);
         const previewContainer = document.getElementById(previewContainerId);
         const previewTextElement = document.getElementById(previewTextId);

         // --- Core Processing Functions (Unchanged) ---
         let cmdStructBlocksMap={};let cmdStructCurrentOffset=0;const NBT_TAG_End=0,NBT_TAG_Byte=1,NBT_TAG_Short=2,NBT_TAG_Int=3,NBT_TAG_Long=4,NBT_TAG_Float=5,NBT_TAG_Double=6,NBT_TAG_Byte_Array=7,NBT_TAG_String=8,NBT_TAG_List=9,NBT_TAG_Compound=10;
         function writeByte(b,o,v){b.setInt8(o,v);return o+1}
         function writeUnsignedShort(b,o,v){b.setUint16(o,v,true);return o+2}
         function writeInt(b,o,v){b.setInt32(o,v,true);return o+4}
         function writeFloat(b,o,v){b.setFloat32(o,v,true);return o+4}
         function writeStringPayload(b,o,t){const enc=new TextEncoder();const uB=enc.encode(t||"");o=writeUnsignedShort(b,o,uB.length);uB.forEach((byte,i)=>b.setUint8(o+i,byte));return o+uB.length}
         function getNbtType(v){if(typeof v==="boolean")return NBT_TAG_Byte;if(typeof v==="number")return Number.isInteger(v)?NBT_TAG_Int:NBT_TAG_Float;if(typeof v==="string")return NBT_TAG_String;if(Array.isArray(v))return NBT_TAG_List;if(typeof v==="object"&&v!==null&&!(v instanceof Uint8Array))return NBT_TAG_Compound;if(v instanceof Uint8Array)return NBT_TAG_Byte_Array;throw new TypeError(`Unsupported JS type for NBT: ${typeof v}`)}
         function writeTagNonRecursive(b,n,v){cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,getNbtType(v));if(n!==null&&n!==undefined)cmdStructCurrentOffset=writeStringPayload(b,cmdStructCurrentOffset,n);const t=getNbtType(v);switch(t){case NBT_TAG_Byte:cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,v?1:0);break;case NBT_TAG_Int:cmdStructCurrentOffset=writeInt(b,cmdStructCurrentOffset,v);break;case NBT_TAG_Float:cmdStructCurrentOffset=writeFloat(b,cmdStructCurrentOffset,v);break;case NBT_TAG_String:cmdStructCurrentOffset=writeStringPayload(b,cmdStructCurrentOffset,v);break;case NBT_TAG_List:writeListNonRecursive(b,v);break;case NBT_TAG_Compound:Object.entries(v).forEach(([k,vl])=>writeTagNonRecursive(b,k,vl));cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,NBT_TAG_End);break;default:throw new Error(`Unhandled NBT type: ${t}`)}}
         function writeListNonRecursive(b,dL){if(!dL||dL.length===0){cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,NBT_TAG_End);cmdStructCurrentOffset=writeInt(b,cmdStructCurrentOffset,0);return};const eT=getNbtType(dL[0]);cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,eT);cmdStructCurrentOffset=writeInt(b,cmdStructCurrentOffset,dL.length);dL.forEach(item=>{switch(eT){case NBT_TAG_Byte:cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,item?1:0);break;case NBT_TAG_Int:cmdStructCurrentOffset=writeInt(b,cmdStructCurrentOffset,item);break;case NBT_TAG_Float:cmdStructCurrentOffset=writeFloat(b,cmdStructCurrentOffset,item);break;case NBT_TAG_String:cmdStructCurrentOffset=writeStringPayload(b,cmdStructCurrentOffset,item);break;case NBT_TAG_List:writeListNonRecursive(b,item);break;case NBT_TAG_Compound:Object.entries(item).forEach(([k,vl])=>writeTagNonRecursive(b,k,vl));cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,NBT_TAG_End);break;default:throw new Error(`Unhandled NBT List type: ${eT}`)}})}
         function estimateBufferSize(d){return Math.max(JSON.stringify(d).length*4,10*1024*1024)}
         function createNbtBuffer(d){const eS=estimateBufferSize(d);const aB=new ArrayBuffer(eS);const b=new DataView(aB);cmdStructCurrentOffset=0;cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,NBT_TAG_Compound);cmdStructCurrentOffset=writeStringPayload(b,cmdStructCurrentOffset,"");Object.entries(d).forEach(([k,v])=>writeTagNonRecursive(b,k,v));cmdStructCurrentOffset=writeByte(b,cmdStructCurrentOffset,NBT_TAG_End);return aB.slice(0,cmdStructCurrentOffset)}
         function parseCoordinate(cS){cS=cS.trim();if(cS.startsWith('~')){const o=cS.substring(1);return o?parseInt(o,10):0}else{return parseInt(cS,10)}}
         function parseBlockWithStates(bS){bS=bS.trim();const m=bS.match(/^([\w:]+)(?:\[(.*)\])?/);if(!m)return[bS,{}];const bN=m[1];const sS=m[2]||'';const s={};if(sS){sS.split(',').forEach(p=>{const pts=p.split('=');if(pts.length!==2)return;const k=pts[0].trim().replace(/"/g,'');let v=pts[1].trim();if(v==='"true"'||v==='true')s[k]=true;else if(v==='"false"'||v==='false')s[k]=false;else if(/^".*"$/.test(v))s[k]=v.slice(1,-1);else{const n=parseInt(v);s[k]=isNaN(n)?v:n}})};return[bN.includes(':')?bN:`minecraft:${bN}`,s]}
         function processCmdStructCommands(cT){cmdStructBlocksMap={};let cC=0,eC=0;const bX=0,bY=0,bZ=0;const cmds=cT.split(/\r?\n/);for(let lN=0;lN<cmds.length;lN++){const c=cmds[lN].trim();if(!c||c.startsWith('#'))continue;const p=c.split(/\s+/);if(p.length===0)continue;const cN=p[0].toLowerCase().replace('/','');cC++;try{if(cN==='fill'&&p.length>=8){const x1=bX+parseCoordinate(p[1]),y1=bY+parseCoordinate(p[2]),z1=bZ+parseCoordinate(p[3]);const x2=bX+parseCoordinate(p[4]),y2=bY+parseCoordinate(p[5]),z2=bZ+parseCoordinate(p[6]);const bS=p.slice(7).join(' ');const[bN,s]=parseBlockWithStates(bS);const sX=Math.min(x1,x2),eX=Math.max(x1,x2),sY=Math.min(y1,y2),eY=Math.max(y1,y2),sZ=Math.min(z1,z2),eZ=Math.max(z1,z2);for(let x=sX;x<=eX;x++){if(!cmdStructBlocksMap[x])cmdStructBlocksMap[x]={};for(let y=sY;y<=eY;y++){if(!cmdStructBlocksMap[x][y])cmdStructBlocksMap[x][y]={};for(let z=sZ;z<=eZ;z++){cmdStructBlocksMap[x][y][z]=[bN,{...s}]}}}}else if(cN==='setblock'&&p.length>=5){const x=bX+parseCoordinate(p[1]),y=bY+parseCoordinate(p[2]),z=bZ+parseCoordinate(p[3]);const bS=p.slice(4).join(' ');const[bN,s]=parseBlockWithStates(bS);if(!cmdStructBlocksMap[x])cmdStructBlocksMap[x]={};if(!cmdStructBlocksMap[x][y])cmdStructBlocksMap[x][y]={};cmdStructBlocksMap[x][y][z]=[bN,s]}else{eC++}}catch(e){console.error(`Err proc line ${lN+1}:'${c}'- ${e.message}`);eC++}};console.log(`CmdStruct: Processed ${cC} lines, ${eC} skip/err.`);return{blocksFound:Object.keys(cmdStructBlocksMap).length>0}}
         function convertToStructureData(){let sD={format_version:1,size:[0,0,0],structure_world_origin:[0,0,0],structure:{block_indices:[[],[]],entities:[],palette:{default:{block_palette:[],block_position_data:{}}}}};const aX=Object.keys(cmdStructBlocksMap).map(Number);if(aX.length===0)return{success:false,message:"No blocks."};let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;aX.forEach(x=>{minX=Math.min(minX,x);maxX=Math.max(maxX,x);Object.keys(cmdStructBlocksMap[x]).map(Number).forEach(y=>{minY=Math.min(minY,y);maxY=Math.max(maxY,y);Object.keys(cmdStructBlocksMap[x][y]).map(Number).forEach(z=>{minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z)})})});const w=(maxX-minX+1)||1,h=(maxY-minY+1)||1,d=(maxZ-minZ+1)||1;const tV=w*h*d;if(tV>1e6)console.warn(`CmdStruct: Large ${w}x${h}x${d} (${tV} blocks).`);const uB=new Map();const pal=[];const bIL0=[],bIL1=[];let aBC=0;for(let y=0;y<h;y++){for(let z=0;z<d;z++){for(let x=0;x<w;x++){const wX=minX+x;const wY=minY+y;const wZ=minZ+z;const bD=cmdStructBlocksMap[wX]?.[wY]?.[wZ];let pI=-1;if(bD){aBC++;const[bN,s]=bD;const sE=Object.entries(s||{}).sort((a,b)=>a[0].localeCompare(b[0]));const bK=JSON.stringify([bN,sE]);if(!uB.has(bK)){pI=pal.length;uB.set(bK,pI);pal.push({name:bN,states:s||{},version:18163713})}else{pI=uB.get(bK)}}bIL0.push(pI);bIL1.push(-1)}}};if(bIL0.length!==tV||bIL1.length!==tV){console.error(`CRIT ERR: Idx arr len mismatch! Exp ${tV}, Got L0=${bIL0.length}, L1=${bIL1.length}.`);return{success:false,message:"Internal err: Idx length mismatch."}};console.log(`CmdStruct: Found ${aBC} blocks, pal size ${pal.length}.`);sD.size=[w,h,d];sD.structure_world_origin=[minX,minY,minZ];sD.structure.block_indices=[bIL0,bIL1];sD.structure.palette.default.block_palette=pal;cmdStructGeneratedData=sD;return{success:true,data:sD,dimensions:{width:w,height:h,depth:d},origin:[minX,minY,minZ],blockCount:aBC,paletteCount:pal.length}}
        // --- End Core Processing Functions ---


        function handleCmdStructFile(file) {
            if (!file) {
                 cmdStructFileContent = '';
                 if(convertButton) convertButton.disabled = true;
                 if(downloadButton) downloadButton.disabled = true;
                 if(outputPreview) outputPreview.style.display = 'none';
                 if (previewTextElement) previewTextElement.textContent = ''; // Clear preview
                 const existingStats = previewContainer?.querySelector('#cmd-struct-stats-info'); // Clear stats
                 if (existingStats) existingStats.remove();
                return;
             }
            const reader = new FileReader();
             reader.onload = function(e) {
                 cmdStructFileContent = e.target.result;
                console.log(`CmdStruct commands file loaded (${file.name})`);
                if(convertButton) convertButton.disabled = false;
                if(downloadButton) downloadButton.disabled = true;
                 if(outputPreview) outputPreview.style.display = 'none';
                 if (previewTextElement) previewTextElement.textContent = ''; // Clear previous preview
                 const existingStats = previewContainer?.querySelector('#cmd-struct-stats-info'); // Clear stats
                 if (existingStats) existingStats.remove();
                 hideValidationMessage(validationMsgId); // Hide validation
             };
            reader.onerror = function() {
                displayValidationMessage(validationMsgId, 'Error reading file.', 'error');
                 cmdStructFileContent = '';
                if(convertButton) convertButton.disabled = true;
            };
             reader.readAsText(file);
        }

        function resetCmdStruct() {
            cmdStructFileContent = '';
            cmdStructGeneratedData = null;
            cmdStructBlocksMap = {};
            const fileInput = document.getElementById(inputId);
            if (fileInput) fileInput.value = null;
            updateFileNameDisplay(nameDisplayId, null);
             if (outputPreview) outputPreview.style.display = 'none';
            const existingStats = previewContainer?.querySelector('#cmd-struct-stats-info');
            if (existingStats) existingStats.remove();
             if (previewTextElement) previewTextElement.textContent = '';
            hideValidationMessage(validationMsgId);
             if (convertButton) setButtonState(convertButtonId, 'Convert to Structure', false);
             if (convertButton) convertButton.disabled = true;
             if (downloadButton) downloadButton.disabled = true;
             console.log("Commands to Structure tool reset.");
         }
        window.resetCommandsToStructure = resetCmdStruct; // Make globally accessible


        // Setup file handling
        setupFileHandling(dropAreaId, inputId, nameDisplayId, handleCmdStructFile);

        // Convert Button Click
         if (convertButton) {
             convertButton.addEventListener('click', () => {
                if (!cmdStructFileContent) {
                    displayValidationMessage(validationMsgId, 'Please select a file with commands.', 'error');
                    return;
                 }
                 setButtonState(convertButtonId, 'Converting...', true);
                hideValidationMessage(validationMsgId);
                 if(outputPreview) outputPreview.style.display = 'none'; // Hide previous
                 const existingStats = previewContainer?.querySelector('#cmd-struct-stats-info');
                 if (existingStats) existingStats.remove();
                 if (previewTextElement) previewTextElement.textContent = ''; // Clear previous preview
                 if(downloadButton) downloadButton.disabled = true;
                 cmdStructGeneratedData = null; // Clear previous generated data

                 setTimeout(() => {
                     try {
                         displayValidationMessage(validationMsgId, 'Processing commands...', 'info');
                         const processResult = processCmdStructCommands(cmdStructFileContent);
                         hideValidationMessage(validationMsgId); // Hide processing message

                         if (!processResult.blocksFound) {
                             displayValidationMessage(validationMsgId, 'No setblock/fill commands found in file.', 'info');
                            throw new Error("No blocks found.");
                        }

                        displayValidationMessage(validationMsgId, 'Converting to structure data...', 'info');
                        const result = convertToStructureData();
                         hideValidationMessage(validationMsgId); // Hide converting message

                         if (!result.success) {
                            displayValidationMessage(validationMsgId, result.message || 'Failed to convert structure data.', 'error');
                             throw new Error(result.message || "Conversion failed.");
                        }

                        // Display JSON Preview
                         if (previewTextElement) {
                             previewTextElement.textContent = JSON.stringify(result.data, null, 2);
                        }

                        // Display Stats
                         if (previewContainer) {
                             const statsHtml = `
                             <div id="cmd-struct-stats-info">
                                <p><strong>Dims:</strong> ${result.dimensions.width}×${result.dimensions.height}×${result.dimensions.depth}</p>
                                <p><strong>Origin:</strong> [${result.origin.join(', ')}]</p>
                                <p><strong>Volume:</strong> ${result.dimensions.width * result.dimensions.height * result.dimensions.depth}</p>
                                <p><strong>Blocks:</strong> ${result.blockCount}</p>
                                <p class="mb-0"><strong>Palette:</strong> ${result.paletteCount}</p>
                             </div>`;
                             previewTextElement?.insertAdjacentHTML('beforebegin', statsHtml);
                         }

                        if (outputPreview) outputPreview.style.display = 'block';
                         if (downloadButton) downloadButton.disabled = false;
                        displayValidationMessage(validationMsgId, 'Conversion successful.', 'success');
                         console.log("CmdStruct conversion complete.");

                    } catch (error) {
                         // Only display error if no message is already shown
                         const currentMsg = document.getElementById(validationMsgId)?.textContent || '';
                         if (!currentMsg || !document.getElementById(validationMsgId)?.style.display || document.getElementById(validationMsgId).style.display === 'none' || !currentMsg.toLowerCase().includes('error') ) {
                             displayValidationMessage(validationMsgId, `Conversion failed: ${error.message || 'Unknown error'}`, 'error');
                         }
                         console.error("CmdStruct Conversion Error:", error);
                         cmdStructGeneratedData = null;
                         if(downloadButton) downloadButton.disabled = true;
                         if (outputPreview) outputPreview.style.display = 'none'; // Hide potentially incomplete preview
                     } finally {
                         setButtonState(convertButtonId, 'Convert to Structure', false);
                    }
                 }, 50);
             });
         }

        // Download Button Click
         if (downloadButton) {
             downloadButton.addEventListener('click', () => {
                 if (!cmdStructGeneratedData) {
                    displayValidationMessage(validationMsgId, 'No structure data available.', 'error');
                    return;
                 }
                 displayValidationMessage(validationMsgId, 'Creating NBT buffer...', 'info');

                 setTimeout(() => { // Timeout for NBT buffer creation
                     try {
                         const nbtBuffer = createNbtBuffer(cmdStructGeneratedData);
                         const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
                         triggerDownload(blob, 'generated_structure.mcstructure');
                         displayValidationMessage(validationMsgId, 'Download started.', 'success');
                     } catch (e) {
                         console.error("Error creating .mcstructure NBT buffer:", e);
                         displayValidationMessage(validationMsgId, `Error creating file: ${e.message}`, 'error');
                    }
                }, 100);
             });
         }

        // Initial state
        if(convertButton) convertButton.disabled = true;
        if(downloadButton) downloadButton.disabled = true;

     })(); // End Commands to Structure IIFE


    // ========================================================================
    //  TOOL SPECIFIC LOGIC END
    // ========================================================================


    // Add reset functionality to the Brand link (optional)
    const brandLink = document.querySelector('.navbar-brand');
    if (brandLink) {
        brandLink.addEventListener('click', (e) => {
             e.preventDefault();
             const activeToolSection = document.querySelector('.tool-section.active');
             if (activeToolSection) {
                const toolId = activeToolSection.id;
                 // Convert toolId (e.g., 'nbt-to-raw') to function name ('resetNbtToRaw')
                 const functionNameSuffix = toolId.split('-').map(capitalizeFirstLetter).join('');
                 const resetFunctionName = `reset${functionNameSuffix}`;
                if (typeof window[resetFunctionName] === 'function') {
                     try {
                         window[resetFunctionName]();
                         console.log(`Called ${resetFunctionName}() via Brand link.`);
                         // Optionally show a generic reset message in the active tool's validation area
                         const validationMsgId = `${toolId}-validation-message`;
                         if(document.getElementById(validationMsgId)){
                            displayValidationMessage(validationMsgId, 'Tool input reset.', 'info');
                         }
                     } catch (err) {
                        console.error(`Error calling ${resetFunctionName}:`, err);
                     }
                 } else {
                    console.warn(`Reset function ${resetFunctionName} not found.`);
                    // Fallback: Reload the page if no specific reset found (less ideal)
                    // location.reload();
                }
             }
             // Do not navigate back to default tool, just reset the current one
         });
     }


}); // End DOMContentLoaded