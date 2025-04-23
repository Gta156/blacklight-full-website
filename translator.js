function parseJavaCommand(line) {
    line = line.trim();
    if (!line || line.startsWith('#')) {
      return null;
    }
  
    const match = line.match(/^(setblock|fill)\s+((?:~?-?\d*\s*){3})\s*(?:((?:~?-?\d*\s*){3})\s+)?([\w:]+)(?:\[([^\]]*)\])?(?:\s+(\{.*\})?)?$/);
    if (!match) {
      const simpleMatch = line.match(/^(setblock|fill)\s+((?:~?-?\d*\s*){3})\s*(?:((?:~?-?\d*\s*){3})\s+)?([\w:]+)$/);
      if (simpleMatch) {
        const [, commandType, coords1, coords2Raw, blockId] = simpleMatch;
        const coords2 = coords2Raw ? coords2Raw.trim() : null;
        return { type: commandType, coords1: coords1.trim(), coords2, blockId: blockId.trim(), states: {}, nbt: null, originalLine: line };
      }
      console.warn(`Warning: Could not parse Java command: ${line}`);
      return null;
    }
  
    const [, commandType, coords1, coords2Raw, blockId, stateString, nbtString] = match;
    const coords2 = coords2Raw ? coords2Raw.trim() : null;
  
    const states = {};
    if (stateString) {
      stateString.split(',').forEach(pair => {
        if (!pair) return;
        const parts = pair.split('=');
        if (parts.length === 2) {
          const key = parts[0].trim();
          let value = parts[1].trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          }
          states[key] = value;
        }
      });
    }
  
    const nbt = nbtString ? nbtString.trim() : null;
    return { type: commandType, coords1: coords1.trim(), coords2, blockId: blockId.trim(), states: states || {}, nbt, originalLine: line };
  }
  
  /**
   * Extracts the base block name from a full ID (e.g., "minecraft:stone" -> "stone").
   */
  function getBaseBlockName(blockId) {
    if (!blockId) return '';
    return blockId.includes(':') ? blockId.split(':')[1] : blockId;
  }
  
  /**
   * Safely parses potentially escaped JSON string values.
   */
  function parseJsonStringValue(value) {
    if (typeof value !== 'string') return value;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
        return parsed;
      }
      return value;
    } catch (e) {
      return value;
    }
  }
  
  /**
   * Converts a parsed Java command to Universal format using static mappings.
   */
  function javaToUniversal(parsedCommand) {
    if (!parsedCommand || !parsedCommand.blockId) {
      console.error('Invalid parsedCommand provided to javaToUniversal:', parsedCommand);
      return null;
    }
  
    const baseBlockName = getBaseBlockName(parsedCommand.blockId);
    const rules = window.javaToUniversalMaps[baseBlockName];
    const defaultUniversal = {
      name: `universal_minecraft:${baseBlockName}`,
      properties: parsedCommand.states || {},
      nbt: parsedCommand.nbt
    };
  
    if (!rules) {
      console.warn(`No Java->Universal mapping for ${baseBlockName}. Using default format.`);
      return defaultUniversal;
    }
  
    const universalBlock = {
      name: `universal_minecraft:${baseBlockName}`,
      properties: {},
      nbt: parsedCommand.nbt
    };
  
    try {
      for (const rule of rules) {
        if (rule.function === 'new_block') {
          universalBlock.name = rule.options;
          break;
        }
      }
  
      for (const rule of rules) {
        switch (rule.function) {
          case 'new_properties':
            Object.assign(universalBlock.properties, rule.options);
            break;
          case 'carry_properties':
            for (const propKey in rule.options) {
              const javaValue = parsedCommand.states[propKey] ?? parsedCommand.states[`"${propKey}"`];
              if (javaValue !== undefined) {
                const allowedValues = rule.options[propKey];
                if (Array.isArray(allowedValues)) {
                  const javaValueStr = String(javaValue).toLowerCase();
                  const foundMatch = allowedValues.some(allowedValue => 
                    String(parseJsonStringValue(allowedValue)).toLowerCase() === javaValueStr
                  );
                  if (foundMatch) {
                    const matchingValue = allowedValues.find(allowedValue => 
                      String(parseJsonStringValue(allowedValue)).toLowerCase() === javaValueStr
                    );
                    universalBlock.properties[propKey] = matchingValue;
                  }
                }
              }
            }
            break;
          case 'map_properties':
            for (const propKey in rule.options) {
              const javaValue = parsedCommand.states[propKey] ?? parsedCommand.states[`"${propKey}"`];
              if (javaValue !== undefined) {
                const mappingOptions = rule.options[propKey];
                const mappingForValue = mappingOptions?.[javaValue] ?? mappingOptions?.[`"${javaValue}"`];
                if (mappingForValue && Array.isArray(mappingForValue)) {
                  for (const nestedRule of mappingForValue) {
                    if (nestedRule.function === 'new_properties') {
                      Object.assign(universalBlock.properties, nestedRule.options);
                    }
                  }
                }
              }
            }
            break;
        }
      }
    } catch (error) {
      console.error(`Error applying Java->Universal rules for ${baseBlockName}:`, error);
      return defaultUniversal;
    }
  
    return universalBlock;
  }
  
  /**
   * Converts a Universal block to Bedrock format using static mappings.
   */
  function universalToBedrock(originalCommand, universalBlock) {
    if (!universalBlock || !universalBlock.name || !originalCommand || !originalCommand.type) {
      console.error('Invalid input to universalToBedrock:', { originalCommand, universalBlock });
      return null;
    }
  
    const baseUniversalName = getBaseBlockName(universalBlock.name);
    const rules = window.universalToBedrockMaps[baseUniversalName];
    const bedrockRepresentation = {
      type: originalCommand.type,
      coords1: originalCommand.coords1,
      coords2: originalCommand.coords2,
      name: `minecraft:${baseUniversalName}`,
      states: {},
      nbt: universalBlock.nbt
    };
  
    if (!rules) {
      console.warn(`No Universal->Bedrock mapping for ${baseUniversalName}. Using default format.`);
      for (const key in universalBlock.properties) {
        bedrockRepresentation.states[key] = parseJsonStringValue(universalBlock.properties[key]);
      }
      return bedrockRepresentation;
    }
  
    try {
      function applyNestedRules(nestedRules, currentBedrockRep, universalProps) {
        if (!Array.isArray(nestedRules)) return;
        for (const rule of nestedRules) {
          switch (rule.function) {
            case 'new_block':
              currentBedrockRep.name = rule.options;
              break;
            case 'new_properties':
              for (const [key, value] of Object.entries(rule.options)) {
                currentBedrockRep.states[key] = parseJsonStringValue(value);
              }
              break;
            case 'map_properties':
              for (const propKey in rule.options) {
                const universalValue = universalProps[propKey];
                if (universalValue !== undefined) {
                  const cleanValue = parseJsonStringValue(universalValue);
                  let mappingForValue = rule.options[propKey]?.[String(cleanValue)];
                  if (!mappingForValue && typeof cleanValue === 'string') {
                    mappingForValue = rule.options[propKey]?.[`"${cleanValue}"`];
                  }
                  if (mappingForValue && Array.isArray(mappingForValue)) {
                    applyNestedRules(mappingForValue, currentBedrockRep, universalProps);
                  }
                }
              }
              break;
            case 'carry_properties':
              for (const propKey in rule.options) {
                const universalValue = universalProps[propKey];
                if (universalValue !== undefined) {
                  const allowedValues = rule.options[propKey];
                  if (Array.isArray(allowedValues)) {
                    const parsedValue = parseJsonStringValue(universalValue);
                    const valueStr = String(parsedValue).toLowerCase();
                    const isAllowed = allowedValues.some(allowed => 
                      String(parseJsonStringValue(allowed)).toLowerCase() === valueStr
                    );
                    if (isAllowed) {
                      currentBedrockRep.states[propKey] = parsedValue;
                    }
                  }
                }
              }
              break;
          }
        }
      }
  
      const newBlockRule = rules.find(rule => rule.function === 'new_block');
      if (newBlockRule) {
        bedrockRepresentation.name = newBlockRule.options;
      }
  
      applyNestedRules(rules.filter(rule => rule.function !== 'new_block'), 
        bedrockRepresentation, universalBlock.properties);
    } catch (error) {
      console.error(`Error applying Universal->Bedrock rules for ${baseUniversalName}:`, error);
      return bedrockRepresentation;
    }
  
    return bedrockRepresentation;
  }
  
  /**
   * Formats a Bedrock representation into a command string.
   */
  function formatBedrockCommand(bedrockRep) {
    if (!bedrockRep || !bedrockRep.type || !bedrockRep.coords1 || !bedrockRep.name) {
      console.error('Invalid Bedrock representation:', bedrockRep);
      return null;
    }
  
    let commandStr = `${bedrockRep.type} ${bedrockRep.coords1}`;
    if (bedrockRep.type === 'fill' && bedrockRep.coords2) {
      commandStr += ` ${bedrockRep.coords2}`;
    }
    commandStr += ` ${bedrockRep.name}`;
  
    const stateKeys = Object.keys(bedrockRep.states || {});
    if (stateKeys.length > 0) {
      const stateParts = stateKeys.map(key => {
        let value = bedrockRep.states[key];
        let formattedValue;
  
        if (typeof value === 'boolean') {
          formattedValue = value.toString();
        } else if (typeof value === 'number') {
          formattedValue = Number.isInteger(value) ? value : `"${value}"`;
        } else {
          const intVal = parseInt(value, 10);
          formattedValue = (!isNaN(intVal) && String(intVal) === value) ? intVal : `"${value}"`;
        }
  
        return `"${key}"=${formattedValue}`;
      });
      commandStr += `[${stateParts.join(',')}]`;
    }
  
    if (bedrockRep.nbt) {
      console.warn(`NBT data ignored for Bedrock: ${bedrockRep.nbt}`);
    }
  
    return commandStr;
  }
  
  /**
   * Translates an array of Java commands to Bedrock commands.
   */
  async function translateCommands(commands) {
    const translatedCommands = [];
    const errors = [];
  
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (!command || typeof command !== 'string' || !command.trim()) {
        continue;
      }
  
      try {
        const parsedCommand = parseJavaCommand(command);
        if (!parsedCommand) {
          errors.push(`Command ${i + 1}: Invalid Java command format: ${command}`);
          continue;
        }
  
        const universalBlock = javaToUniversal(parsedCommand);
        if (!universalBlock) {
          errors.push(`Command ${i + 1}: Failed Universal mapping for ${parsedCommand.blockId}`);
          continue;
        }
  
        const bedrockBlock = universalToBedrock(parsedCommand, universalBlock);
        if (!bedrockBlock) {
          errors.push(`Command ${i + 1}: Failed Bedrock conversion for ${parsedCommand.blockId}`);
          continue;
        }
  
        const finalCommand = formatBedrockCommand(bedrockBlock);
        if (!finalCommand) {
          errors.push(`Command ${i + 1}: Failed formatting for ${parsedCommand.blockId}`);
          continue;
        }
  
        translatedCommands.push(finalCommand);
      } catch (error) {
        console.error(`Error translating command ${i + 1} (${command}):`, error);
        errors.push(`Command ${i + 1}: Translation error - ${error.message}`);
      }
    }
  
    return { translatedCommands, errors };
  }
  
  /**
   * Displays a validation message with a specified type (success, error, info).
   */
  function showValidationMessage(message, type) {
    const validationMessage = document.getElementById('validationMessage');
    validationMessage.style.display = 'block';
    validationMessage.className = `validation-message alert alert-${type}`;
    validationMessage.textContent = message;
  }
  
  // DOM event listeners
  document.addEventListener('DOMContentLoaded', () => {
    const javaCommandsTextarea = document.getElementById('javaCommands');
    const translateButton = document.getElementById('translateButton');
    const previewText = document.getElementById('previewText');
    const outputPreview = document.getElementById('outputPreview');
    const downloadButton = document.getElementById('downloadButton');
  
    translateButton.addEventListener('click', async () => {
      const commands = javaCommandsTextarea.value.split(/\r?\n/).filter(cmd => cmd.trim());
      if (!commands.length) {
        showValidationMessage('Please enter Java commands to translate.', 'error');
        return;
      }
  
      translateButton.disabled = true;
      translateButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Translating...';
      showValidationMessage('Translating commands...', 'info');
  
      try {
        const { translatedCommands, errors } = await translateCommands(commands);
  
        if (translatedCommands.length) {
          previewText.value = translatedCommands.join('\n');
          outputPreview.style.display = 'block';
          downloadButton.disabled = false;
          showValidationMessage('Translation completed successfully!', 'success');
        } else {
          showValidationMessage('No valid commands translated. Check your input.', 'error');
          outputPreview.style.display = 'none';
        }
  
        if (errors.length) {
          console.warn('Translation errors:', errors);
          showValidationMessage(`Translation completed with errors: ${errors.join('; ')}`, 'warning');
        }
  
        downloadButton.onclick = () => {
          const blob = new Blob([translatedCommands.join('\n')], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'bedrock_commands.txt';
          a.click();
          URL.revokeObjectURL(url);
        };
      } catch (error) {
        console.error('Translation error:', error);
        showValidationMessage('An error occurred during translation.', 'error');
        outputPreview.style.display = 'none';
      } finally {
        translateButton.disabled = false;
        translateButton.innerHTML = '<i class="fas fa-exchange-alt me-2"></i>Translate Commands';
      }
    });
  });
  
  // Simulated test cases (run in console for validation)
  (async () => {
    const testCommands = [
      'setblock ~ ~ ~ minecraft:stone',
      'fill ~1 ~1 ~1 ~2 ~2 ~2 minecraft:oak_planks',
      'setblock ~ ~ ~ minecraft:oak_door[facing=north,open=true]'
    ];
    console.log('Running simulated tests...');
    const { translatedCommands, errors } = await translateCommands(testCommands);
    console.log('Test Results:', { translatedCommands, errors });
  })();