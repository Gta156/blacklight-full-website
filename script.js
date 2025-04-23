// --- START OF FILE script.js ---

// ========================================================================== //
//                              NBT Helper Section                            //
// ========================================================================== //

// NBT Tag Type Constants (Used by Commands to Structure & Schem to Commands)
const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

// --- NBT Writing Helpers (from commands_to_struture.js) ---
// Note: These rely on a global 'currentOffset' managed during buffer creation.
let nbtWriterCurrentOffset = 0; // Specific offset for the writer

function writeByte(buffer, offset, value) {
    buffer.setInt8(offset, value);
    return offset + 1;
}

function writeUnsignedShort(buffer, offset, value) {
    buffer.setUint16(offset, value, true); // true for little-endian
    return offset + 2;
}

function writeInt(buffer, offset, value) {
    buffer.setInt32(offset, value, true); // true for little-endian
    return offset + 4;
}

function writeStringPayload(buffer, offset, text) {
    if (text === null || text === undefined) text = "";
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(text);
    offset = writeUnsignedShort(buffer, offset, utf8Bytes.length);
    for (let i = 0; i < utf8Bytes.length; i++) {
        buffer.setUint8(offset + i, utf8Bytes[i]);
    }
    return offset + utf8Bytes.length;
}

function getNbtType(value) {
    if (typeof value === "boolean") return TAG_BYTE;
    if (typeof value === "number") {
        if (Number.isInteger(value)) return TAG_INT;
        return TAG_FLOAT; // Using Float for non-integers
    }
    if (typeof value === "string") return TAG_STRING;
    if (Array.isArray(value)) return TAG_LIST;
    if (typeof value === "object" && value !== null) return TAG_COMPOUND;
    throw new TypeError(`Unsupported JavaScript type for NBT conversion: ${typeof value}`);
}

function writeTagNonRecursive(buffer, name, value) {
    try {
        // Write tag type
        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, getNbtType(value));

        // Write name if provided
        if (name !== null && name !== undefined) {
            nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, name);
        }

        // Write payload based on type
        if (typeof value === "boolean") {
            nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, value ? 1 : 0);
        } else if (Number.isInteger(value)) {
            nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, value);
        } else if (typeof value === "number") {
            const floatArray = new Float32Array(1);
            floatArray[0] = value;
            const intValue = new Int32Array(floatArray.buffer)[0];
            nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, intValue);
        } else if (typeof value === "string") {
            nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, value);
        } else if (Array.isArray(value)) {
            writeListNonRecursive(buffer, value);
        } else if (typeof value === "object" && value !== null) {
            const keys = Object.keys(value);
            for (const key of keys) {
                writeTagNonRecursive(buffer, key, value[key]);
            }
            nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
        }
    } catch (e) {
        console.error(`Error writing tag ${name}:`, e);
        throw e;
    }
}

function writeListNonRecursive(buffer, dataList) {
    try {
        if (!dataList.length) {
            nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
            nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, 0);
            return;
        }

        const firstItem = dataList[0];
        let elementType = getNbtType(firstItem);

        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, elementType);
        nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, dataList.length);

        for (let i = 0; i < dataList.length; i++) {
            const item = dataList[i];

            if (typeof item === "boolean") {
                nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, item ? 1 : 0);
            } else if (Number.isInteger(item)) {
                nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, item);
            } else if (typeof item === "number") {
                const floatArray = new Float32Array(1);
                floatArray[0] = item;
                const intValue = new Int32Array(floatArray.buffer)[0];
                nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, intValue);
            } else if (typeof item === "string") {
                nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, item);
            } else if (Array.isArray(item)) {
                writeListNonRecursive(buffer, item);
            } else if (typeof item === "object" && item !== null) {
                const objKeys = Object.keys(item);
                for (const key of objKeys) {
                    writeTagNonRecursive(buffer, key, item[key]);
                }
                nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
            } else {
                console.warn(`Unsupported item type in list at index ${i}:`, item);
            }
        }
    } catch (e) {
        console.error("Error writing list:", e);
        throw e;
    }
}

function estimateNbtBufferSize(data) {
    const jsonSize = JSON.stringify(data).length;
    return Math.max(jsonSize * 4, 10 * 1024 * 1024); // At least 10MB or 4x JSON size
}

function createNbtBuffer(data) {
    try {
        const estimatedSize = estimateNbtBufferSize(data);
        const arrayBuffer = new ArrayBuffer(estimatedSize);
        const buffer = new DataView(arrayBuffer);
        nbtWriterCurrentOffset = 0; // Reset writer offset

        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_COMPOUND);
        nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, ""); // Empty name for root

        const rootKeys = Object.keys(data);
        for (const key of rootKeys) {
            writeTagNonRecursive(buffer, key, data[key]);
        }

        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END); // Final TAG_End for root

        return arrayBuffer.slice(0, nbtWriterCurrentOffset); // Return used portion
    } catch (e) {
        console.error("Error during NBT buffer creation:", e);
        throw e;
    }
}
// --- End NBT Writing Helpers ---

// --- NBT Reading Helpers (from schem_to_commands_script.js) ---
class BinaryReader {
    constructor(buffer) {
        this.view = new DataView(buffer);
        this.position = 0;
    }

    ensureReadableBytes(count) {
        if (this.position + count > this.view.byteLength) {
            throw new Error(`Not enough bytes remaining. Needed ${count}, have ${this.view.byteLength - this.position} at position ${this.position}`);
        }
    }

    readByte() {
        this.ensureReadableBytes(1);
        const value = this.view.getInt8(this.position);
        this.position += 1;
        return value;
    }

    readShort() {
        this.ensureReadableBytes(2);
        const value = this.view.getInt16(this.position, false); // big-endian
        this.position += 2;
        return value;
    }

    readInt() {
        this.ensureReadableBytes(4);
        const value = this.view.getInt32(this.position, false);
        this.position += 4;
        return value;
    }

    readLong() {
        this.ensureReadableBytes(8);
        const high = this.view.getInt32(this.position, false);
        const low = this.view.getInt32(this.position + 4, false);
        this.position += 8;
        return (BigInt(high) << 32n) | (BigInt(low) & 0xFFFFFFFFn);
    }

    readFloat() {
        this.ensureReadableBytes(4);
        const value = this.view.getFloat32(this.position, false);
        this.position += 4;
        return value;
    }

    readDouble() {
        this.ensureReadableBytes(8);
        const value = this.view.getFloat64(this.position, false);
        this.position += 8;
        return value;
    }

    readBytes(length) {
        this.ensureReadableBytes(length);
        const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.position, length);
        this.position += length;
        return bytes;
    }

    readString() {
        const length = this.readShort();
        if (length < 0) throw new Error(`Invalid string length: ${length}`);
        if (length === 0) return "";
        return new TextDecoder("utf-8").decode(this.readBytes(length));
    }
}

function readNbtTagPayload(reader, type) {
    switch (type) {
        case TAG_END: return null;
        case TAG_BYTE: return reader.readByte();
        case TAG_SHORT: return reader.readShort();
        case TAG_INT: return reader.readInt();
        case TAG_LONG: return reader.readLong();
        case TAG_FLOAT: return reader.readFloat();
        case TAG_DOUBLE: return reader.readDouble();
        case TAG_BYTE_ARRAY: {
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_BYTE_ARRAY length: ${length}`);
            return reader.readBytes(length);
        }
        case TAG_STRING: return reader.readString();
        case TAG_LIST: {
            const listType = reader.readByte();
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_LIST length: ${length}`);
            const list = [];
            for (let i = 0; i < length; i++) {
                list.push(readNbtTagPayload(reader, listType));
            }
            return { listType: listType, value: list };
        }
        case TAG_COMPOUND: {
            const compound = {};
            while (true) {
                const tag = readNamedNbtTag(reader);
                if (tag === null || tag.type === TAG_END) break;
                compound[tag.name] = tag.payload;
            }
            return compound;
        }
        case TAG_INT_ARRAY: {
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_INT_ARRAY length: ${length}`);
            const array = [];
            for (let i = 0; i < length; i++) {
                array.push(reader.readInt());
            }
            return array;
        }
        case TAG_LONG_ARRAY: {
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_LONG_ARRAY length: ${length}`);
            const array = [];
            for (let i = 0; i < length; i++) {
                array.push(reader.readLong());
            }
            return array;
        }
        default:
            throw new Error(`Unsupported NBT tag type: ${type} at position ${reader.position - 1}`);
    }
}

function readNamedNbtTag(reader) {
    const type = reader.readByte();
    if (type === TAG_END) {
        return { type: TAG_END, name: "", payload: null };
    }
    const name = reader.readString();
    const payload = readNbtTagPayload(reader, type);
    return { type, name, payload };
}

function loadSchematicNBT(buffer) {
    const reader = new BinaryReader(buffer);
    const rootTag = readNamedNbtTag(reader);
    if (!rootTag || rootTag.type !== TAG_COMPOUND) {
        throw new Error(`Root tag must be TAG_COMPOUND, found type ${rootTag ? rootTag.type : 'null'}`);
    }
    return rootTag.payload;
}
// --- End NBT Reading Helpers ---

// ========================================================================== //
//                     Raw to NBT Converter Logic                             //
//========================================================================== //

// --- Start of Replacement Block (Exact structure from raw_to_nbt.js) ---
// Global state for Raw to NBT tool (Re-declared here for clarity, but uses the same top-level variable)
let rawToNbtFileContent = ''; // Using the shared global variable

// Helper function to get UTF-8 byte length
function getUtf8ByteLength(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str).length;
}

// Escapes double quotes in commands
function escapeQuotes(command) {
    return command.replace(/"/g, '\\\\\\"');
}

// Processes file content into an array of commands
function getUsefulCommands(content) {
    const commands = content.split('\n').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    return commands.map(escapeQuotes);
}

// Separates commands into normal and equals types
function separateCommands(commands) {
    const normalCommands = [];
    const equalsCommands = [];
    commands.forEach(cmd => {
        if (cmd.includes('=')) {
            equalsCommands.push(cmd);
        } else {
            normalCommands.push(cmd);
        }
    });
    return { normalCommands, equalsCommands };
}

// NBT block opener
function getBlockOpener(nbtName) {
    // Using Blacklight branding as established previously
    return `{Block:{name:"minecraft:moving_block",states:{},version:17959425},Count:1b,Damage:0s,Name:"minecraft:moving_block",WasPickedUp:0b,tag:{display:{Lore:["Â§lÂ§bBuild By: Â§dBlacklightî„€","Â§3NBT Tool By: Â§aBrutus314 ","Â§aand Clawsky123î„ ","Â§9Conversion Tool By: ","Â§eExgioan!!î„‚","Â§fSpecial Thanks To:","Â§6Chronicles765!!    î„ƒ","Â§4Warning: Â§cDont Hold Too","Â§cMany Or You Will Lag!!Â§âˆ†"],Name:"Â§lÂ§dBlacklight NBT: Â§gÂ§l${nbtName}"},ench:[{id:28s,lvl:1s}],movingBlock:{name:"minecraft:sea_lantern",states:{},version:17879555},movingEntity:{Occupants:[`;
}

// NBT block closer
function getBlockCloser() {
    return '],id:"Beehive"}}}';
}

// Normal NPC opener
function getNpcOpener(section, nbtName) {
    return `{ActorIdentifier:"minecraft:npc<>",SaveData:{Actions:"[{"button_name" : "Build Part: ${section}","data" : [`;
}

// Normal NPC closer
function getNpcCloser(section, nbtName) {
     // Using Blacklight branding as established previously
    return `],"mode" : 0,"text" : "","type" : 1}]",CustomName:"Â§lÂ§dBlacklight NBT: ${nbtName}",CustomNameVisible:1b,InterativeText:"Â§cBuild By: Â§dBlacklight!!î„€\nBuild Part: ${section}\nÂ§cConversion Tool By: Â§dExgioan!!\nÂ§cSpecial Thanks To: Â§dChronicles765!!! î„ƒ\nÂ§6Thanks For Trying My ${nbtName} Build!!!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBlacklight NBT: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`;
}

// Equals NPC opener
function getEqualsNpcOpener(section, nbtName) {
    return `{ActorIdentifier:"minecraft:npc<>",SaveData:{"Actions":"[{\\"button_name\\" : \\"Build Part: ${section}\\",       \\"data\\" : [`;
}

// Equals NPC closer
function getEqualsNpcCloser(section, nbtName) {
    // Using Blacklight branding as established previously
    return `],       \\"mode\\" : 0,       \\"text\\" : \\"\\",       \\"type\\" : 1}]",CustomName:"Â§lÂ§dBlacklight NBT: ${nbtName}",CustomNameVisible:1b,InteractiveText:"§cBuild By:"Â§cBuild By: Â§dBlacklight!!î„€\nBuild Part: ${section}\nÂ§cConversion Tool By: Â§dExgioan!!\nÂ§cSpecial Thanks To: Â§dChronicles765!!!\n§6Thanks For Trying My ${nbtName} Build!!!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBlacklight NBT: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`;
}

// Joins normal commands
function commandJoinerNormal(commands) {
    return commands.map(cmd => `{"cmd_line":"${cmd}","cmd_ver":12}`).join(',');
}

// Joins equals commands with specific formatting
function commandJoinerEquals(commands) {
    return commands.map(cmd => `          {             \\"cmd_line\\":\\"${cmd}\\",             \\"cmd_ver\\" : 42          }`).join(',');
}

// Processes commands into NPC blocks with byte limit
function processNpcCommandsByBytes(commands, maxBytes, nbtName, startSection, joiner, isEquals) {
    const npcDataList = [];
    let currentCommands = [];
    let currentSection = startSection;
    const openerFunc = isEquals ? getEqualsNpcOpener : getNpcOpener;
    const closerFunc = isEquals ? getEqualsNpcCloser : getNpcCloser;

    for (const cmd of commands) {
        const candidateCommands = [...currentCommands, cmd];
        const candidateJoined = joiner(candidateCommands);
        const openerText = openerFunc(currentSection, nbtName);
        const closerText = closerFunc(currentSection, nbtName);
        const candidateBlock = openerText + candidateJoined + closerText;
        const candidateByteLength = getUtf8ByteLength(candidateBlock);

        if (candidateByteLength <= maxBytes) {
            currentCommands.push(cmd);
        } else {
             // Finalize current block if it has commands
            if (currentCommands.length > 0) {
                const npcCommandList = [...currentCommands];
                if (!isEquals) {
                    npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 NPCCOMMANDS');
                } else {
                    npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 EQUALSCOMMANDS');
                }
                // Dialogue open command added conditionally later
                npcCommandList.push('/kill @s');
                if (!isEquals) {
                    npcCommandList.push('/tickingarea remove NPCCOMMANDS');
                } else {
                    npcCommandList.push('/tickingarea remove EQUALSCOMMANDS');
                }
                const joinedCommands = joiner(npcCommandList);
                const npcBlock = openerFunc(currentSection, nbtName) + joinedCommands + closerFunc(currentSection, nbtName);
                npcDataList.push({ block: npcBlock, section: currentSection });
             }
            // Start new block
            currentSection += 1;
            currentCommands = [cmd];
        }
    }

    // Finalize last block
    if (currentCommands.length > 0) {
        const npcCommandList = [...currentCommands];
        if (!isEquals) {
            npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 NPCCOMMANDS');
        } else {
            npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 EQUALSCOMMANDS');
        }
        // No dialogue open for the last block
        npcCommandList.push('/kill @s');
        if (!isEquals) {
            npcCommandList.push('/tickingarea remove NPCCOMMANDS');
        } else {
            npcCommandList.push('/tickingarea remove EQUALSCOMMANDS');
        }
        const joinedCommands = joiner(npcCommandList);
        const npcBlock = openerFunc(currentSection, nbtName) + joinedCommands + closerFunc(currentSection, nbtName);
        npcDataList.push({ block: npcBlock, section: currentSection });
    }

     // Add dialogue open commands by modifying previous blocks (Post-processing step)
     for (let i = 0; i < npcDataList.length - 1; i++) {
        const currentBlockData = npcDataList[i];
        const nextSection = npcDataList[i + 1].section; // Get the actual next section number
        const dialogueOpenCmd = `/dialogue open @e[tag=${nbtName}${nextSection},type=NPC] @initiator`;
        // Must escape the command *before* formatting it
        const escapedDialogueCmd = escapeQuotes(dialogueOpenCmd);
        const dialogueOpenCmdFormatted = isEquals
            ? `          {             \\"cmd_line\\":\\"${escapedDialogueCmd}\\",             \\"cmd_ver\\" : 42          }`
            : `{"cmd_line":"${escapedDialogueCmd}","cmd_ver":12}`;

         // Try to insert before the kill command
         const killCmdJsonNormal = `{"cmd_line":"${escapeQuotes('/kill @s')}","cmd_ver":12}`;
         const killCmdJsonEquals = `          {             \\"cmd_line\\":\\"${escapeQuotes('/kill @s')}\\",             \\"cmd_ver\\" : 42          }`;
         const killCmdJson = isEquals ? killCmdJsonEquals : killCmdJsonNormal;

         const killIndex = currentBlockData.block.lastIndexOf(killCmdJson);

         if (killIndex !== -1) {
             // Find the comma before the kill command to insert correctly
             const commaIndex = currentBlockData.block.lastIndexOf(',', killIndex);
             if (commaIndex !== -1) {
                  npcDataList[i].block = currentBlockData.block.substring(0, commaIndex + 1) + dialogueOpenCmdFormatted + currentBlockData.block.substring(commaIndex);
             } else {
                  // Should not happen if kill command exists, but handle defensively
                  console.warn(`RawToNBT: Could not find comma before kill command in section ${currentBlockData.section}. Appending dialogue command.`);
                   const closerStr = closerFunc(currentBlockData.section, nbtName);
                   const insertionPoint = currentBlockData.block.lastIndexOf(closerStr);
                   if (insertionPoint !== -1) {
                        const commandsEnd = currentBlockData.block.lastIndexOf(']', insertionPoint);
                         if (commandsEnd !== -1) {
                            npcDataList[i].block = currentBlockData.block.substring(0, commandsEnd) + (currentCommands.length > 0 ? ',' : '') + dialogueOpenCmdFormatted + currentBlockData.block.substring(commandsEnd);
                         }
                   }
             }
         } else {
             console.warn(`RawToNBT: Could not find kill command for inserting dialogue command in section ${currentBlockData.section}. Appending.`);
             // Append before the closer if kill command wasn't found (less ideal)
              const closerStr = closerFunc(currentBlockData.section, nbtName);
              const insertionPoint = currentBlockData.block.lastIndexOf(closerStr);
              if (insertionPoint !== -1) {
                 const commandsEnd = currentBlockData.block.lastIndexOf(']', insertionPoint);
                  if (commandsEnd !== -1) {
                     npcDataList[i].block = currentBlockData.block.substring(0, commandsEnd) + (currentCommands.length > 0 ? ',' : '') + dialogueOpenCmdFormatted + currentBlockData.block.substring(commandsEnd);
                  }
              }
         }
    }

    return { npcData: npcDataList.map(item => item.block).join(','), count: npcDataList.length };
}

// --- End of Replacement Block ---
// ========================================================================== //
//                 Commands to Structure Converter Logic                      //
// ========================================================================== //

// Global state for Commands to Structure tool
let cmdStructFileContent = '';
let commandsToStructureData = { // Holds the generated structure data
    format_version: 1,
    size: [0, 0, 0],
    structure: {
        block_indices: [[], []],
        entities: [],
        palette: {
            default: {
                block_palette: [],
                block_position_data: {}
            }
        }
    },
    structure_world_origin: [0, 0, 0]
};
let cmdStructBlocksMap = {}; // Stores parsed blocks {x: {y: {z: [name, states]}}}


function parseCmdStructCoordinate(coordStr) {
    coordStr = coordStr.trim();
    if (coordStr.startsWith('~')) {
        const offset = coordStr.substring(1);
        return offset ? parseInt(offset) : 0;
    } else {
        return parseInt(coordStr);
    }
}

function parseCmdStructBlockWithStates(blockStr) {
    blockStr = blockStr.trim();
    const match = blockStr.match(/^([\w:]+)(?:\[(.*)\])?/);
    if (!match) {
        console.warn(`CmdStruct: Could not parse block string: ${blockStr}`);
        return [blockStr, {}];
    }

    const blockName = match[1];
    const statesStr = match[2] || '';
    const states = {};

    if (statesStr) {
        const statePairs = statesStr.match(/([\w:"\-]+)\s*=\s*([\w"\-.+]+)/g) || [];
        for (const pair of statePairs) {
            const [key, value] = pair.split('=').map(s => s.trim());
            const cleanKey = key.replace(/"/g, '');
            const valueLower = value.toLowerCase();

            if (valueLower === 'true') {
                states[cleanKey] = true;
            } else if (valueLower === 'false') {
                states[cleanKey] = false;
            } else {
                const numValue = parseInt(value);
                states[cleanKey] = isNaN(numValue) ? value.replace(/"/g, '') : numValue;
            }
        }
    }
    return [blockName, states];
}


function processCmdStructCommands(commandsText) {
    cmdStructBlocksMap = {}; // Reset
    let commandCount = 0;
    let errorCount = 0;
    const baseX = 0, baseY = 0, baseZ = 0;
    const commands = commandsText.split('\n');

    for (let lineNum = 0; lineNum < commands.length; lineNum++) {
        const cmd = commands[lineNum].trim();
        if (!cmd || cmd.startsWith('#')) continue;

        const parts = cmd.split(/\s+/);
        if (parts.length === 0) continue;

        const commandName = parts[0].toLowerCase();
        commandCount++;

        try {
            if (commandName === 'fill' && parts.length >= 8) {
                const x1 = baseX + parseCmdStructCoordinate(parts[1]);
                const y1 = baseY + parseCmdStructCoordinate(parts[2]);
                const z1 = baseZ + parseCmdStructCoordinate(parts[3]);
                const x2 = baseX + parseCmdStructCoordinate(parts[4]);
                const y2 = baseY + parseCmdStructCoordinate(parts[5]);
                const z2 = baseZ + parseCmdStructCoordinate(parts[6]);
                const blockStr = parts.slice(7).join(' ');
                const [blockName, states] = parseCmdStructBlockWithStates(blockStr);
                const startX = Math.min(x1, x2); const endX = Math.max(x1, x2);
                const startY = Math.min(y1, y2); const endY = Math.max(y1, y2);
                const startZ = Math.min(z1, z2); const endZ = Math.max(z1, z2);

                for (let x = startX; x <= endX; x++) {
                    if (!cmdStructBlocksMap[x]) cmdStructBlocksMap[x] = {};
                    for (let y = startY; y <= endY; y++) {
                        if (!cmdStructBlocksMap[x][y]) cmdStructBlocksMap[x][y] = {};
                        for (let z = startZ; z <= endZ; z++) {
                            cmdStructBlocksMap[x][y][z] = [blockName, { ...states }];
                        }
                    }
                }
            } else if (commandName === 'setblock' && parts.length >= 5) {
                const x = baseX + parseCmdStructCoordinate(parts[1]);
                const y = baseY + parseCmdStructCoordinate(parts[2]);
                const z = baseZ + parseCmdStructCoordinate(parts[3]);
                const blockStr = parts.slice(4).join(' ');
                const [blockName, states] = parseCmdStructBlockWithStates(blockStr);

                if (!cmdStructBlocksMap[x]) cmdStructBlocksMap[x] = {};
                if (!cmdStructBlocksMap[x][y]) cmdStructBlocksMap[x][y] = {};
                cmdStructBlocksMap[x][y][z] = [blockName, states];
            } else {
                console.warn(`CmdStruct: Skipping unrecognized command line ${lineNum + 1}: ${cmd}`);
                errorCount++;
            }
        } catch (e) {
            console.error(`CmdStruct: Error processing line ${lineNum + 1}: '${cmd}' - ${e.message}`);
            errorCount++;
        }
    }

    console.log(`CmdStruct: Processed ${commandCount} commands with ${errorCount} errors/warnings.`);
    if (Object.keys(cmdStructBlocksMap).length === 0) {
        console.warn("CmdStruct: Warning: No blocks parsed.");
    }
    return {
        commandCount,
        errorCount,
        blocksFound: Object.keys(cmdStructBlocksMap).length > 0
    };
}

function convertToStructureData() {
    try {
        console.log("CmdStruct: Starting conversion to structure data...");
        // Reset structure data object
        commandsToStructureData = {
            format_version: 1, size: [0, 0, 0], structure: { block_indices: [[], []], entities: [], palette: { default: { block_palette: [], block_position_data: {} } } }, structure_world_origin: [0, 0, 0]
        };

        const allX = Object.keys(cmdStructBlocksMap).map(Number);
        if (allX.length === 0) {
            return { success: false, message: "No blocks found. Cannot generate structure." };
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

        for (const xStr in cmdStructBlocksMap) {
            const x = Number(xStr); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            for (const yStr in cmdStructBlocksMap[xStr]) {
                const y = Number(yStr); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                for (const zStr in cmdStructBlocksMap[xStr][yStr]) {
                    const z = Number(zStr); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
                }
            }
        }

        const width = (maxX - minX + 1) || 1;
        const height = (maxY - minY + 1) || 1;
        const depth = (maxZ - minZ + 1) || 1;
        const totalVolume = width * height * depth;

        if (totalVolume > 10000000) {
            console.warn(`CmdStruct: WARNING: Very large structure with ${totalVolume} potential blocks (${width}x${height}x${depth})`);
        }
        console.log(`CmdStruct: Bounds: X(${minX}-${maxX}), Y(${minY}-${maxY}), Z(${minZ}-${maxZ}). Size: ${width}x${height}x${depth}`);

        const uniqueBlocks = new Map();
        const palette = [];
        let blockCount = 0;
        const blockIndicesLayer0 = [];
        const airIndex = -1;

        for (let x = minX; x <= maxX; x++) {
            const xBlocks = cmdStructBlocksMap[x];
            if (!xBlocks) {
                for (let y = minY; y <= maxY; y++) { for (let z = minZ; z <= maxZ; z++) { blockIndicesLayer0.push(airIndex); } } continue;
            }
            for (let y = minY; y <= maxY; y++) {
                const yBlocks = xBlocks[y];
                if (!yBlocks) {
                    for (let z = minZ; z <= maxZ; z++) { blockIndicesLayer0.push(airIndex); } continue;
                }
                for (let z = minZ; z <= maxZ; z++) {
                    const blockData = yBlocks[z];
                    if (blockData) {
                        blockCount++;
                        const [blockName, states] = blockData;
                        let blockIdStr = blockName;
                        if (!blockName.includes(':')) { blockIdStr = `minecraft:${blockName}`; }
                        const stateEntries = Object.entries(states || {}).sort((a, b) => a[0].localeCompare(b[0]));
                        const blockKey = JSON.stringify([blockIdStr, stateEntries]);

                        let paletteIndex;
                        if (!uniqueBlocks.has(blockKey)) {
                            paletteIndex = palette.length;
                            uniqueBlocks.set(blockKey, paletteIndex);
                            palette.push({ name: blockIdStr, states: states || {}, version: 18163713 }); // Using a recent version number
                        } else {
                            paletteIndex = uniqueBlocks.get(blockKey);
                        }
                        blockIndicesLayer0.push(paletteIndex);
                    } else {
                        blockIndicesLayer0.push(airIndex);
                    }
                }
            }
        }

        console.log(`CmdStruct: Found ${blockCount} blocks, created palette with ${palette.length} unique entries.`);
        if (blockIndicesLayer0.length !== totalVolume) {
            console.error(`CmdStruct: CRITICAL INDEXING ERROR: Final block_indices length (${blockIndicesLayer0.length}) does not match calculated volume (${totalVolume}). This structure WILL NOT load correctly.`);
        }

        const blockIndicesLayer1 = new Array(totalVolume).fill(-1);

        commandsToStructureData.size = [width, height, depth];
        commandsToStructureData.structure_world_origin = [minX, minY, minZ];
        commandsToStructureData.structure.block_indices = [blockIndicesLayer0, blockIndicesLayer1];
        commandsToStructureData.structure.palette.default.block_palette = palette;
        commandsToStructureData.structure.entities = [];
        commandsToStructureData.structure.palette.default.block_position_data = {};

        return {
            success: true, data: commandsToStructureData, dimensions: { width, height, depth },
            origin: [minX, minY, minZ], blockCount, paletteCount: palette.length
        };

    } catch (e) {
        console.error("CmdStruct: Critical error during conversion:", e);
        return { success: false, message: `Error during conversion: ${e.message}` };
    }
}

// ========================================================================== //
//                    NBT to Raw Command Extractor Logic                      //
// ========================================================================== //

// Global state for NBT to Raw tool
let nbtToRawFileContent = '';

// Regexes for command extraction
const nbtToRawPrimaryRegex = /"cmd_line"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
const nbtToRawFallbackRegex = /(setblock|fill)\s+~?-?\d+\s+~?-?\d+\s+~?-?\d+(?:\s+~?-?\d+\s+~?-?\d+\s+~?-?\d+)?\s+minecraft:[\w:]+(?:\[[^\]]*\])?/g;

// Post-processing function for extracted commands
function nbtToRawPostProcessCommands(commands) {
    console.log('NBTtoRaw: Starting post-processing...');
    const processed = commands.map(cmd => {
        // Triple backslash quotes seem specific to the Raw->NBT generator, clean them first
        let cleanedCmd = cmd.replace(/\\\\\\\"/g, '"');
        // Then handle standard escaped quotes if they exist
        cleanedCmd = cleanedCmd.replace(/\\\"/g, '"');
        return cleanedCmd.trim();
    });
    console.log(`NBTtoRaw: Finished post-processing ${processed.length} commands.`);
    return processed;
}

// ========================================================================== //
//                  Schematic to Commands Converter Logic                     //
// ========================================================================== //

// Global state for Schematic to Commands tool
let schemFileObject = null; // Store the File object

// VarInt Iterator (Helper for Schematic parsing)
function* varIntIterator(byteArray) {
    let index = 0;
    const dataView = new DataView(byteArray.buffer, byteArray.byteOffset, byteArray.byteLength);

    while (index < byteArray.length) {
        let value = 0;
        let shift = 0;
        let byte;
        do {
            if (index >= byteArray.length) {
                throw new Error("Schem: VarInt reading error: Reached end of buffer unexpectedly.");
            }
            byte = dataView.getUint8(index++);
            value |= (byte & 0x7F) << shift;
            shift += 7;
            if (shift > 35) {
                throw new Error("Schem: VarInt too big (more than 5 bytes)");
            }
        } while ((byte & 0x80) !== 0);
        yield value;
    }
}

// Creates mapping from Palette ID -> BlockState string
function createInvertedPalette(paletteNbt) {
    const inverted = new Map();
    if (!paletteNbt || typeof paletteNbt !== 'object') {
        throw new Error("Schem: Invalid palette format: Expected TAG_COMPOUND object.");
    }
    for (const [blockState, idTagValue] of Object.entries(paletteNbt)) {
        if (typeof idTagValue !== 'number') {
            console.warn(`Schem: Invalid palette entry value for ${blockState}. Skipping.`);
            continue;
        }
        inverted.set(idTagValue, blockState);
    }
    if (inverted.size === 0) {
        console.warn("Schem: Created an empty inverted palette.");
    }
    return inverted;
}

// Ends a run of identical blocks (used by generateCommands)
function endSchemBlockRun(commands, start, end, y, z, dx, dy, dz, blockType) {
    const runLength = end - start + 1;
    if (runLength <= 0) return;

    const startX = Math.floor(dx + start);
    const endX = Math.floor(dx + end);
    const currentY = Math.floor(dy + y);
    const currentZ = Math.floor(dz + z);

    if (typeof blockType !== 'string' || !blockType.includes(':')) {
        console.warn(`Schem: Skipping run due to invalid blockType: ${blockType}`);
        return;
    }

    // Bedrock commands use relative coords implicitly for setblock/fill
    if (runLength >= 3) {
        commands.push(`fill ~${startX} ~${currentY} ~${currentZ} ~${endX} ~${currentY} ~${currentZ} ${blockType}`);
    } else {
        for (let i = start; i <= end; i++) {
            const currentX = Math.floor(dx + i);
            commands.push(`setblock ~${currentX} ~${currentY} ~${currentZ} ${blockType}`);
        }
    }
}

// Main command generation function for Schematics
function generateSchemCommands(schematicData, dims, offset, includeAir) {
    if (!Array.isArray(dims) || dims.length !== 3 || dims.some(d => typeof d !== 'number' || d <= 0)) {
        throw new Error(`Schem: Invalid dimensions: ${JSON.stringify(dims)}.`);
    }
    if (!Array.isArray(offset) || offset.length !== 3 || offset.some(o => typeof o !== 'number')) {
        throw new Error(`Schem: Invalid offset: ${JSON.stringify(offset)}.`);
    }
    const [width, height, length] = dims.map(Math.floor);
    const [dx, dy, dz] = offset.map(Math.floor);

    let blockData;
    let paletteNbt;

    // Find Palette and BlockData (supporting different nesting)
    if (schematicData.Palette && schematicData.BlockData) {
        paletteNbt = schematicData.Palette;
        blockData = schematicData.BlockData;
    } else if (schematicData.Blocks && typeof schematicData.Blocks === 'object' && schematicData.Blocks.Data && schematicData.Blocks.Palette) {
        paletteNbt = schematicData.Blocks.Palette;
        blockData = schematicData.Blocks.Data; // Assume this is the byte array
    } else {
        console.error("Schem Data Keys:", Object.keys(schematicData));
        throw new Error("Schem: Could not find required keys: 'Palette' and 'BlockData'.");
    }

    if (typeof paletteNbt !== 'object' || paletteNbt === null) {
        throw new Error(`Schem: Invalid Palette type: Expected TAG_COMPOUND, got ${typeof paletteNbt}`);
    }
    if (!(blockData instanceof Uint8Array)) {
        if (Array.isArray(blockData) && blockData.every(b => typeof b === 'number')) {
             console.warn("Schem: BlockData was an Array, converting to Uint8Array.");
             blockData = new Uint8Array(blockData);
        } else {
            throw new Error(`Schem: Invalid BlockData type: Expected TAG_BYTE_ARRAY (Uint8Array), got ${blockData?.constructor?.name || typeof blockData}`);
        }
    }

    const expectedBlockCount = width * height * length;
    const invertedPalette = createInvertedPalette(paletteNbt);
    const iterator = varIntIterator(blockData);
    const commands = [];
    let blockIndex = 0;
    let currentY = 0; // For error reporting
    let currentZ = 0;

    try {
        for (let y = 0; y < height; y++) {
            currentY = y;
            for (let z = 0; z < length; z++) {
                currentZ = z;
                let runStart = null;
                let runBlockType = null;
                for (let x = 0; x < width; x++) {
                    const iteratorResult = iterator.next();
                    if (iteratorResult.done) {
                        console.warn(`Schem: BlockData stream ended prematurely at index ${blockIndex} (x=${x}, y=${y}, z=${z}). Expected ${expectedBlockCount}.`);
                        if (runStart !== null) endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                        throw new Error(`Schem: Ran out of block data at index ${blockIndex}. Expected ${expectedBlockCount}.`);
                    }
                    const paletteIndex = iteratorResult.value;
                    blockIndex++;

                    if (!invertedPalette.has(paletteIndex)) {
                        console.warn(`Schem: Palette index ${paletteIndex} not found at (x=${x}, y=${y}, z=${z}). Max index: ${invertedPalette.size - 1}. Skipping.`);
                        if (runStart !== null) {
                            endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                            runStart = null;
                        }
                        continue;
                    }
                    const blockType = invertedPalette.get(paletteIndex);

                    if (!includeAir && blockType === "minecraft:air") {
                        if (runStart !== null) {
                            endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                            runStart = null;
                        }
                        continue;
                    }

                    if (runStart === null) {
                        runStart = x;
                        runBlockType = blockType;
                    } else if (blockType !== runBlockType) {
                        endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                        runStart = x;
                        runBlockType = blockType;
                    }
                }
                if (runStart !== null) {
                    endSchemBlockRun(commands, runStart, width - 1, y, z, dx, dy, dz, runBlockType);
                }
            }
        }

        if (blockIndex < expectedBlockCount) {
            console.warn(`Schem: Processed ${blockIndex} blocks, expected ${expectedBlockCount}. BlockData might be shorter.`);
        }
        const finalIteratorResult = iterator.next();
        if (!finalIteratorResult.done) {
            console.warn(`Schem: BlockData stream has extra data after processing ${expectedBlockCount} blocks.`);
        }

    } catch (e) {
        console.error(`Schem: Error during command generation loop at approx (y=${currentY}, z=${currentZ}):`, e);
        return commands; // Return partial commands on error
    }

    console.log(`Schem: Generated ${commands.length} commands (Include Air: ${includeAir}). Processed ${blockIndex} block states.`);
    return commands;
}


// ========================================================================== //
//                      Java to Bedrock Translator                            //
// ========================================================================== //

// Global state for Java to Bedrock tool
let javaBedrockFileContent = '';

// NOTE: The actual translation logic is now expected to be globally available
// from translator.js, specifically the `translateCommands` async function.
// This section in script.js only handles the UI interaction.

// ========================================================================== //
//                           UI Interaction Logic                             //
// ========================================================================== //

document.addEventListener('DOMContentLoaded', function() {
    // --- General UI Elements ---
    const hamburgerButton = document.getElementById('hamburger-button');
    const sidebar = document.getElementById('sidebar');
    const sidebarLinks = document.querySelectorAll('#sidebar .tool-link');
    const toolSections = document.querySelectorAll('.tool-section');
    const closeSidebarButton = document.getElementById('close-sidebar-button');

    // --- Tool Specific Elements ---
    // Raw to NBT
    const rawToNbtDropArea = document.getElementById('raw-to-nbt-drop-area');
    const rawToNbtInputFile = document.getElementById('raw-to-nbt-input-file');
    const rawToNbtGenerateButton = document.getElementById('raw-to-nbt-generate-button');
    const rawToNbtNbtTitleInput = document.getElementById('raw-to-nbt-nbt-title');
    const rawToNbtBytesInput = document.getElementById('raw-to-nbt-bytes-per-npc');
    const rawToNbtPreviewArea = document.getElementById('raw-to-nbt-output-preview');
    const rawToNbtPreviewTextarea = document.getElementById('raw-to-nbt-preview-text');
    const rawToNbtDownloadBtn = document.getElementById('raw-to-nbt-download-button');
    const rawToNbtValidationMsg = document.getElementById('raw-to-nbt-validation-message');
    const rawToNbtFileNameDisplay = rawToNbtDropArea ? rawToNbtDropArea.querySelector('span.file-name-display') : null;

    // Commands to Structure
    const cmdStructDropArea = document.getElementById('cmd-struct-drop-area');
    const cmdStructInputFile = document.getElementById('cmd-struct-input-file');
    const cmdStructConvertButton = document.getElementById('cmd-struct-convert-button');
    const cmdStructOutputPreview = document.getElementById('cmd-struct-output-preview');
    const cmdStructPreviewContainer = document.getElementById('cmd-struct-preview-container');
    const cmdStructPreviewText = document.getElementById('cmd-struct-preview-text');
    const cmdStructDownloadButton = document.getElementById('cmd-struct-download-button');
    const cmdStructValidationMessage = document.getElementById('cmd-struct-validation-message');
    const cmdStructFileNameDisplay = cmdStructDropArea ? cmdStructDropArea.querySelector('span.file-name-display') : null;

    // NBT to Raw
    const nbtToRawDropArea = document.getElementById('nbt-raw-drop-area');
    const nbtToRawInputFile = document.getElementById('nbt-raw-input-file');
    const nbtToRawExtractButton = document.getElementById('nbt-raw-extract-button');
    const nbtToRawOutputPreview = document.getElementById('nbt-raw-output-preview');
    const nbtToRawPreviewText = document.getElementById('nbt-raw-preview-text');
    const nbtToRawDownloadButton = document.getElementById('nbt-raw-download-button');
    const nbtToRawValidationMessage = document.getElementById('nbt-raw-validation-message');
    const nbtToRawFilterCheckbox = document.getElementById('nbt-raw-filter-checkbox');
    const nbtToRawFileNameDisplay = nbtToRawDropArea ? nbtToRawDropArea.querySelector('span.file-name-display') : null;


    // Schematic to Commands
    const schemDropArea = document.getElementById('schem-drop-area');
    const schemInputFile = document.getElementById('schem-input-file');
    const schemFileNameDisplay = document.getElementById('schem-file-name'); // Specific ID here
    const schemGenerateButton = document.getElementById('schem-generate-button');
    const schemOutputNameInput = document.getElementById('schem-outputName');
    const schemIncludeAirCheckbox = document.getElementById('schem-includeAir');
    const schemOffsetXInput = document.getElementById('schem-offsetX');
    const schemOffsetYInput = document.getElementById('schem-offsetY');
    const schemOffsetZInput = document.getElementById('schem-offsetZ');
    const schemStatusDiv = document.getElementById('schem-status');

    // Java to Bedrock
    const javaBedrockDropArea = document.getElementById('java-bedrock-drop-area');
    const javaBedrockInputFile = document.getElementById('java-bedrock-input-file');
    const javaBedrockTranslateButton = document.getElementById('java-bedrock-translate-button');
    const javaBedrockOutputPreview = document.getElementById('java-bedrock-output-preview');
    const javaBedrockPreviewText = document.getElementById('java-bedrock-preview-text');
    const javaBedrockDownloadButton = document.getElementById('java-bedrock-download-button');
    const javaBedrockValidationMessage = document.getElementById('java-bedrock-validation-message');
    const javaBedrockFileNameDisplay = javaBedrockDropArea ? javaBedrockDropArea.querySelector('span.file-name-display') : null;


    // --- Helper Functions ---
    function showValidationMessage(element, message, type = 'error') {
        if (!element) return;
        element.textContent = message;
        // Reset classes, then add the appropriate one
        element.className = 'validation-message'; // Base class
        element.classList.add(type); // Add 'error', 'success', or 'info' class
        element.style.display = 'block';

        // Auto-hide non-info messages after 5 seconds
        if (type !== 'info') {
            setTimeout(() => {
                 // Only hide if the message hasn't changed in the meantime
                 if (element.style.display === 'block' && element.textContent === message) {
                     element.style.display = 'none';
                 }
            }, 5000);
        }
    }

    function hideValidationMessage(element) {
        if (element) {
            element.textContent = '';
            element.style.display = 'none';
            element.className = 'validation-message'; // Reset classes
        }
    }

    // Generic Drop Area Setup
    function setupDropAreaListeners(dropArea, fileInput, fileNameDisplayElement) {
        if (!dropArea || !fileInput || !fileNameDisplayElement) {
             console.warn("setupDropAreaListeners: Missing required elements for", fileInput?.id);
             return;
        }

        const clickHandler = () => {
            // Allow selecting a new file even if one is loaded
            fileInput.click();
        };
        dropArea.addEventListener('click', clickHandler);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
        });

        dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                fileInput.files = files; // Assign dropped files to the hidden input
                // Manually trigger the 'change' event for consistency with clicks
                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);
            }
        }, false);

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // Generic File Input Change Handler Setup
    function setupFileInputHandler(fileInput, fileContentVarSetter, fileNameDisplayElement, validationElement, allowedTypes = [], handleFileReadFunc) {
         if (!fileInput || !fileNameDisplayElement || !validationElement) {
             console.warn("setupFileInputHandler: Missing required elements for", fileInput?.id);
             return;
         }
        const defaultDisplayText = 'No file selected';

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                let isValid = false;
                const lowerName = file.name.toLowerCase();
                const fileType = file.type;

                if (allowedTypes.length === 0) {
                    isValid = true; // No specific types required
                } else {
                    isValid = allowedTypes.some(type => {
                        if (type.startsWith('.')) {
                             return lowerName.endsWith(type); // Check extension
                        } else {
                             return fileType === type; // Check MIME type
                        }
                    });
                }

                if (isValid) {
                    fileNameDisplayElement.textContent = file.name + ' loaded.';
                    hideValidationMessage(validationElement);
                    // Call the specific file reading function for this tool
                    handleFileReadFunc(file, fileContentVarSetter);
                } else {
                    showValidationMessage(validationElement, `Invalid file type. Expected: ${allowedTypes.join(', ')}`, 'error');
                    fileNameDisplayElement.textContent = defaultDisplayText;
                    fileContentVarSetter(''); // Clear content variable
                    fileInput.value = ''; // Clear the invalid file selection
                }
            } else {
                // No file selected (e.g., user cancelled)
                fileNameDisplayElement.textContent = defaultDisplayText;
                fileContentVarSetter('');
                hideValidationMessage(validationElement);
            }
        });
    }

     // --- Navigation Logic ---
    if (hamburgerButton && sidebar) {
        hamburgerButton.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
        });
    }
    if (closeSidebarButton && sidebar) {
         closeSidebarButton.addEventListener('click', () => {
             sidebar.classList.remove('active');
         });
     }
    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== hamburgerButton && !hamburgerButton.contains(e.target)) {
             sidebar.classList.remove('active');
        }
    });

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetToolId = link.getAttribute('data-tool');

            toolSections.forEach(section => {
                section.classList.remove('active');
                section.style.display = 'none'; // Ensure it's hidden
            });
            sidebarLinks.forEach(s_link => s_link.classList.remove('active')); // Deactivate all sidebar links

            const targetSection = document.getElementById(targetToolId);
            if (targetSection) {
                targetSection.classList.add('active');
                targetSection.style.display = 'block'; // Ensure it's visible
                link.classList.add('active'); // Activate clicked sidebar link
                console.log(`Switched to tool: ${targetToolId}`);
            } else {
                console.error(`Tool section with ID ${targetToolId} not found.`);
            }

            if (sidebar) sidebar.classList.remove('active');
        });
    });

    // --- Initialization: Activate the first tool ---
    toolSections.forEach((section, index) => {
        if (index === 0) {
            section.classList.add('active');
            section.style.display = 'block';
            // Also activate the corresponding sidebar link
            const firstLinkId = section.id;
            const firstLink = document.querySelector(`.tool-link[data-tool="${firstLinkId}"]`);
            if (firstLink) firstLink.classList.add('active');
        } else {
            section.classList.remove('active');
            section.style.display = 'none';
        }
    });


    // ========================================================== //
    //                TOOL SPECIFIC EVENT LISTENERS               //
    // ========================================================== //

    // --- Generic File Reader (Text) ---
    function readFileAsText(file, contentSetter) {
        const reader = new FileReader();
        reader.onload = function(e) {
            contentSetter(e.target.result);
            console.log(`${file.name} read successfully (Text).`);
        };
        reader.onerror = function(e) {
            console.error(`Error reading file ${file.name}:`, e);
            contentSetter(''); // Clear content on error
             // Show error in the specific tool's validation area (handled by caller)
        };
        reader.readAsText(file);
    }

    // --- Generic File Reader (ArrayBuffer) ---
     function readFileAsArrayBuffer(file, objectSetter) { // Renamed setter for clarity
        const reader = new FileReader();
        reader.onload = function(e) {
            // Store the File object itself, not the content directly yet
            objectSetter(file);
            console.log(`${file.name} selected (ArrayBuffer pending read).`);
        };
        reader.onerror = function(e) {
            console.error(`Error preparing file ${file.name} for reading:`, e);
            objectSetter(null); // Clear object on error
            // Show error (handled by caller)
        };
        // We don't read immediately, just store the file object.
        // Reading happens on button click for ArrayBuffer types.
         reader.readAsArrayBuffer(file); // Read but don't store globally yet
    }


    // --- Raw to NBT Setup ---
    if(rawToNbtDropArea) {
        setupDropAreaListeners(rawToNbtDropArea, rawToNbtInputFile, rawToNbtFileNameDisplay);
        setupFileInputHandler(
            rawToNbtInputFile,
            (content) => { rawToNbtFileContent = content; },
            rawToNbtFileNameDisplay,
            rawToNbtValidationMsg,
            ['.txt', 'text/plain'],
            readFileAsText
        );
    }
    if(rawToNbtGenerateButton) {
        rawToNbtGenerateButton.addEventListener('click', () => {
            if (!rawToNbtFileContent) {
                showValidationMessage(rawToNbtValidationMsg, 'Please select a raw commands text file first.', 'error');
                return;
            }
            const nbtTitle = rawToNbtNbtTitleInput.value.trim();
            const maxBytesInput = rawToNbtBytesInput.value.trim();
            let maxBytes;
            try {
                maxBytes = parseInt(maxBytesInput, 10);
                if (isNaN(maxBytes) || maxBytes <= 500) throw new Error("Value must be > 500");
            } catch(e) {
                showValidationMessage(rawToNbtValidationMsg, `Invalid Max Bytes per NPC: ${e.message}`, 'error');
                return;
            }
            hideValidationMessage(rawToNbtValidationMsg);
            showValidationMessage(rawToNbtValidationMsg, 'Generating NBT...', 'info');

            // Use setTimeout to allow UI update before potentially long processing
            setTimeout(() => {
                try {
                    const commands = getUsefulCommands(rawToNbtFileContent);
                    // Separation logic might need adjustment if escapeQuotesForNbt changes equals signs
                    const { normalCommands, equalsCommands } = separateCommands(commands);
                    const nbtName = nbtTitle || 'Blacklight NBT';

                    let combinedNpcData = [];
                    let npcCount = 0;

                    // Process normal commands (assuming specific joiner/format needed)
                    if (normalCommands.length > 0) {
                         const result = processNpcCommandsByBytes(normalCommands, maxBytes, nbtName, npcCount, commandJoinerNormal);
                         if (result.npcData) combinedNpcData.push(result.npcData);
                         npcCount += result.count;
                    }
                    // Process equals commands (if any, assuming different joiner/format)
                    if (equalsCommands.length > 0) {
                        // Assuming equals commands need the same processing logic, just check content
                        console.warn("RawToNBT: 'Equals' command separation heuristic might be inaccurate. Processing all as normal.");
                         const result = processNpcCommandsByBytes(equalsCommands, maxBytes, nbtName, npcCount, commandJoinerNormal); // Use same joiner for now
                         if (result.npcData) combinedNpcData.push(result.npcData);
                         npcCount += result.count;
                    }


                    let nbtOutput = getBlockOpener(nbtName);
                    nbtOutput += combinedNpcData.join(','); // Join NPC blocks with commas
                    nbtOutput += getBlockCloser();

                    rawToNbtPreviewTextarea.value = nbtOutput;
                    rawToNbtPreviewArea.style.display = 'block';
                    rawToNbtDownloadBtn.disabled = false;
                    hideValidationMessage(rawToNbtValidationMsg);
                    showValidationMessage(rawToNbtValidationMsg, `NBT generated with ${npcCount} NPC blocks.`, 'success');

                } catch (e) {
                    console.error("RawToNBT Generation Error:", e);
                    hideValidationMessage(rawToNbtValidationMsg);
                    showValidationMessage(rawToNbtValidationMsg, `Error generating NBT: ${e.message}`, 'error');
                    rawToNbtPreviewArea.style.display = 'none';
                    rawToNbtDownloadBtn.disabled = true;
                }
            }, 50); // 50ms delay
        });
    }
     if(rawToNbtDownloadBtn) {
        rawToNbtDownloadBtn.addEventListener('click', () => {
            const nbtText = rawToNbtPreviewTextarea.value;
            if (!nbtText) {
                showValidationMessage(rawToNbtValidationMsg, 'No NBT data generated to download.', 'error');
                return;
            }
            const nbtTitle = rawToNbtNbtTitleInput.value.trim() || 'Blacklight_NBT';
            const fileName = `Horion ${nbtTitle.replace(/\s+/g, '_')} Build.txt`;

            const blob = new Blob([nbtText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showValidationMessage(rawToNbtValidationMsg, 'NBT file download started.', 'success');
        });
    }

    // --- Commands to Structure Setup ---
    if(cmdStructDropArea) {
        setupDropAreaListeners(cmdStructDropArea, cmdStructInputFile, cmdStructFileNameDisplay);
        setupFileInputHandler(
            cmdStructInputFile,
            (content) => { cmdStructFileContent = content; },
            cmdStructFileNameDisplay,
            cmdStructValidationMessage,
            ['.txt', 'text/plain'],
            readFileAsText
        );
    }
    if (cmdStructConvertButton) {
        cmdStructConvertButton.addEventListener('click', () => {
            if (!cmdStructFileContent) {
                showValidationMessage(cmdStructValidationMessage, 'Please select a commands text file first.', 'error');
                return;
            }
            hideValidationMessage(cmdStructValidationMessage);
            showValidationMessage(cmdStructValidationMessage, 'Processing commands and converting...', 'info');
            cmdStructConvertButton.disabled = true;

            setTimeout(() => {
                try {
                    // 1. Process commands into the block map
                    const processResult = processCmdStructCommands(cmdStructFileContent);
                    if (!processResult.blocksFound) {
                        hideValidationMessage(cmdStructValidationMessage);
                        showValidationMessage(cmdStructValidationMessage, 'No valid blocks found in commands. Check file format or content.', 'error');
                        cmdStructOutputPreview.style.display = 'none';
                        commandsToStructureData = null; // Clear previous data
                        return;
                    }

                    // 2. Convert the block map to structure data object
                    const result = convertToStructureData(); // This function now updates commandsToStructureData internally
                    if (!result.success) {
                        hideValidationMessage(cmdStructValidationMessage);
                        showValidationMessage(cmdStructValidationMessage, result.message || 'Failed to convert processed blocks to structure data.', 'error');
                        cmdStructOutputPreview.style.display = 'none';
                        commandsToStructureData = null; // Clear data on failure
                        return;
                    }

                    // Display results (using the data stored in commandsToStructureData)
                    const previewJson = JSON.stringify(commandsToStructureData, null, 2); // Pretty print JSON
                    cmdStructPreviewText.textContent = previewJson; // Use textContent for preformatted text

                    // Remove old stats if present
                    const existingStats = cmdStructPreviewContainer.querySelector('.alert.alert-info');
                    if (existingStats) existingStats.remove();

                    // Add new stats using data from the result object
                    const statsHtml = `
                    <div class="alert alert-info mt-3 mb-3">
                      <p class="mb-1"><strong>Structure Dimensions:</strong> ${result.dimensions.width}×${result.dimensions.height}×${result.dimensions.depth}</p>
                      <p class="mb-1"><strong>World Origin Offset:</strong> [${result.origin.join(', ')}]</p>
                      <p class="mb-1"><strong>Actual Block Count:</strong> ${result.blockCount}</p>
                      <p class="mb-0"><strong>Unique Block Types (Palette Size):</strong> ${result.paletteCount}</p>
                    </div>`;
                    // Insert stats before the preview text area
                    cmdStructPreviewText.insertAdjacentHTML('beforebegin', statsHtml);

                    cmdStructOutputPreview.style.display = 'block';
                    cmdStructDownloadButton.disabled = false;
                    hideValidationMessage(cmdStructValidationMessage);
                    showValidationMessage(cmdStructValidationMessage, `Conversion successful. Found ${result.blockCount} blocks.`, 'success');

                } catch (e) {
                    console.error("CmdStruct Conversion Error:", e);
                    hideValidationMessage(cmdStructValidationMessage);
                    showValidationMessage(cmdStructValidationMessage, `Error during conversion: ${e.message}`, 'error');
                    cmdStructOutputPreview.style.display = 'none';
                    cmdStructDownloadButton.disabled = true;
                    commandsToStructureData = null; // Clear data on error
                } finally {
                    cmdStructConvertButton.disabled = false; // Re-enable button
                }
            }, 50); // 50ms timeout
        });
    }
    if (cmdStructDownloadButton) {
        cmdStructDownloadButton.addEventListener('click', () => {
            if (!commandsToStructureData || !commandsToStructureData.size || commandsToStructureData.size.some(dim => dim <= 0)) {
                showValidationMessage(cmdStructValidationMessage, 'No valid structure data generated or structure is empty. Convert commands first.', 'error');
                return;
            }
            hideValidationMessage(cmdStructValidationMessage);
            showValidationMessage(cmdStructValidationMessage, 'Creating NBT buffer for .mcstructure file...', 'info');
            cmdStructDownloadButton.disabled = true;


            setTimeout(() => { // Timeout for UI update before potentially slow NBT creation
                try {
                    const nbtBuffer = createNbtBuffer(commandsToStructureData);
                    console.log(`CmdStruct: NBT buffer created, size: ${nbtBuffer.byteLength} bytes.`);

                    const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const fileName = 'converted_structure.mcstructure'; // Standard name
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    hideValidationMessage(cmdStructValidationMessage);
                    showValidationMessage(cmdStructValidationMessage, '.mcstructure file download started!', 'success');

                } catch (bufferError) {
                    console.error("CmdStruct: Error creating/downloading .mcstructure file:", bufferError);
                    hideValidationMessage(cmdStructValidationMessage);
                    showValidationMessage(cmdStructValidationMessage, `Error creating structure file: ${bufferError.message}.`, 'error');
                } finally {
                     cmdStructDownloadButton.disabled = false; // Re-enable button
                }
            }, 100); // 100ms timeout for NBT generation
        });
    }


    // --- NBT to Raw Setup ---
     if(nbtToRawDropArea) {
        setupDropAreaListeners(nbtToRawDropArea, nbtToRawInputFile, nbtToRawFileNameDisplay);
        setupFileInputHandler(
            nbtToRawInputFile,
            (content) => { nbtToRawFileContent = content; },
            nbtToRawFileNameDisplay,
            nbtToRawValidationMessage,
            ['.nbt', '.mcstructure', '.txt', 'text/plain'], // Allow relevant text-based formats
            readFileAsText
        );
    }
     if (nbtToRawExtractButton) {
        nbtToRawExtractButton.addEventListener('click', () => {
            if (!nbtToRawFileContent) {
                showValidationMessage(nbtToRawValidationMessage, 'Please select or drop a file first.', 'error');
                return;
            }
            hideValidationMessage(nbtToRawValidationMessage);
            nbtToRawOutputPreview.style.display = 'none';
            nbtToRawPreviewText.value = '';
            nbtToRawExtractButton.disabled = true;

            showValidationMessage(nbtToRawValidationMessage, 'Extracting commands from text...', 'info');

             setTimeout(() => {
                 try {
                    const data = nbtToRawFileContent;
                    const filterActive = nbtToRawFilterCheckbox.checked;

                    // Find matches using both regexes
                    const cmdLineMatches = Array.from(data.matchAll(nbtToRawPrimaryRegex), match => match[1]);
                    const fallbackMatches = Array.from(data.matchAll(nbtToRawFallbackRegex), match => match[0]); // Use full match here

                    // Combine and let post-processing handle uniqueness and cleaning
                    const rawCommands = [...cmdLineMatches, ...fallbackMatches];

                    let processedCommands = nbtToRawPostProcessCommands(rawCommands);

                    let finalCommands = processedCommands;
                    if (filterActive) {
                        console.log("NBTtoRaw: Filtering for fill/setblock commands.");
                        finalCommands = processedCommands.filter(cmd => {
                            const trimmedCmd = cmd.trim().toLowerCase();
                            return trimmedCmd.startsWith('fill ') || trimmedCmd.startsWith('setblock ');
                        });
                        console.log(`NBTtoRaw: Filtered down to ${finalCommands.length} commands.`);
                    }

                    if (finalCommands.length > 0) {
                        nbtToRawPreviewText.value = finalCommands.join('\n');
                        hideValidationMessage(nbtToRawValidationMessage);
                        showValidationMessage(nbtToRawValidationMessage, `Extracted ${finalCommands.length} unique commands${filterActive ? ' (filtered)' : ''}.`, 'success');
                    } else {
                        nbtToRawPreviewText.value = `// No commands matching the patterns${filterActive ? ' (and filter)' : ''} were found in the text file.`;
                        hideValidationMessage(nbtToRawValidationMessage);
                        showValidationMessage(nbtToRawValidationMessage, `No matching commands found${filterActive ? ' after filtering' : ''}. Check file content and format.`, 'info');
                    }
                    nbtToRawOutputPreview.style.display = 'block';
                    nbtToRawDownloadButton.disabled = (finalCommands.length === 0);

                } catch (err) {
                    console.error("NBTtoRaw Extraction Error:", err);
                    hideValidationMessage(nbtToRawValidationMessage);
                    showValidationMessage(nbtToRawValidationMessage, `An error occurred during command extraction: ${err.message}`, 'error');
                    nbtToRawOutputPreview.style.display = 'none';
                    nbtToRawDownloadButton.disabled = true;
                } finally {
                     nbtToRawExtractButton.disabled = false;
                 }
            }, 50); // 50ms delay
        });
    }
     if (nbtToRawDownloadButton) {
        nbtToRawDownloadButton.addEventListener('click', () => {
            const textToSave = nbtToRawPreviewText.value;
            if (!textToSave || textToSave.startsWith("// No commands matching")) {
                showValidationMessage(nbtToRawValidationMessage, "No valid command content to download.", 'error');
                return;
            }

            const originalFileName = nbtToRawInputFile.files[0]?.name || 'extracted_commands';
            const baseName = originalFileName.replace(/\.[^/.]+$/, ""); // Remove extension
            const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${baseName}_raw_commands.txt`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            console.log(`NBTtoRaw: Downloaded extracted commands as ${a.download}`);
            showValidationMessage(nbtToRawValidationMessage, 'Raw commands file download started.', 'success');
        });
    }

    // --- Schematic to Commands Setup ---
     function displaySchemStatus(message, type = 'info') {
        if (!schemStatusDiv) return;
        schemStatusDiv.textContent = message;
        schemStatusDiv.className = 'status-message'; // Reset classes
        schemStatusDiv.classList.add(type); // Add 'error', 'success', or 'info'
        schemStatusDiv.style.display = 'block';
    }
     function hideSchemStatus() {
        if(schemStatusDiv) schemStatusDiv.style.display = 'none';
     }

     if (schemDropArea && schemInputFile && schemFileNameDisplay) {
         setupDropAreaListeners(schemDropArea, schemInputFile, schemFileNameDisplay);
         // Special handler setup because we need the File object, not content yet
         schemInputFile.addEventListener('change', (e) => {
             const file = e.target.files[0];
             if (file) {
                const lowerName = file.name.toLowerCase();
                if (lowerName.endsWith('.schem') || lowerName.endsWith('.schematic')) {
                     schemFileObject = file; // Store the File object
                     schemFileNameDisplay.textContent = file.name + ' selected.';
                     hideSchemStatus();
                } else {
                    displaySchemStatus('Invalid file type. Please select a .schem or .schematic file.', 'error');
                    schemFileNameDisplay.textContent = 'No file selected';
                    schemInputFile.value = ''; // Clear invalid selection
                    schemFileObject = null;
                }
            } else {
                schemFileNameDisplay.textContent = 'No file selected';
                schemFileObject = null;
                hideSchemStatus();
            }
         });
     }
     if (schemGenerateButton) {
        schemGenerateButton.addEventListener('click', () => {
            const file = schemFileObject; // Use the stored File object
            const outputNameBase = schemOutputNameInput.value.trim() || 'SchemCommands';
            const includeAir = schemIncludeAirCheckbox.checked;
            const offsetX = parseInt(schemOffsetXInput.value, 10) || 0;
            const offsetY = parseInt(schemOffsetYInput.value, 10) || 0;
            const offsetZ = parseInt(schemOffsetZInput.value, 10) || 0;

            if (!file) {
                displaySchemStatus('Please select a .schem or .schematic file first!', 'error');
                return;
            }

            // Disable button, show status
            displaySchemStatus('Reading schematic file...', 'info');
            schemGenerateButton.disabled = true;

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    displaySchemStatus('Decompressing and parsing NBT...', 'info');
                    const fileData = new Uint8Array(event.target.result);
                    let nbtDataBuffer;

                    // Check for Gzip magic numbers (0x1f, 0x8b)
                    if (fileData.length >= 2 && fileData[0] === 0x1f && fileData[1] === 0x8b) {
                        if (typeof pako === 'undefined') {
                            throw new Error("Pako library is not loaded. Cannot decompress Gzipped schematic.");
                        }
                        console.log("Schem: Detected Gzip compression. Inflating...");
                        const decompressedData = pako.inflate(fileData);
                        nbtDataBuffer = decompressedData.buffer;
                        console.log(`Schem: Decompressed size: ${nbtDataBuffer.byteLength} bytes`);
                    } else {
                         console.log("Schem: File does not appear to be Gzipped. Attempting direct NBT parse.");
                         nbtDataBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength); // Ensure correct ArrayBuffer view
                    }

                     if (!nbtDataBuffer || nbtDataBuffer.byteLength === 0) {
                         throw new Error("Failed to get valid data buffer after potential decompression.");
                     }

                    const schematicNbt = loadSchematicNBT(nbtDataBuffer); // Use shared NBT reader

                    // Extract dimensions (handle potential variations in structure)
                    let width, height, length, dataContainerNbt;
                    if (typeof schematicNbt.Width === 'number' && typeof schematicNbt.Height === 'number' && typeof schematicNbt.Length === 'number') {
                        width = schematicNbt.Width; height = schematicNbt.Height; length = schematicNbt.Length; dataContainerNbt = schematicNbt;
                    } else if (schematicNbt.Schematic && typeof schematicNbt.Schematic.Width === 'number') { // Handle nested structure
                         width = schematicNbt.Schematic.Width; height = schematicNbt.Schematic.Height; length = schematicNbt.Schematic.Length; dataContainerNbt = schematicNbt.Schematic;
                         console.log("Schem: Detected nested NBT structure for dimensions/data.");
                    } else {
                        console.error("Schem NBT Structure:", JSON.stringify(Object.keys(schematicNbt)));
                        throw new Error("Could not find standard dimension tags (Width, Height, Length) in schematic NBT.");
                    }

                    // Validate dimensions
                    if (width <= 0 || height <= 0 || length <= 0) {
                        throw new Error(`Invalid dimensions found in schematic: W=${width}, H=${height}, L=${length}`);
                    }
                    const dims = [width, height, length];
                    const offset = [offsetX, offsetY, offsetZ];

                    displaySchemStatus(`Generating commands for ${width}x${height}x${length} structure...`, 'info');

                    // Call the command generation function
                    const commands = generateSchemCommands(dataContainerNbt, dims, offset, includeAir);

                    if (commands.length === 0 && processedBlockCount > 0) { // Check if blocks were processed but no commands generated (e.g., all air and includeAir=false)
                        displaySchemStatus('Warning: Schematic processed, but no commands generated (possibly only air).', 'info');
                        return; // Don't trigger download for empty file
                    }
                    if (commands.length === 0 && processedBlockCount === 0) {
                         displaySchemStatus('Warning: No blocks processed and no commands generated. Is the schematic empty?', 'info');
                         return;
                    }

                    // Create and Download Text File
                    const now = new Date();
                    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
                    const commandsText = commands.join('\n');
                    const blob = new Blob([commandsText], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${outputNameBase}_${timestamp}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    displaySchemStatus(`Success! ${commands.length} commands generated and download started.`, 'success');

                } catch (e) {
                    console.error("Schematic Processing Error:", e);
                    displaySchemStatus(`Error: ${e.message}`, 'error');
                } finally {
                    schemGenerateButton.disabled = false; // Re-enable button
                }
            }; // end reader.onload

            reader.onerror = () => {
                displaySchemStatus('Error reading the selected schematic file.', 'error');
                schemGenerateButton.disabled = false;
            };

            // Read the file selected by the user as an ArrayBuffer
            reader.readAsArrayBuffer(file);
        });
    }


    // --- Java to Bedrock Setup (CLIENT-SIDE) ---
     if(javaBedrockDropArea) {
        setupDropAreaListeners(javaBedrockDropArea, javaBedrockInputFile, javaBedrockFileNameDisplay);
        setupFileInputHandler(
            javaBedrockInputFile,
            (content) => { javaBedrockFileContent = content; },
            javaBedrockFileNameDisplay,
            javaBedrockValidationMessage,
            ['.txt', 'text/plain'],
            readFileAsText
        );
    }
     if (javaBedrockTranslateButton) {
        javaBedrockTranslateButton.addEventListener('click', async () => { // Keep async for the translator functions
            if (!javaBedrockFileContent) {
                showValidationMessage(javaBedrockValidationMessage, 'Please select a file with Java commands first.', 'error');
                return;
            }

             // Check if the translator function and maps are loaded
             if (typeof translateCommands !== 'function' || typeof window.javaToUniversalMaps === 'undefined' || typeof window.universalToBedrockMaps === 'undefined') {
                 console.error("Translator function or mapping data not found. Ensure translator.js and mapping scripts are loaded correctly before script.js.");
                 showValidationMessage(javaBedrockValidationMessage, 'Translation components not loaded. Check console.', 'error');
                 return;
             }


            hideValidationMessage(javaBedrockValidationMessage);
            const commands = javaBedrockFileContent.split(/\r?\n/).filter(cmd => cmd.trim().length > 0);
            if (commands.length === 0) {
                showValidationMessage(javaBedrockValidationMessage, 'File contains no valid commands to translate.', 'info');
                return;
            }

            try {
                // Show loading state
                javaBedrockTranslateButton.disabled = true;
                javaBedrockTranslateButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Translating...';
                showValidationMessage(javaBedrockValidationMessage, `Translating ${commands.length} Java commands...`, 'info');

                // --- Direct Client-Side Translation ---
                 // Use a short timeout to allow the UI to update *before* the potentially blocking translation work
                 await new Promise(resolve => setTimeout(resolve, 50));

                 // Call the translation function directly from translator.js
                 const { translatedCommands, errors } = await translateCommands(commands);
                 // ^^^ This function MUST be available globally or imported if using modules

                 hideValidationMessage(javaBedrockValidationMessage); // Clear info message

                 if (errors && errors.length > 0) {
                     console.warn("Java->Bedrock Translation Errors:", errors);
                     // Display first few errors
                     const errorSummary = errors.slice(0, 5).join('; ');
                     showValidationMessage(javaBedrockValidationMessage, `Translation completed with ${errors.length} errors. Check console for details. First few: ${errorSummary}`, 'error'); // Use 'error' type if there were issues
                 } else if (translatedCommands.length > 0) {
                      showValidationMessage(javaBedrockValidationMessage, 'Translation completed successfully!', 'success');
                 } else {
                     showValidationMessage(javaBedrockValidationMessage, 'Translation finished, but no commands were successfully translated.', 'info');
                 }

                 // Display translated commands
                 javaBedrockPreviewText.value = translatedCommands.join('\n');
                 javaBedrockOutputPreview.style.display = 'block';
                 javaBedrockDownloadButton.disabled = translatedCommands.length === 0;

            } catch (error) {
                console.error('Java->Bedrock Client-Side Translation error:', error);
                hideValidationMessage(javaBedrockValidationMessage); // Clear info message
                showValidationMessage(javaBedrockValidationMessage, `Translation Error: ${error.message}`, 'error');
                javaBedrockOutputPreview.style.display = 'none';
                javaBedrockDownloadButton.disabled = true;
            } finally {
                // Reset button state
                javaBedrockTranslateButton.disabled = false;
                javaBedrockTranslateButton.innerHTML = '<i class="fas fa-exchange-alt me-2"></i>Translate Commands';
            }
        });
    }
     if (javaBedrockDownloadButton) {
        javaBedrockDownloadButton.addEventListener('click', () => {
            const commandsText = javaBedrockPreviewText.value;
            if (!commandsText) {
                showValidationMessage(javaBedrockValidationMessage, 'No translated commands to download.', 'error');
                return;
            }
            const originalFileName = javaBedrockInputFile.files[0]?.name || 'java_commands';
            const baseName = originalFileName.replace(/\.[^/.]+$/, ""); // Remove extension
            const fileName = `${baseName}_translated_bedrock.txt`;

            const blob = new Blob([commandsText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showValidationMessage(javaBedrockValidationMessage, 'Bedrock commands file download started.', 'success');
        });
    }


    console.log("Blacklight NBT script initialized successfully.");

}); // End DOMContentLoaded

// --- END OF FILE script.js ---